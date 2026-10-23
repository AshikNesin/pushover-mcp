import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";

const env = { PUSHOVER_TOKEN: "env-token", PUSHOVER_USER: "env-user" };

describe("resolveConfig", () => {
  it("reads credentials from the environment and applies defaults", () => {
    expect(resolveConfig({}, env)).toEqual({
      pushover: { token: "env-token", user: "env-user", defaults: {} },
      transport: "stdio",
      http: { host: "127.0.0.1", port: 3000 },
    });
  });

  it("prefers flags over environment variables", () => {
    const config = resolveConfig(
      { token: "flag-token", defaultPriority: "-1" },
      { ...env, PUSHOVER_DEFAULT_PRIORITY: "1", PUSHOVER_DEFAULT_SOUND: "bike" },
    );

    expect(config.pushover).toEqual({
      token: "flag-token",
      user: "env-user",
      defaults: { priority: -1, sound: "bike" },
    });
  });

  it("treats empty values as unset", () => {
    const config = resolveConfig({ token: "" }, { ...env, PUSHOVER_DEFAULT_DEVICE: "" });

    expect(config.pushover.token).toBe("env-token");
    expect(config.pushover.defaults).toEqual({});
  });

  it("falls back to PORT", () => {
    expect(resolveConfig({}, { ...env, PORT: "8080" }).http.port).toBe(8080);
    expect(resolveConfig({}, { ...env, PORT: "8080", PUSHOVER_MCP_PORT: "9090" }).http.port).toBe(
      9090,
    );
  });

  it("lists every problem in one error", () => {
    expect(() => resolveConfig({}, {})).toThrow(
      [
        "Invalid configuration:",
        "  - Missing Pushover app token: set PUSHOVER_TOKEN or pass --token.",
        "  - Missing Pushover user key: set PUSHOVER_USER or pass --user.",
      ].join("\n"),
    );
  });

  it.each([
    [{ defaultPriority: "2" }, "Default priority must be -2, -1, 0 or 1."],
    [{ defaultPriority: "loud" }, "Default priority must be -2, -1, 0 or 1."],
    [{ transport: "sse" }, 'Transport must be "stdio" or "http".'],
    [{ port: "99999" }, "Port must be an integer from 0 to 65535."],
    [{ port: "http" }, "Port must be an integer from 0 to 65535."],
  ])("rejects invalid values: %o", (flags, message) => {
    expect(() => resolveConfig(flags, env)).toThrow(message);
  });

  it("requires an auth token to serve HTTP beyond loopback", () => {
    const flags = { transport: "http", host: "0.0.0.0" };

    expect(() => resolveConfig(flags, env)).toThrow("Refusing to listen on a non-loopback host");
    expect(resolveConfig({ ...flags, authToken: "secret" }, env).http).toEqual({
      host: "0.0.0.0",
      port: 3000,
      authToken: "secret",
    });
  });
});
