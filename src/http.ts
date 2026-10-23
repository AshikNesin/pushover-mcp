import { createHash, timingSafeEqual } from "node:crypto";
import { createServer as createNodeServer } from "node:http";
import type { AddressInfo } from "node:net";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  type McpServerFactory,
  originValidationResponse,
} from "@modelcontextprotocol/server";

export const MCP_PATH = "/mcp";

export interface HttpOptions {
  host: string;
  port: number;
  /** Bearer token clients must send. Required when binding beyond loopback. */
  authToken?: string;
}

export interface HttpHandler {
  fetch(request: Request): Promise<Response>;
  close(): Promise<void>;
}

export interface HttpServerHandle {
  url: string;
  close(): Promise<void>;
}

export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "::1" || host.startsWith("127.");
}

/**
 * Wraps the MCP Streamable HTTP handler with routing, DNS-rebinding protection
 * and optional bearer-token auth.
 */
export function createHttpHandler(
  factory: McpServerFactory,
  options: { authToken?: string; loopbackOnly: boolean },
): HttpHandler {
  const mcp = createMcpHandler(factory, {
    onerror: (error) => console.error(`[pushover-mcp] ${error.message}`),
  });

  return {
    async fetch(request) {
      if (new URL(request.url).pathname !== MCP_PATH) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      const rejected =
        (options.loopbackOnly
          ? hostHeaderValidationResponse(request, localhostAllowedHostnames())
          : undefined) ?? originValidationResponse(request, localhostAllowedOrigins());
      if (rejected) return rejected;

      if (options.authToken && !hasBearerToken(request, options.authToken)) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="pushover-mcp"' } },
        );
      }
      return mcp.fetch(request);
    },
    close: () => mcp.close(),
  };
}

/** Serves MCP over Streamable HTTP at `http://host:port/mcp`. */
export async function serveHttp(
  factory: McpServerFactory,
  { host, port, authToken }: HttpOptions,
): Promise<HttpServerHandle> {
  const handler = createHttpHandler(factory, { authToken, loopbackOnly: isLoopbackHost(host) });
  const server = createNodeServer(toNodeHandler(handler));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const { port: boundPort } = server.address() as AddressInfo;
  const urlHost = host.includes(":") ? `[${host}]` : host;

  return {
    url: `http://${urlHost}:${boundPort}${MCP_PATH}`,
    async close() {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await closed;
      await handler.close();
    },
  };
}

function hasBearerToken(request: Request, expected: string): boolean {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token !== undefined && safeEqual(token, expected);
}

/** Constant-time comparison; hashing first makes the lengths equal. */
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
