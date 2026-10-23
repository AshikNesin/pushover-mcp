import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { connect, credentials, mockPushover, sentRequest, textOf } from "./helpers.js";

const ok = { status: 1, request: "req-1" };

describe("tool listing", () => {
  it("registers every tool with an input schema", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      "send_notification",
      "get_receipt",
      "cancel_emergency",
      "list_sounds",
      "validate_user",
      "get_limits",
    ]);
  });

  it("offers attachment_path only when file attachments are allowed", async () => {
    const schemaKeys = async (allowFileAttachments: boolean) => {
      const client = await connect(credentials, { allowFileAttachments });
      const { tools } = await client.listTools();
      const send = tools.find((tool) => tool.name === "send_notification");
      return Object.keys(send?.inputSchema.properties ?? {});
    };

    expect(await schemaKeys(true)).toContain("attachment_path");
    expect(await schemaKeys(false)).not.toContain("attachment_path");
  });
});

describe("send_notification", () => {
  const send = async (args: Record<string, unknown>, config = {}) => {
    const client = await connect({ ...credentials, ...config }, { allowFileAttachments: true });
    return client.callTool({ name: "send_notification", arguments: args });
  };

  it("sends the message and returns the request ID", async () => {
    const fetchMock = mockPushover({ body: ok });

    const result = await send({ message: "Done", title: "CI", url: "https://ci.example.com" });

    expect(result.structuredContent).toEqual({ request: "req-1" });
    expect(sentRequest(fetchMock).fields).toMatchObject({
      message: "Done",
      title: "CI",
      url: "https://ci.example.com",
    });
  });

  it("applies configured defaults unless the call overrides them", async () => {
    const fetchMock = mockPushover({ body: ok }, { body: ok });
    const defaults = { defaults: { device: "phone", sound: "bike", priority: 1 as const } };

    await send({ message: "a" }, defaults);
    await send({ message: "b", device: "laptop", priority: -1 }, defaults);

    expect(sentRequest(fetchMock, 0).fields).toMatchObject({
      device: "phone",
      sound: "bike",
      priority: "1",
    });
    expect(sentRequest(fetchMock, 1).fields).toMatchObject({
      device: "laptop",
      sound: "bike",
      priority: "-1",
    });
  });

  it("fills emergency retry and expire, and returns the receipt", async () => {
    const fetchMock = mockPushover({ body: { ...ok, receipt: "rcpt-1" } });

    const result = await send({ message: "Server down", priority: 2, tags: ["outage"] });

    expect(result.structuredContent).toEqual({ request: "req-1", receipt: "rcpt-1" });
    expect(sentRequest(fetchMock).fields).toMatchObject({
      priority: "2",
      retry: "60",
      expire: "3600",
      tags: "outage",
    });
  });

  it("converts timestamp to Unix seconds", async () => {
    const fetchMock = mockPushover({ body: ok });

    await send({ message: "hi", timestamp: "2026-01-02T03:04:05Z" });

    expect(sentRequest(fetchMock).fields.timestamp).toBe("1767323045");
  });

  it("attaches a local image", async () => {
    const fetchMock = mockPushover({ body: ok });
    const dir = await mkdtemp(join(tmpdir(), "pushover-mcp-"));
    const path = join(dir, "chart.PNG");
    await writeFile(path, "png-bytes");

    await send({ message: "Chart", attachment_path: path });

    expect(sentRequest(fetchMock).fields).toMatchObject({
      attachment_base64: Buffer.from("png-bytes").toString("base64"),
      attachment_type: "image/png",
    });
  });

  it.each([
    [{ html: true, monospace: true }, "Use either html or monospace, not both."],
    [{ url_title: "Open" }, "url_title requires url."],
    [{ attachment_base64: "aGk=" }, "attachment_base64 and attachment_type must be used together."],
    [{ retry: 30, tags: ["x"] }, "retry, tags only apply to priority 2 notifications."],
    [{ attachment_path: "notes.txt" }, 'Unsupported attachment type "notes.txt"'],
    [
      {
        attachment_base64: Buffer.alloc(5_242_881).toString("base64"),
        attachment_type: "image/png",
      },
      "Pushover allows at most 5242880",
    ],
  ])("rejects invalid combinations: %o", async (args, message) => {
    const fetchMock = mockPushover();

    const result = await send({ message: "hi", ...args });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports Pushover errors as tool errors", async () => {
    mockPushover({ status: 400, body: { status: 0, request: "r", errors: ["sound is invalid"] } });

    const result = await send({ message: "hi", sound: "nope" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Pushover API error (HTTP 400): sound is invalid");
  });
});

describe("receipts", () => {
  it("get_receipt reports acknowledgement with ISO timestamps", async () => {
    mockPushover({
      body: {
        ...ok,
        acknowledged: 1,
        acknowledged_at: 1767323045,
        acknowledged_by: "user-key",
        acknowledged_by_device: "phone",
        last_delivered_at: 1767323000,
        expired: 0,
        expires_at: 1767326600,
        called_back: 0,
        called_back_at: 0,
      },
    });
    const client = await connect();

    const result = await client.callTool({ name: "get_receipt", arguments: { receipt: "rcpt" } });

    expect(result.structuredContent).toEqual({
      acknowledged: true,
      acknowledged_at: "2026-01-02T03:04:05.000Z",
      acknowledged_by: "user-key",
      acknowledged_by_device: "phone",
      last_delivered_at: "2026-01-02T03:03:20.000Z",
      expired: false,
      expires_at: "2026-01-02T04:03:20.000Z",
      called_back: false,
      called_back_at: null,
    });
  });

  it("cancel_emergency cancels by receipt or by tag", async () => {
    const fetchMock = mockPushover({ body: ok }, { body: ok });
    const client = await connect();

    await client.callTool({ name: "cancel_emergency", arguments: { receipt: "rcpt" } });
    await client.callTool({ name: "cancel_emergency", arguments: { tag: "outage" } });

    expect(sentRequest(fetchMock, 0).path).toBe("/1/receipts/rcpt/cancel.json");
    expect(sentRequest(fetchMock, 1).path).toBe("/1/receipts/cancel_by_tag/outage.json");
  });

  it("cancel_emergency needs exactly one of receipt or tag", async () => {
    const client = await connect();

    const result = await client.callTool({ name: "cancel_emergency", arguments: {} });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Pass exactly one of receipt or tag.");
  });
});

describe("account tools", () => {
  it("list_sounds returns name and description pairs", async () => {
    mockPushover({ body: { ...ok, sounds: { bike: "Bike", alien: "Alien Alarm (long)" } } });
    const client = await connect();

    const result = await client.callTool({ name: "list_sounds", arguments: {} });

    expect(result.structuredContent).toEqual({
      sounds: [
        { name: "bike", description: "Bike" },
        { name: "alien", description: "Alien Alarm (long)" },
      ],
    });
  });

  it("validate_user returns devices for a valid key", async () => {
    mockPushover({ body: { ...ok, group: 0, devices: ["phone"], licenses: ["iOS"] } });
    const client = await connect();

    const result = await client.callTool({ name: "validate_user", arguments: {} });

    expect(result.structuredContent).toEqual({
      valid: true,
      group: false,
      devices: ["phone"],
      licenses: ["iOS"],
    });
  });

  it("validate_user reports an invalid key without failing", async () => {
    mockPushover({
      status: 400,
      body: { status: 0, request: "r", errors: ["user key is invalid"] },
    });
    const client = await connect();

    const result = await client.callTool({ name: "validate_user", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      valid: false,
      devices: [],
      licenses: [],
      errors: ["user key is invalid"],
    });
  });

  it("get_limits returns the quota and reset time", async () => {
    mockPushover({ body: { ...ok, limit: 10000, remaining: 7496, reset: 1767323045 } });
    const client = await connect();

    const result = await client.callTool({ name: "get_limits", arguments: {} });

    expect(result.structuredContent).toEqual({
      limit: 10000,
      remaining: 7496,
      reset_at: "2026-01-02T03:04:05.000Z",
    });
  });
});
