import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

describe("createServer", () => {
  it.each([
    { token: "", user: "user-key" },
    { token: "app-token", user: "" },
  ])("rejects missing credentials: %o", (config) => {
    expect(() => createServer(config)).toThrow("needs a Pushover app token and user key");
  });
});
