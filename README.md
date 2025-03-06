# Pushover MCP

A [Model Context Protocol](https://modelcontextprotocol.io/introduction) implementation for sending notifications via [Pushover.net](https://pushover.net).

## Overview

This MCP enables AI agents to send notifications through Pushover.net. It implements the MCP specification, allowing seamless integration with MCP-compatible AI systems.

## Configuration

You'll need:
1. An application token from Pushover.net
2. Your user key from Pushover.net

Get these from your [Pushover.net dashboard](https://pushover.net/dashboard).

## Tool Schema

The MCP provides a single tool:

### `send`

Sends a notification via Pushover.

```typescript
{
  message: string;          // Required: The message to send
  title?: string;          // Optional: Message title
  priority?: number;       // Optional: -2 to 2 (-2: lowest, 2: emergency)
  sound?: string;         // Optional: Notification sound
  url?: string;          // Optional: URL to include
  url_title?: string;   // Optional: Title for the URL
  device?: string;     // Optional: Target specific device
}
```


### Example MCP Tool Call

```json
{
  "name": "send",
  "params": {
    "message": "Hello from AI",
    "title": "AI Notification",
    "priority": 1
  }
}
```

## Using with Cursor

### Configuration Options

The Pushover MCP can be configured in two ways:

1. **Command-line arguments**:
   - `--token <token>`: Your Pushover application token
   - `--user <user>`: Your Pushover user key

2. **Environment variables** (fallback):
   - `PUSHOVER_TOKEN`: Your Pushover application token
   - `PUSHOVER_USER`: Your Pushover user key

### Method 1: Install Globally

Run the MCP server using npx:

```bash
npx -y pushover-mcp@latest --token YOUR_TOKEN --user YOUR_USER
```

In your Cursor IDE:

1. Go to `Cursor Settings` > `MCP`
2. Click `+ Add New MCP Server`
3. Fill in the form:
   - Name: `Pushover Notification` (or any name you prefer)
   - Type: `command`
   - Command: `npx -y pushover-mcp@latest --token YOUR_TOKEN --user YOUR_USER`


### Method 2: Project-specific Configuration

Add an `.cursor/mcp.json` file to your project:

```json
{
  "mcpServers": {
    "pushover": {
      "command": "npx",
      "args": [
        "-y",
        "pushover-mcp@latest",
        "--token",
        "YOUR_TOKEN",
        "--user",
        "YOUR_USER"
      ]
    }
  }
}
```


### Using the Tool

Once configured, the Pushover notification tool will be automatically available to the Cursor AI Agent. You can:

1. The tool will be listed under `Available Tools` in MCP settings
2. Agent will automatically use it when relevant
3. You can explicitly ask Agent to send notifications

By default, Agent will ask for approval before sending notifications. Enable "Yolo mode" in settings to allow automatic sending.

![Cursor Agent](media/cursor-agent.png)

## Using with Roo Code
Access the MCP settings by clicking "Edit MCP Settings" in Roo Code settings or using the "Roo Code: Open MCP Config" command in VS Code's command palette.

```json
{
  "mcpServers": {
    "pushover": {
      "command": "npx",
      "args": [
        "-y",
        "pushover-mcp@latest",
        "--token",
        "YOUR_TOKEN",
        "--user",
        "YOUR_USER"
      ]
    }
  }
}
```
3. The Pushover notification tool will be available to Roo Code's AI agents

> **Note:** Replace `YOUR_TOKEN` & `YOUR_USER` with your Pushover credentials.

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build


# Run tests
pnpm test
```

## Debugging the Server

To debug your server, you can use the MCP Inspector.

First build the server:

```bash
pnpm build
```

Run the following command in your terminal:

```bash
# Start MCP Inspector and server with all tools
npx -y @modelcontextprotocol/inspector node dist/index.js --token YOUR_TOKEN --user YOUR_USER
```

The MCP Inspector provides a web interface where you can:
- See available tools
- Test tool calls directly
- View requests and responses
- Debug your MCP server implementation

## License

MIT
