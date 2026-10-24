# Changelog

## 2.0.0 (unreleased)

A rewrite on MCP TypeScript SDK v2, implementing the 2026-07-28 MCP spec while still serving older clients. Thanks to [@bcdonadio](https://github.com/bcdonadio) for proposing the spec upgrade in [#6](https://github.com/AshikNesin/pushover-mcp/pull/6).

### Breaking changes

- **`send` is now `send_notification`.** Agents discover the new name automatically; update any prompts or allowlists that name the old tool.
- **Node.js 22 or later is required.**
- **Smithery is no longer supported.** Install with `npx` instead.
- **The library API changed.** `PushoverMCP` with `init()`/`close()` is replaced by `createServer(config)`, which returns an `McpServer`.

Existing v1 configs keep working: `pushover-mcp start --token … --user …` still runs, with a deprecation notice on stderr. To update a config:

```diff
- "args": ["-y", "pushover-mcp@latest", "start", "--token", "YOUR_TOKEN", "--user", "YOUR_USER_KEY"]
+ "args": ["-y", "pushover-mcp@latest"],
+ "env": { "PUSHOVER_TOKEN": "YOUR_TOKEN", "PUSHOVER_USER": "YOUR_USER_KEY" }
```

### New

- `send_notification` covers the whole Pushover message API: `html`, `monospace`, `ttl`, `timestamp`, image attachments, and emergency `retry`, `expire`, `callback` and `tags`. HTML formatting was proposed by [@craigles75](https://github.com/craigles75) in [#9](https://github.com/AshikNesin/pushover-mcp/pull/9).
- New tools: `get_receipt`, `cancel_emergency`, `list_sounds`, `validate_user` and `get_limits`.
- All tools have a title and annotations; all except `cancel_emergency` also have an output schema and return structured content.
- Configuration through environment variables, with defaults for device, sound and priority.
- Optional Streamable HTTP transport (`--transport http`), with localhost-only binding by default, Host and Origin checks, and bearer-token auth.
- Server instructions telling agents when and how to notify.
- Entries for the official MCP Registry (`server.json`) and Glama (`glama.json`).

### Fixed

- Startup messages broke Claude Desktop by writing to stdout. All logs now go to stderr. Reported by [@jtenniswood](https://github.com/jtenniswood) in [#3](https://github.com/AshikNesin/pushover-mcp/issues/3); fix proposed by [@webbrain-one](https://github.com/webbrain-one) in [#10](https://github.com/AshikNesin/pushover-mcp/pull/10).
- Emergency notifications (priority 2) always failed because `retry` and `expire` were never sent. They now default to 60 and 3600 seconds.
- The Docker image exited immediately on start. It now reads its config from env vars, builds in two stages and runs as a non-root user. Flagged by [@punkpeye](https://github.com/punkpeye) in [#4](https://github.com/AshikNesin/pushover-mcp/issues/4).
- The server reports its real version instead of a hardcoded `1.0.0`.

## 1.0.0

- Initial release with the `send` tool.
