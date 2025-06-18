import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { createServer } from 'http';
import { nanoid } from 'nanoid';

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
  
  if (validatedConfig.transport === 'http') {
    // Create Express app for HTTP transport
    const app = express();
    app.use(express.json());
    
    // Store server connections by session ID
    const serverConnections = new Map<string, { server: Server; transport: SSEServerTransport }>();
    
    // SSE endpoint at root for MCP communication
    app.get('/', async (req, res) => {
      logger.info('GET request received', { 
        headers: req.headers,
        url: req.url 
      });
      
      // Check if client accepts SSE
      if (!req.headers.accept || !req.headers.accept.includes('text/event-stream')) {
        logger.warn('GET request without SSE accept header', { accept: req.headers.accept });
        res.status(406).send('Not Acceptable');
        return;
      }
      
      // Generate or use existing session ID
      const sessionId = (req.headers['mcp-session-id'] as string) || nanoid();
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('mcp-session-id', sessionId);
      
      
      // Create a new server instance for this connection
      const connectionServer = createMCPServer();
      const transport = new SSEServerTransport('/', res);
      
      serverConnections.set(sessionId, { server: connectionServer, transport });
      await connectionServer.connect(transport);
      
      logger.info(`Client connected via SSE with session: ${sessionId}`);
      
      // Clean up on disconnect
      req.on('close', async () => {
        const connection = serverConnections.get(sessionId);
        if (connection) {
          await connection.server.close();
          serverConnections.delete(sessionId);
        }
        
        logger.info(`Client disconnected: ${sessionId}`);
      });
    });
    
    // Handle POST messages at root
    app.post('/', async (req, res) => {
      try {
        logger.info('POST request received', { 
          headers: req.headers,
          body: req.body 
        });
        
        const sessionId = req.headers['mcp-session-id'] as string;
        
        // Check if this is an initialize request
        const isInitialize = req.body?.method === 'initialize';
        
        if (!sessionId && !isInitialize) {
          res.status(400).json({ error: 'Missing session ID' });
          return;
        }
        
        if (isInitialize && !sessionId) {
          // This is an initialize request without a session - client expects to establish SSE first
          logger.warn('Initialize request received without session ID - client should establish SSE connection first');
          res.status(400).json({ 
            error: 'Session must be established via SSE before sending initialize request',
            details: 'Please connect to the SSE endpoint (GET /) first to establish a session'
          });
          return;
        }
        
        const connection = serverConnections.get(sessionId);
        if (!connection) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }
        
        // Let the transport handle the complete request/response cycle
        await connection.transport.handlePostMessage(req, res);
      } catch (error) {
        logger.error('Error handling POST message:', error);
        // Only send error response if handlePostMessage hasn't already sent a response
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });
    
    // Health check with connection count
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        transport: 'http',
        activeConnections: serverConnections.size
      });
    });
    
    // Start HTTP server
    const httpServer = createServer(app);
    httpServer.listen(validatedConfig.port, () => {
      logger.info(`Peragus MCP Server HTTP transport listening on port ${validatedConfig.port}`);
    });
    
  } else {
    // Use stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Peragus MCP Server started with stdio transport');
  }
  
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