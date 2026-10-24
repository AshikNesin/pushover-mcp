import type { McpServer } from "@modelcontextprotocol/server";
import type { Priority, PushoverClient } from "../pushover/client.js";

/** Values applied when a `send_notification` call leaves them out. */
export interface NotificationDefaults {
  device?: string;
  sound?: string;
  /** Emergency (2) is excluded: every send without a priority would repeat until acknowledged. */
  priority?: Exclude<Priority, 2>;
}

export interface ToolContext {
  client: PushoverClient;
  defaults: NotificationDefaults;
  /** Whether `send_notification` may read images from the local filesystem. */
  allowFileAttachments: boolean;
}

export type ToolRegistrar = (server: McpServer, context: ToolContext) => void;

/** Builds a result carrying structured content plus its JSON text, as the spec recommends. */
export function structuredResult<T extends Record<string, unknown>>(structuredContent: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

/** Converts a Pushover Unix timestamp to ISO 8601, mapping the `0` placeholder to `null`. */
export function toIsoTime(seconds: number): string | null {
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}
