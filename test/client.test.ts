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
      body: { status: 0, request: "r", user: "invalid", errors: ["user identifier is invalid"] },
    });

    const error = await client.getLimits().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PushoverError);
    expect(error).toMatchObject({
      status: 400,
      errors: ["user identifier is invalid"],
      invalid: ["user"],
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

  it.each([
    ["getReceipt", () => client.getReceipt("rcpt"), "GET", "/1/receipts/rcpt.json", {}],
    [
      "cancelReceipt",
      () => client.cancelReceipt("rcpt"),
      "POST",
      "/1/receipts/rcpt/cancel.json",
      {},
    ],
    [
      "validateUser",
      () => client.validateUser("phone"),
      "POST",
      "/1/users/validate.json",
      { user: "user-key", device: "phone" },
    ],
  ])("%s calls %s %s", async (_, call, method, path, fields) => {
    const fetchMock = mockPushover({ body: { status: 1, request: "r" } });

    await call();

    expect(sentRequest(fetchMock)).toEqual({
      method,
      path,
      fields: { token: "app-token", ...fields },
    });
  });

  it("wraps network failures with their cause", async () => {
    const failure = new TypeError("fetch failed", {
      cause: new Error("getaddrinfo ENOTFOUND api.pushover.net"),
    });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(failure));

    await expect(client.getLimits()).rejects.toMatchObject({
      status: 0,
      message: "Could not reach Pushover: fetch failed (getaddrinfo ENOTFOUND api.pushover.net)",
    });
  });

  it("times out stalled requests", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.getLimits()).rejects.toThrow(
      "Could not reach Pushover: no response within 10s",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
