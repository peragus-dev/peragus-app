#!/usr/bin/env node

import { startMCPServer, shutdownMCPServer } from './server.mjs';
import { MCPServerConfig } from './types.mjs';
import { logger, createLogger } from './logger.mjs';

/**
 * Parse command line arguments
 */
function parseArgs(): MCPServerConfig {
  const args = process.argv.slice(2);
  const config: MCPServerConfig = {
    transport: 'stdio',
    port: 3001,
    logLevel: 'info',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--transport':
      case '-t':
        const transport = args[++i];
        if (transport === 'stdio' || transport === 'sse') {
          config.transport = transport;
        } else {
          console.error(`Invalid transport: ${transport}. Use 'stdio' or 'sse'.`);
          process.exit(1);
        }
        break;
        
      case '--port':
      case '-p':
        const port = parseInt(args[++i], 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          console.error(`Invalid port: ${args[i]}. Must be between 1 and 65535.`);
          process.exit(1);
        }
        config.port = port;
        break;
        
      case '--log-level':
      case '-l':
        const logLevel = args[++i];
        if (['debug', 'info', 'warn', 'error'].includes(logLevel)) {
          config.logLevel = logLevel as 'debug' | 'info' | 'warn' | 'error';
        } else {
          console.error(`Invalid log level: ${logLevel}. Use 'debug', 'info', 'warn', or 'error'.`);
          process.exit(1);
        }
        break;
        
      case '--srcbooks-dir':
      case '-d':
        config.srcbooksDir = args[++i];
        break;
        
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
        
      case '--version':
      case '-v':
        printVersion();
        process.exit(0);
        break;
        
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return config;
}

/**
 * Print help information
 */
function printHelp(): void {
  console.log(`
Peragus MCP Server - TypeScript Notebook Server

USAGE:
  peragus-mcp-server [OPTIONS]

OPTIONS:
  -t, --transport <TYPE>     Transport type: 'stdio' or 'sse' (default: stdio)
  -p, --port <PORT>          Port for SSE transport (default: 3001)
  -l, --log-level <LEVEL>    Log level: debug, info, warn, error (default: info)
  -d, --srcbooks-dir <DIR>   Custom srcbooks directory path
  -h, --help                 Show this help message
  -v, --version              Show version information

EXAMPLES:
  # Start with stdio transport (for MCP clients)
  peragus-mcp-server

  # Start with SSE transport on custom port
  peragus-mcp-server --transport sse --port 3002

  # Enable debug logging
  peragus-mcp-server --log-level debug

DESCRIPTION:
  The Peragus MCP Server exposes TypeScript notebook functionality through the
  Model Context Protocol (MCP). It provides tools for creating, editing, and
  executing TypeScript/JavaScript notebooks, as well as resources for accessing
  example notebooks and templates.

  When using stdio transport, the server communicates via standard input/output,
  which is suitable for MCP clients. When using SSE transport, the server runs
  as an HTTP server with Server-Sent Events support.
`);
}

/**
 * Print version information
 */
function printVersion(): void {
  // TODO: Read version from package.json
  console.log('Peragus MCP Server v1.0.0');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const config = parseArgs();
    
    // Set up logger with configured level
    const customLogger = createLogger(config.logLevel);
    Object.assign(logger, customLogger);
    
    logger.info('Starting Peragus MCP Server...');
    logger.debug('Configuration:', config);
    
    // Start the server
    const server = await startMCPServer(config);
    
    // Set up graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await shutdownMCPServer(server);
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Keep the process alive for stdio transport
    if (config.transport === 'stdio') {
      // For stdio transport, the server handles the process lifecycle
      logger.info('MCP Server ready (stdio transport)');
    } else {
      logger.info(`MCP Server ready on port ${config.port} (SSE transport)`);
      // Keep process alive for SSE transport
      process.stdin.resume();
    }
    
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}