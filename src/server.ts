import { McpServer } from "@modelcontextprotocol/server";
import { PushoverClient, type PushoverCredentials } from "./pushover/client.js";
import { registerGetLimits, registerListSounds, registerValidateUser } from "./tools/account.js";
import { registerCancelEmergency, registerGetReceipt } from "./tools/receipts.js";
import { registerSendNotification } from "./tools/send-notification.js";
import type { NotificationDefaults, ToolRegistrar } from "./tools/shared.js";
import { VERSION } from "./version.js";

export interface PushoverConfig extends PushoverCredentials {
  defaults?: NotificationDefaults;
}

export interface CreateServerOptions {
  /**
   * Let `send_notification` attach images from the local filesystem.
   * Enable only when the client and server share a machine, as with stdio.
   * @default false
   */
  allowFileAttachments?: boolean;
}

const INSTRUCTIONS = `Sends push notifications to the user's phone and desktop through Pushover.
Notify when a long task finishes or fails, or when you need the user's attention. Lead with the outcome and keep it short.
Use priority 1 for urgent items. Use priority 2 (emergency, repeats until acknowledged) only when the user asks for it.`;

const TOOLS: ToolRegistrar[] = [
  registerSendNotification,
  registerGetReceipt,
  registerCancelEmergency,
  registerListSounds,
  registerValidateUser,
  registerGetLimits,
];

/** Creates an MCP server exposing the Pushover tools. */
export function createServer(config: PushoverConfig, options: CreateServerOptions = {}): McpServer {
  if (!config.token || !config.user) {
    throw new Error("createServer needs a Pushover app token and user key.");
  }
  const server = new McpServer(
    { name: "pushover-mcp", title: "Pushover", version: VERSION },
    { instructions: INSTRUCTIONS },
  );
  const context = {
    client: new PushoverClient(config),
    defaults: config.defaults ?? {},
    allowFileAttachments: options.allowFileAttachments ?? false,
  };
  for (const register of TOOLS) register(server, context);
  return server;
}
