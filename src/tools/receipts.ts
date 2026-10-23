import { z } from "zod";
import { structuredResult, type ToolRegistrar, toIsoTime } from "./shared.js";

const receiptField = z.string().min(1).describe("Receipt ID returned by send_notification.");
const timestamp = z.iso.datetime().nullable();

const receiptOutput = z.object({
  acknowledged: z.boolean(),
  acknowledged_at: timestamp,
  acknowledged_by: z.string().nullable().describe("User key that acknowledged."),
  acknowledged_by_device: z.string().nullable(),
  last_delivered_at: timestamp,
  expired: z.boolean().describe("True once Pushover has stopped repeating the notification."),
  expires_at: timestamp,
  called_back: z.boolean().describe("True once the callback URL has been called."),
  called_back_at: timestamp,
});

export const registerGetReceipt: ToolRegistrar = (server, { client }) => {
  server.registerTool(
    "get_receipt",
    {
      title: "Get emergency receipt",
      description: "Check whether an emergency (priority 2) notification has been acknowledged.",
      inputSchema: z.object({ receipt: receiptField }),
      outputSchema: receiptOutput,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ receipt }) => {
      const status = await client.getReceipt(receipt);
      return structuredResult({
        acknowledged: status.acknowledged === 1,
        acknowledged_at: toIsoTime(status.acknowledged_at),
        acknowledged_by: status.acknowledged_by || null,
        acknowledged_by_device: status.acknowledged_by_device || null,
        last_delivered_at: toIsoTime(status.last_delivered_at),
        expired: status.expired === 1,
        expires_at: toIsoTime(status.expires_at),
        called_back: status.called_back === 1,
        called_back_at: toIsoTime(status.called_back_at),
      });
    },
  );
};

export const registerCancelEmergency: ToolRegistrar = (server, { client }) => {
  server.registerTool(
    "cancel_emergency",
    {
      title: "Cancel emergency notification",
      description:
        "Stop an emergency (priority 2) notification from repeating. " +
        "Pass a receipt to cancel one notification, or a tag to cancel every active one with that tag.",
      inputSchema: z.object({
        receipt: receiptField.optional(),
        tag: z.string().min(1).optional().describe("Tag given to send_notification."),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ receipt, tag }) => {
      if (!receipt === !tag) throw new Error("Pass exactly one of receipt or tag.");

      if (receipt) await client.cancelReceipt(receipt);
      if (tag) await client.cancelReceiptsByTag(tag);

      const target = receipt ? `receipt ${receipt}` : `tag "${tag}"`;
      return {
        content: [{ type: "text", text: `Cancelled emergency notifications for ${target}.` }],
      };
    },
  );
};
