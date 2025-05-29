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
    logLevel: 'info'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
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
        
      case '--storage-dir':
      case '-d':
        config.storageDir = args[++i];
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
  -l, --log-level <LEVEL>    Log level: debug, info, warn, error (default: info)
  -d, --storage-dir <DIR>    Custom storage directory path
  -h, --help                 Show this help message
  -v, --version              Show version information

EXAMPLES:
  # Start server with default settings
  peragus-mcp-server

  # Enable debug logging
  peragus-mcp-server --log-level debug

  # Use custom storage directory
  peragus-mcp-server --storage-dir ~/my-notebooks

DESCRIPTION:
  The Peragus MCP Server exposes TypeScript notebook functionality through the
  Model Context Protocol (MCP) using stdio transport. It provides tools for
  creating, editing, and executing TypeScript/JavaScript notebooks with
  file-based storage.

  Storage location: ~/.peragus-mcp/notebooks/
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
    
    logger.info('MCP Server ready (stdio transport)');
    // Server will keep process alive via stdio transport
    
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
// Always start when running directly or through vite-node
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});