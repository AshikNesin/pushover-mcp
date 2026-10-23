import { describe, expect, it, vi } from "vitest";
import { PushoverClient, PushoverError } from "../src/pushover/client.js";
import { credentials, mockPushover, sentRequest } from "./helpers.js";

const client = new PushoverClient(credentials);

describe("PushoverClient", () => {
  it("posts messages as form fields", async () => {
    const fetchMock = mockPushover({ body: { status: 1, request: "req-1", receipt: "rcpt-1" } });

    const result = await client.sendMessage({
      message: "Build passed",
      html: true,
      monospace: false,
      priority: 2,
      retry: 60,
      expire: 600,
      tags: ["ci", "deploy"],
      attachment: { base64: "aGk=", type: "image/png" },
    });

    expect(result).toMatchObject({ request: "req-1", receipt: "rcpt-1" });
    expect(sentRequest(fetchMock)).toEqual({
      method: "POST",
      path: "/1/messages.json",
      fields: {
        token: "app-token",
        user: "user-key",
        message: "Build passed",
        html: "1",
        priority: "2",
        retry: "60",
        expire: "600",
        tags: "ci,deploy",
        attachment_base64: "aGk=",
        attachment_type: "image/png",
      },
    });
  });

  it("sends GET parameters in the query string", async () => {
    const fetchMock = mockPushover({ body: { status: 1, request: "r", sounds: { bike: "Bike" } } });

    await expect(client.listSounds()).resolves.toEqual({ bike: "Bike" });
    expect(sentRequest(fetchMock)).toMatchObject({
      method: "GET",
      path: "/1/sounds.json",
      fields: { token: "app-token" },
    });
  });

  it("encodes path segments", async () => {
    const fetchMock = mockPushover({ body: { status: 1, request: "r" } });

    await client.cancelReceiptsByTag("a/b c");
    expect(sentRequest(fetchMock).path).toBe("/1/receipts/cancel_by_tag/a%2Fb%20c.json");
  });

  it("throws PushoverError with the API's error messages", async () => {
    mockPushover({
      status: 400,
      body: { status: 0, request: "r", errors: ["user identifier is invalid"] },
    });

    const error = await client.getLimits().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PushoverError);
    expect(error).toMatchObject({
      status: 400,
      errors: ["user identifier is invalid"],
      message: "Pushover API error (HTTP 400): user identifier is invalid",
    });
  });

  it("throws PushoverError for non-JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("<html>", { status: 503, statusText: "Service Unavailable" }),
        ),
    );

    await expect(client.getLimits()).rejects.toThrow(
      "Pushover API error (HTTP 503): Service Unavailable",
    );
  });

  it("wraps network failures", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")));

    await expect(client.getLimits()).rejects.toMatchObject({
      status: 0,
      message: "Could not reach Pushover: fetch failed",
    });
  });
});
