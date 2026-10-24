#!/usr/bin/env node
import { parseArgs } from "node:util";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { ConfigError, resolveConfig } from "./config.js";
import { serveHttp } from "./http.js";
import { createServer } from "./server.js";
import { VERSION } from "./version.js";

const HELP = `pushover-mcp ${VERSION} - MCP server for Pushover notifications

Usage: pushover-mcp [options]

Pushover
  --token <token>             App API token            env: PUSHOVER_TOKEN
  --user <key>                User or group key        env: PUSHOVER_USER
  --default-device <name>     Device to target         env: PUSHOVER_DEFAULT_DEVICE
  --default-sound <name>      Notification sound       env: PUSHOVER_DEFAULT_SOUND
  --default-priority <n>      -2 to 1                  env: PUSHOVER_DEFAULT_PRIORITY

Transport
  --transport <stdio|http>    Default: stdio           env: PUSHOVER_MCP_TRANSPORT
  --host <host>               Default: 127.0.0.1       env: PUSHOVER_MCP_HOST
  --port <port>               Default: 3000            env: PUSHOVER_MCP_PORT, PORT
  --auth-token <token>        Bearer token for HTTP    env: PUSHOVER_MCP_AUTH_TOKEN

  Flags are visible in process listings; prefer env vars for secrets.

  -h, --help                  Show this help
  -v, --version               Show the version

Docs: https://github.com/AshikNesin/pushover-mcp#readme`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      token: { type: "string" },
      user: { type: "string" },
      "default-device": { type: "string" },
      "default-sound": { type: "string" },
      "default-priority": { type: "string" },
      transport: { type: "string" },
      host: { type: "string" },
      port: { type: "string" },
      "auth-token": { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.help) return console.log(HELP);
  if (values.version) return console.log(VERSION);

  const [command, ...extra] = positionals;
  const unexpected = command === "start" ? extra[0] : command;
  if (unexpected !== undefined) throw new ConfigError(`Unexpected argument "${unexpected}".`);
  if (command === "start") {
    console.error('[pushover-mcp] "start" is deprecated and no longer needed: run `pushover-mcp`.');
  }

  const config = resolveConfig({
    token: values.token,
    user: values.user,
    defaultDevice: values["default-device"],
    defaultSound: values["default-sound"],
    defaultPriority: values["default-priority"],
    transport: values.transport,
    host: values.host,
    port: values.port,
    authToken: values["auth-token"],
  });

  const factory = () =>
    createServer(config.pushover, { allowFileAttachments: config.transport === "stdio" });

  const handle =
    config.transport === "http"
      ? await serveHttp(factory, config.http)
      : serveStdio(factory, {
          onerror: (error) => console.error(`[pushover-mcp] ${error.message}`),
        });

  const location = "url" in handle ? handle.url : "stdio";
  console.error(`[pushover-mcp] v${VERSION} listening on ${location}`);

  const shutdown = async () => {
    await handle.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[pushover-mcp] ${message}\nRun \`pushover-mcp --help\` for usage.`);
  process.exit(1);
});
