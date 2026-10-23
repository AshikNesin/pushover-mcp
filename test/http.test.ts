import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { createHttpHandler } from "../src/http.js";
import { createServer } from "../src/server.js";
import { credentials } from "./helpers.js";

const factory = () => createServer(credentials);
const endpoint = "http://localhost:3000/mcp";

const post = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });

describe("createHttpHandler", () => {
  it("serves only /mcp", async () => {
    const handler = createHttpHandler(factory, { loopbackOnly: true });

    const response = await handler.fetch(post("http://localhost:3000/other"));

    expect(response.status).toBe(404);
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

  it("serves MCP clients that send the token", async () => {
    const handler = createHttpHandler(factory, { authToken: "secret", loopbackOnly: false });
    const transport = new StreamableHTTPClientTransport(new URL("http://mcp.example.com/mcp"), {
      requestInit: { headers: { authorization: "Bearer secret" } },
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    });
    const client = new Client({ name: "test-client", version: "1.0.0" });

    await client.connect(transport);
    const { tools } = await client.listTools();

    expect(tools).toHaveLength(6);
    await client.close();
    await handler.close();
  });
});
