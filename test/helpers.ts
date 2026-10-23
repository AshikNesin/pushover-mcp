import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { type Mock, vi } from "vitest";
import { type CreateServerOptions, createServer, type PushoverConfig } from "../src/server.js";

export const credentials = { token: "app-token", user: "user-key" };

type FetchMock = Mock<typeof fetch>;

/** Stubs global `fetch` to answer with these Pushover responses, in order. */
export function mockPushover(...responses: Array<{ status?: number; body: unknown }>): FetchMock {
  const fetchMock: FetchMock = vi.fn();
  for (const { status = 200, body } of responses) {
    fetchMock.mockResolvedValueOnce(Response.json(body, { status }));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Decodes the request made by the nth `fetch` call. */
export function sentRequest(fetchMock: FetchMock, index = 0) {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`fetch was not called ${index + 1} time(s)`);

  const [input, init] = call;
  const url = new URL(String(input));
  const form = init?.body instanceof URLSearchParams ? init.body : url.searchParams;
  return { method: init?.method, path: url.pathname, fields: Object.fromEntries(form) };
}

/** Connects an MCP client to a fresh server over an in-memory transport. */
export async function connect(
  config: PushoverConfig = credentials,
  options?: CreateServerOptions,
): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await createServer(config, options).connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

/** Returns the text of a tool result's first content block. */
export function textOf(result: { content?: unknown }): string {
  const [first] = (result.content ?? []) as Array<{ type: string; text?: string }>;
  return first?.text ?? "";
}
