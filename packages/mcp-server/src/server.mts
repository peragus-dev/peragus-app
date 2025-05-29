import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { randomUUID } from 'node:crypto';

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
 * Map to store transports by session ID
 */
const transports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Map to store server instances by session ID
 */
const servers = new Map<string, Server>();

/**
 * Starts the MCP server with the given configuration
 */
export async function startMCPServer(config: MCPServerConfig): Promise<express.Application> {
  // Validate configuration
  const validatedConfig = MCPServerConfigSchema.parse(config);
  
  // Create Express app for HTTP transport
  const app = express();
  app.use(express.json());

  // Handle POST requests for client-to-server communication
  app.post('/mcp', async (req, res) => {
    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;
      let server: Server;

      if (sessionId && transports.has(sessionId)) {
        // Reuse existing transport and server
        transport = transports.get(sessionId)!;
        server = servers.get(sessionId)!;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        const newSessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (sessionId) => {
            logger.info(`New session initialized: ${sessionId}`);
            // Store the transport by session ID
            transports.set(sessionId, transport);
          }
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            logger.info(`Session closed: ${transport.sessionId}`);
            transports.delete(transport.sessionId);
            servers.get(transport.sessionId)?.close();
            servers.delete(transport.sessionId);
          }
        };

        // Create a new server instance for this session
        server = createMCPServer();
        servers.set(newSessionId, server);

        // Connect to the MCP server
        await server.connect(transport);
        logger.info(`Server connected for session: ${newSessionId}`);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided or invalid request',
          },
          id: null,
        });
        return;
      }

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling POST request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Reusable handler for GET and DELETE requests
  const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports.has(sessionId)) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
    } catch (error) {
      logger.error(`Error handling ${req.method} request:`, error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  };

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', handleSessionRequest);

  // Handle DELETE requests for session termination
  app.delete('/mcp', handleSessionRequest);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      transport: 'streamable-http',
      sessions: transports.size,
    });
  });

  const port = validatedConfig.port || 3001;
  
  return new Promise((resolve, reject) => {
    const httpServer = app.listen(port, () => {
      logger.info(`MCP Server started on port ${port} with streamable HTTP transport`);
      logger.info(`Endpoints:`);
      logger.info(`  POST   /mcp     - Client-to-server communication`);
      logger.info(`  GET    /mcp     - Server-to-client notifications (SSE)`);
      logger.info(`  DELETE /mcp     - Session termination`);
      logger.info(`  GET    /health  - Health check`);
      resolve(app);
    });

    httpServer.on('error', reject);
  });
}

/**
 * Gracefully shuts down the MCP server
 */
export async function shutdownMCPServer(_server: express.Application): Promise<void> {
  try {
    // Express apps don't have a close method, but we can clean up transports
    for (const [sessionId] of transports) {
      logger.info(`Closing session: ${sessionId}`);
      servers.get(sessionId)?.close();
      transports.delete(sessionId);
      servers.delete(sessionId);
    }
    logger.info('MCP Server shut down gracefully');
  } catch (error) {
    logger.error('Error during MCP server shutdown:', error);
    throw error;
  }
}