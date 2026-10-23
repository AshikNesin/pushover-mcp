import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";

const env = { PUSHOVER_TOKEN: "env-token", PUSHOVER_USER: "env-user" };
const http = { transport: "http" };

describe("resolveConfig", () => {
  it("reads credentials from the environment and defaults to stdio", () => {
    expect(resolveConfig({}, env)).toEqual({
      pushover: { token: "env-token", user: "env-user", defaults: {} },
      transport: "stdio",
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

  it("applies HTTP defaults", () => {
    expect(resolveConfig(http, env)).toMatchObject({
      transport: "http",
      http: { host: "127.0.0.1", port: 3000 },
    });
  });

  it("reads HTTP settings from the environment", () => {
    const config = resolveConfig(
      {},
      {
        ...env,
        PUSHOVER_MCP_TRANSPORT: "http",
        PUSHOVER_MCP_HOST: "0.0.0.0",
        PUSHOVER_MCP_AUTH_TOKEN: "secret",
      },
    );

    expect(config).toMatchObject({
      transport: "http",
      http: { host: "0.0.0.0", port: 3000, authToken: "secret" },
    });
  });

  it("falls back to PORT", () => {
    expect(resolveConfig(http, { ...env, PORT: "8080" })).toMatchObject({ http: { port: 8080 } });
    expect(resolveConfig(http, { ...env, PORT: "8080", PUSHOVER_MCP_PORT: "9090" })).toMatchObject({
      http: { port: 9090 },
    });
  });

  it("ignores HTTP settings over stdio", () => {
    expect(resolveConfig({}, { ...env, PORT: "not-a-port" })).toEqual(resolveConfig({}, env));
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
    [{ ...http, port: "99999" }, "Port must be an integer from 0 to 65535."],
    [{ ...http, port: "http" }, "Port must be an integer from 0 to 65535."],
  ])("rejects invalid values: %o", (flags, message) => {
    expect(() => resolveConfig(flags, env)).toThrow(message);
  });
});
