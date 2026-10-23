import { z } from "zod";
import { PushoverError } from "../pushover/client.js";
import { structuredResult, type ToolRegistrar, toIsoTime } from "./shared.js";

const readOnly = { readOnlyHint: true, idempotentHint: true, openWorldHint: true };

export const registerListSounds: ToolRegistrar = (server, { client }) => {
  server.registerTool(
    "list_sounds",
    {
      title: "List sounds",
      description: "List notification sounds, including custom ones, for send_notification.",
      outputSchema: z.object({
        sounds: z.array(z.object({ name: z.string(), description: z.string() })),
      }),
      annotations: readOnly,
    },
    async () => {
      const sounds = await client.listSounds();
      return structuredResult({
        sounds: Object.entries(sounds).map(([name, description]) => ({ name, description })),
      });
    },
  );
};

export const registerValidateUser: ToolRegistrar = (server, { client }) => {
  server.registerTool(
    "validate_user",
    {
      title: "Validate user and list devices",
      description:
        "Check that the configured user or group key is valid and list its active device names.",
      inputSchema: z.object({
        device: z.string().min(1).optional().describe("Also check that this device exists."),
      }),
      outputSchema: z.object({
        valid: z.boolean(),
        group: z.boolean().optional().describe("True if the key belongs to a delivery group."),
        devices: z.array(z.string()),
        licenses: z.array(z.string()).describe("Platforms the user has licensed."),
        errors: z.array(z.string()).optional(),
      }),
      annotations: readOnly,
    },
    async ({ device }) => {
      try {
        const user = await client.validateUser(device);
        return structuredResult({
          valid: true,
          group: user.group === undefined ? undefined : user.group === 1,
          devices: user.devices,
          licenses: user.licenses,
        });
      } catch (error) {
        // A rejected user or device means "not valid"; anything else, like a bad token, is an error.
        const rejected = error instanceof PushoverError && error.invalid.some(isValidatedField);
        if (!rejected) throw error;
        const errors = error.errors.length > 0 ? error.errors : [error.message];
        return structuredResult({ valid: false, devices: [], licenses: [], errors });
      }
    },
  );
};

function isValidatedField(field: string): boolean {
  return field === "user" || field === "device";
}

export const registerGetLimits: ToolRegistrar = (server, { client }) => {
  server.registerTool(
    "get_limits",
    {
      title: "Get message limits",
      description: "Show the monthly message quota and how many messages remain.",
      outputSchema: z.object({
        limit: z.number(),
        remaining: z.number(),
        reset_at: z.iso.datetime().nullable().describe("When the monthly count resets."),
      }),
      annotations: readOnly,
    },
    async () => {
      const { limit, remaining, reset } = await client.getLimits();
      return structuredResult({ limit, remaining, reset_at: toIsoTime(reset) });
    },
  );
};
