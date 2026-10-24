import { z } from "zod";
import type { HttpOptions } from "./http.js";
import type { PushoverConfig } from "./server.js";

export type Transport = "stdio" | "http";

export type Config = { pushover: PushoverConfig } & (
  | { transport: "stdio" }
  | { transport: "http"; http: HttpOptions }
);

/** Raw settings from CLI flags. Each falls back to its environment variable. */
export interface ConfigFlags {
  token?: string;
  user?: string;
  defaultDevice?: string;
  defaultSound?: string;
  defaultPriority?: string;
  transport?: string;
  host?: string;
  port?: string;
  authToken?: string;
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

const required = (message: string) => z.string({ error: message }).min(1, { error: message });

const PRIORITY_ERROR = "Default priority must be -2, -1, 0 or 1.";
const PORT_ERROR = "Port must be an integer from 0 to 65535.";

const pushoverSchema = z.object({
  token: required("Missing Pushover app token: set PUSHOVER_TOKEN or pass --token."),
  user: required("Missing Pushover user key: set PUSHOVER_USER or pass --user."),
  defaults: z.object({
    device: z.string().optional(),
    sound: z.string().optional(),
    priority: z.coerce
      .number({ error: PRIORITY_ERROR })
      .pipe(z.literal([-2, -1, 0, 1], { error: PRIORITY_ERROR }))
      .optional(),
  }),
});

// HTTP settings are only validated when serving HTTP, so a stray PORT can't break stdio.
const transportSchema = z.discriminatedUnion(
  "transport",
  [
    z.object({ transport: z.literal("stdio") }),
    z.object({
      transport: z.literal("http"),
      http: z.object({
        host: z.string().default("127.0.0.1"),
        port: z.coerce
          .number({ error: PORT_ERROR })
          .refine((port) => Number.isInteger(port) && port >= 0 && port <= 65535, PORT_ERROR)
          .default(3000),
        authToken: z.string().optional(),
      }),
    }),
  ],
  { error: 'Transport must be "stdio" or "http".' },
);

const configSchema = z.object({ pushover: pushoverSchema }).and(transportSchema);

/** Resolves configuration from CLI flags, falling back to environment variables. */
export function resolveConfig(flags: ConfigFlags, env: NodeJS.ProcessEnv = process.env): Config {
  const pick = (flag: string | undefined, ...names: string[]) =>
    flag || names.map((name) => env[name]).find(Boolean);

  const result = configSchema.safeParse({
    pushover: {
      token: pick(flags.token, "PUSHOVER_TOKEN"),
      user: pick(flags.user, "PUSHOVER_USER"),
      defaults: {
        device: pick(flags.defaultDevice, "PUSHOVER_DEFAULT_DEVICE"),
        sound: pick(flags.defaultSound, "PUSHOVER_DEFAULT_SOUND"),
        priority: pick(flags.defaultPriority, "PUSHOVER_DEFAULT_PRIORITY"),
      },
    },
    transport: pick(flags.transport, "PUSHOVER_MCP_TRANSPORT") ?? "stdio",
    http: {
      host: pick(flags.host, "PUSHOVER_MCP_HOST"),
      port: pick(flags.port, "PUSHOVER_MCP_PORT", "PORT"),
      authToken: pick(flags.authToken, "PUSHOVER_MCP_AUTH_TOKEN"),
    },
  });

  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.message}`);
    throw new ConfigError(["Invalid configuration:", ...problems].join("\n"));
  }
  return result.data;
}
