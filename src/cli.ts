#!/usr/bin/env node
import { Command } from 'commander';
import { PushoverMCP } from './index.js';

const program = new Command();

program
  .name('pushover-mcp')
  .description('MCP for Pushover.net notifications')
  .version('1.0.0');

program
  .command('start')
  .description('Start the Pushover MCP server')
  .requiredOption('--token <token>', 'Pushover application token')
  .requiredOption('--user <user>', 'Pushover user key')
  .action(async (options) => {
    let mcp: PushoverMCP | undefined;

    try {
      console.log('Starting Pushover MCP server...');
      mcp = new PushoverMCP();
      await mcp.init({
        token: options.token,
        user: options.user,
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
      console.error('Failed to start Pushover MCP server:', error);
      process.exit(1);
    }
  });

program.parse(); 
