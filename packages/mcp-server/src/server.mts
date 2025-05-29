import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerResourceHandlers } from './resources.mjs';
import { registerToolHandlers } from './tools.mjs';
import { MCPServerConfig, MCPServerConfigSchema } from './types.mjs';
import { logger } from './logger.mjs';

/**
 * Creates and configures the MCP server instance
 */
export function createMCPServer(): Server {
  const server = new Server(
    {
      name: 'peragus-notebook-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        resources: {
          subscribe: true,
          listChanged: true,
        },
        tools: {
          listChanged: true,
        },
        logging: {
          level: 'info',
        },
      },
    }
  );

  // Register resource handlers
  registerResourceHandlers(server);

  // Register tool handlers
  registerToolHandlers(server);

  // Register error handlers
  server.onerror = (error: Error) => {
    logger.error('MCP Server Error:', error);
  };

  return server;
}

/**
 * Starts the MCP server with the given configuration
 */
export async function startMCPServer(config: MCPServerConfig): Promise<Server> {
  // Validate configuration
  const validatedConfig = MCPServerConfigSchema.parse(config);
  
  logger.info('Initializing Peragus MCP server...');
  
  // Create server instance
  const server = createMCPServer();
  
  // Create stdio transport
  const transport = new StdioServerTransport();
  
  // Connect server to transport
  await server.connect(transport);
  
  logger.info('Peragus MCP Server started with stdio transport');
  
  return server;
}

/**
 * Gracefully shuts down the MCP server
 */
export async function shutdownMCPServer(server: Server): Promise<void> {
  try {
    await server.close();
    logger.info('Peragus MCP Server shut down gracefully');
  } catch (error) {
    logger.error('Error during MCP server shutdown:', error);
    throw error;
  }
}