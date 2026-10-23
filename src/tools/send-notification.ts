import { z } from "zod";
import { base64Attachment, readAttachment } from "../pushover/attachment.js";
import type { Attachment, PushoverMessage } from "../pushover/client.js";
import { structuredResult, type ToolContext, type ToolRegistrar } from "./shared.js";

const EMERGENCY = 2;
const EMERGENCY_DEFAULTS = { retry: 60, expire: 3600 };

export const prioritySchema = z.literal([-2, -1, 0, 1, 2]);

const fields = {
  message: z.string().min(1).max(1024).describe("Notification body, up to 1024 characters."),
  title: z.string().max(250).optional().describe("Defaults to the Pushover app name."),
  priority: prioritySchema
    .optional()
    .describe(
      "-2 silent, -1 quiet, 0 normal (default), 1 high (bypasses quiet hours), " +
        "2 emergency (repeats until acknowledged). Use 2 only when the user asks for it.",
    ),
  sound: z.string().optional().describe("Sound name. Call list_sounds for the options."),
  device: z
    .string()
    .optional()
    .describe("Device name to target; join several with commas. Defaults to all devices."),
  url: z.url().max(512).optional().describe("Link shown with the notification."),
  url_title: z.string().max(100).optional().describe("Label for url."),
  html: z
    .boolean()
    .optional()
    .describe("Render <b>, <i>, <u>, <font color> and <a href> tags. Not with monospace."),
  monospace: z
    .boolean()
    .optional()
    .describe("Render the message in a monospace font. Not with html."),
  ttl: z
    .int()
    .positive()
    .optional()
    .describe("Seconds until the notification is deleted from devices. Ignored for priority 2."),
  timestamp: z.iso
    .datetime({ offset: true })
    .optional()
    .describe("ISO 8601 time to display instead of the time Pushover received the message."),
  retry: z
    .int()
    .min(30)
    .optional()
    .describe(`Priority 2 only: seconds between repeats. Default ${EMERGENCY_DEFAULTS.retry}.`),
  expire: z
    .int()
    .positive()
    .max(10800)
    .optional()
    .describe(`Priority 2 only: seconds until repeats stop. Default ${EMERGENCY_DEFAULTS.expire}.`),
  callback: z
    .url()
    .optional()
    .describe("Priority 2 only: public URL Pushover calls when the user acknowledges."),
  tags: z
    .array(z.string().min(1))
    .optional()
    .describe("Priority 2 only: labels for cancelling with cancel_emergency."),
  attachment_base64: z.base64().optional().describe("Base64-encoded image, up to 5 MB."),
  attachment_type: z
    .string()
    .optional()
    .describe("MIME type of attachment_base64, e.g. image/png."),
};

const fileField = {
  attachment_path: z
    .string()
    .optional()
    .describe("Path to a local image (jpg, png, gif, webp, heic) to attach, up to 5 MB."),
};

const inputWithFile = z.object({ ...fields, ...fileField });
const inputWithoutFile = z.object(fields);
type SendNotificationInput = z.output<typeof inputWithFile>;

const outputSchema = z.object({
  request: z.string().describe("Pushover request ID."),
  receipt: z
    .string()
    .optional()
    .describe("Emergency receipt ID, for get_receipt and cancel_emergency."),
});

export const registerSendNotification: ToolRegistrar = (server, context) => {
  server.registerTool(
    "send_notification",
    {
      title: "Send notification",
      description:
        "Send a push notification to the user's devices. " +
        "Emergency notifications (priority 2) return a receipt for get_receipt and cancel_emergency.",
      inputSchema: context.allowFileAttachments ? inputWithFile : inputWithoutFile,
      outputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input: SendNotificationInput) => {
      const { request, receipt } = await context.client.sendMessage(
        await toMessage(input, context),
      );
      return structuredResult({ request, receipt });
    },
  );
};

async function toMessage(
  input: SendNotificationInput,
  context: ToolContext,
): Promise<PushoverMessage> {
  assertConsistent(input);

  const { attachment_path, attachment_base64, attachment_type, timestamp, ...rest } = input;
  const priority = rest.priority ?? context.defaults.priority;
  const emergency = priority === EMERGENCY ? EMERGENCY_DEFAULTS : {};

  return {
    ...emergency,
    ...rest,
    priority,
    sound: rest.sound ?? context.defaults.sound,
    device: rest.device ?? context.defaults.device,
    timestamp: timestamp ? Math.floor(Date.parse(timestamp) / 1000) : undefined,
    attachment: await toAttachment(attachment_path, attachment_base64, attachment_type),
  };
}

/** Rejects combinations Pushover would reject or silently ignore. */
function assertConsistent(input: SendNotificationInput): void {
  if (input.html && input.monospace) {
    throw new Error("Use either html or monospace, not both.");
  }
  if (input.url_title && !input.url) {
    throw new Error("url_title requires url.");
  }
  if (!input.attachment_base64 !== !input.attachment_type) {
    throw new Error("attachment_base64 and attachment_type must be used together.");
  }
  if (input.attachment_path && input.attachment_base64) {
    throw new Error("Use either attachment_path or attachment_base64, not both.");
  }
  const emergencyOnly = (["retry", "expire", "callback", "tags"] as const).filter(
    (key) => input[key] !== undefined,
  );
  if (input.priority !== EMERGENCY && emergencyOnly.length > 0) {
    throw new Error(`${emergencyOnly.join(", ")} only apply to priority 2 notifications.`);
  }
}

async function toAttachment(
  path?: string,
  base64?: string,
  type?: string,
): Promise<Attachment | undefined> {
  if (path) return readAttachment(path);
  if (base64 && type) return base64Attachment(base64, type);
  return undefined;
}
