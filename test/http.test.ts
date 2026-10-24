import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it, onTestFinished } from "vitest";
import { createHttpHandler, isLoopbackHost } from "../src/http.js";
import { createServer } from "../src/server.js";
import { credentials } from "./helpers.js";

const factory = () => createServer(credentials);
const endpoint = "http://localhost:3000/mcp";

/** A JSON-RPC POST carrying the Host header a real client would send for `url`. */
const post = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: {
      host: new URL(url).host,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });

describe("isLoopbackHost", () => {
  it.each(["localhost", "127.0.0.1", "127.1.2.3", "::1"])("accepts %s", (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  it.each(["0.0.0.0", "192.168.1.10", "127.attacker.example", "localhost.example.com", "::"])(
    "rejects %s",
    (host) => {
      expect(isLoopbackHost(host)).toBe(false);
    },
  );
});

describe("createHttpHandler", () => {
  it("requires an auth token unless loopback-only", () => {
    expect(() => createHttpHandler(factory, { loopbackOnly: false })).toThrow(
      "Refusing to serve beyond loopback without an auth token",
    );
  });

  it("serves only /mcp", async () => {
    const handler = createHttpHandler(factory, { loopbackOnly: true });

    const response = await handler.fetch(post("http://localhost:3000/other"));

    expect(response.status).toBe(404);
  });

  it("accepts local Host and Origin headers", async () => {
    const handler = createHttpHandler(factory, { loopbackOnly: true });

    const response = await handler.fetch(post(endpoint, { origin: "http://localhost:3000" }));

    expect(response.status).toBe(200);
  });

  it("rejects foreign Host headers when bound to loopback", async () => {
    const handler = createHttpHandler(factory, { loopbackOnly: true });

    const response = await handler.fetch(post("http://evil.example.com/mcp"));

    expect(response.status).toBe(403);
  });

  it("rejects cross-origin browser requests", async () => {
    const handler = createHttpHandler(factory, { loopbackOnly: true });

    const response = await handler.fetch(post(endpoint, { origin: "https://evil.example.com" }));

    expect(response.status).toBe(403);
  });

  it.each([
    ["no token", {}],
    ["a wrong token", { authorization: "Bearer wrong" }],
    ["another scheme", { authorization: "Basic secret" }],
  ])("returns 401 for %s", async (_, headers) => {
    const handler = createHttpHandler(factory, { authToken: "secret", loopbackOnly: false });

    const response = await handler.fetch(post("http://mcp.example.com/mcp", headers));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it.each(["secret", "a passphrase with spaces"])(
    "serves MCP clients that send the token %j",
    async (token) => {
      const handler = createHttpHandler(factory, { authToken: token, loopbackOnly: false });
      const transport = new StreamableHTTPClientTransport(new URL("http://mcp.example.com/mcp"), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
        fetch: (input, init) => handler.fetch(new Request(input, init)),
      });
      const client = new Client({ name: "test-client", version: "1.0.0" });
      onTestFinished(async () => {
        await client.close();
        await handler.close();
      });

      await client.connect(transport);
      const { tools } = await client.listTools();

      expect(tools).toHaveLength(6);
    },
  );
});
