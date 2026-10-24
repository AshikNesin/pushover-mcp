import { createHash, timingSafeEqual } from "node:crypto";
import { createServer as createNodeServer } from "node:http";
import { type AddressInfo, isIPv4 } from "node:net";
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

/** True for `localhost` and loopback IP literals (`127.0.0.0/8`, `::1`). */
export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "::1" || (isIPv4(host) && host.startsWith("127."));
}

/**
 * Wraps the MCP Streamable HTTP handler with routing, DNS-rebinding protection
 * and bearer-token auth. An auth token is required unless `loopbackOnly` is set.
 */
export function createHttpHandler(
  factory: McpServerFactory,
  options: { authToken?: string; loopbackOnly: boolean },
): HttpHandler {
  if (!options.loopbackOnly && !options.authToken) {
    throw new Error(
      "Refusing to serve beyond loopback without an auth token: " +
        "set PUSHOVER_MCP_AUTH_TOKEN or pass --auth-token.",
    );
  }

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
  const header = request.headers.get("authorization") ?? "";
  const scheme = "bearer ";
  return (
    header.toLowerCase().startsWith(scheme) && safeEqual(header.slice(scheme.length), expected)
  );
}

/** Constant-time comparison; hashing first makes the lengths equal. */
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
