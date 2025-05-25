import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

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
  
  const server = createMCPServer();

  let transport;
  
  if (validatedConfig.transport === 'stdio') {
    transport = new StdioServerTransport();
  } else if (validatedConfig.transport === 'sse') {
    // For SSE transport, we need to set up an HTTP server
    // This is a simplified implementation - in practice you'd want proper HTTP server setup
    throw new Error('SSE transport not fully implemented yet. Use stdio transport.');
  } else {
    throw new Error(`Unsupported transport: ${validatedConfig.transport}`);
  }

  try {
    await server.connect(transport);
    logger.info(`MCP Server started on ${validatedConfig.transport}`);
    
    return server;
  } catch (error) {
    logger.error('Failed to start MCP server:', error);
    throw error;
  }
}

/**
 * Gracefully shuts down the MCP server
 */
export async function shutdownMCPServer(server: Server): Promise<void> {
  try {
    await server.close();
    logger.info('MCP Server shut down gracefully');
  } catch (error) {
    logger.error('Error during MCP server shutdown:', error);
    throw error;
  }
}