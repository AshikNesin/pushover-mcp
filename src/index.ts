import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const PushoverConfigSchema = z.object({
  token: z.string().min(1),
  user: z.string().min(1),
});

const NotificationSchema = z.object({
  message: z.string().min(1),
  title: z.string().optional(),
  priority: z.number().min(-2).max(2).optional(),
  sound: z.string().optional(),
  url: z.string().url().optional(),
  url_title: z.string().optional(),
  device: z.string().optional(),
});

export type PushoverConfig = z.infer<typeof PushoverConfigSchema>;
export type Notification = z.infer<typeof NotificationSchema>;

export class PushoverMCP {
  private server: McpServer;
  private config?: PushoverConfig;
  private transport?: StdioServerTransport;

  constructor() {
    this.server = new McpServer({
      name: "pushover",
      version: version,
      description: "MCP for sending Pushover notifications",
    });
  }

  private registerTools() {
    this.server.registerTool(
      "send",
      {
        title: "Send Pushover Notification",
        description: "Send a notification via Pushover",
        inputSchema: {
          message: z.string().min(1),
          title: z.string().optional(),
          priority: z.number().min(-2).max(2).optional(),
          sound: z.string().optional(),
          url: z.string().url().optional(),
          url_title: z.string().optional(),
          device: z.string().optional(),
        },
      },
      async (params) => {
        if (!this.config) {
          throw new Error("Pushover MCP not initialized");
        }

        const formData = new URLSearchParams({
          token: this.config.token,
          user: this.config.user,
          message: params.message,
          ...(params.title && { title: params.title }),
          ...(params.priority && { priority: params.priority.toString() }),
          ...(params.sound && { sound: params.sound }),
          ...(params.url && { url: params.url }),
          ...(params.url_title && { url_title: params.url_title }),
          ...(params.device && { device: params.device }),
        });

        const response = await fetch('https://api.pushover.net/1/messages.json', {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Pushover API error: ${JSON.stringify(error)}`);
        }

        return {
          content: [{ type: "text", text: "Notification sent successfully" }]
        };
      }
    );
  }

  async init(config: PushoverConfig): Promise<void> {
    this.config = PushoverConfigSchema.parse(config);
    this.registerTools();

    // Initialize transport
    this.transport = new StdioServerTransport();

    // Connect server with transport
    await this.server.connect(this.transport);
  }

  async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
    }
  }
}
