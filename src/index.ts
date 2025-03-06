import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Command } from "commander";

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
      version: "2.0.0",
      description: "MCP for sending Pushover notifications",
    });
  }

  private registerTools() {
    this.server.tool(
      "send",
      "Send a notification via Pushover",
      {
        message: z.string().min(1),
        title: z.string().optional(),
        priority: z.number().min(-2).max(2).optional(),
        sound: z.string().optional(),
        url: z.string().url().optional(),
        url_title: z.string().optional(),
        device: z.string().optional(),
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

// Set up Commander CLI
async function main() {
  const program = new Command();
  
  program
    .name('pushover-mcp')
    .description('MCP for sending Pushover notifications')
    .version('2.0.0')
    .requiredOption('--token <token>', 'Pushover application token')
    .requiredOption('--user <user>', 'Pushover user key')
    .action(async (options) => {
      const { token, user } = options;
      let mcp: PushoverMCP | undefined;

      try {
        console.log('Starting Pushover MCP server...');
        mcp = new PushoverMCP();
        await mcp.init({
          token,
          user,
        });
        
        console.log('Pushover MCP server started successfully');
        console.log('Available tools:');
        console.log('  - send: Send a notification via Pushover');
        console.log('\nServer is ready to accept commands...');

        // Handle process signals
        const cleanup = async () => {
          if (mcp) {
            console.log('\nShutting down MCP server...');
            await mcp.close();
            process.exit(0);
          }
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        
        // Keep the process running
        await new Promise(() => {});
      } catch (error) {
        console.error('Error starting Pushover MCP server:', error);
        process.exit(1);
      }
    });

  // Add support for environment variables as a fallback
  if (process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_USER && process.argv.length <= 2) {
    process.argv.push('--token', process.env.PUSHOVER_TOKEN);
    process.argv.push('--user', process.env.PUSHOVER_USER);
  }

  await program.parseAsync(process.argv);
}

// Only run the main function if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
} 
