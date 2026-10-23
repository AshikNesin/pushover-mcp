import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, resolve } from "node:path";
import type { Attachment } from "./client.js";

/** Pushover rejects attachments larger than 5 MB. */
export const MAX_ATTACHMENT_BYTES = 5_242_880;

export const IMAGE_MIME_TYPES = [
  "image/gif",
  "image/heic",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

const IMAGE_TYPES: Record<string, ImageMimeType> = {
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Reads a local image into an attachment, inferring its MIME type from the extension. */
export async function readAttachment(path: string): Promise<Attachment> {
  const type = IMAGE_TYPES[extname(path).toLowerCase()];
  if (!type) {
    const supported = Object.keys(IMAGE_TYPES).join(", ");
    throw new Error(`Unsupported attachment type "${path}". Supported: ${supported}.`);
  }

  // Check the size before reading, so an oversized file is never loaded into memory.
  // O_NONBLOCK keeps a FIFO from blocking the open, so the isFile() check can reject it.
  const file = await open(expandHome(path), constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stats = await file.stat();
    if (!stats.isFile()) throw new Error(`Attachment "${path}" is not a file.`);
    assertSize(stats.size);
    const data = await file.readFile();
    return { base64: data.toString("base64"), type };
  } finally {
    await file.close();
  }
}

/** Validates an attachment supplied as base64. */
export function base64Attachment(base64: string, type: ImageMimeType): Attachment {
  assertSize(Buffer.byteLength(base64, "base64"));
  return { base64, type };
}

function assertSize(bytes: number): void {
  if (bytes > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachment is ${bytes} bytes; Pushover allows at most ${MAX_ATTACHMENT_BYTES}.`,
    );
  }
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : resolve(path);
}
