#!/usr/bin/env node

import { startMCPServer } from './src/server.mjs';
import { createLogger } from './src/logger.mjs';

const logger = createLogger('info');

async function main() {
  try {
    console.log('Starting MCP Server with HTTP transport...');
    
    const server = await startMCPServer({
      transport: 'http',
      port: 3003,
      logLevel: 'info'
    });
    
    console.log('MCP Server is running on http://localhost:3003');
    console.log('Test with: curl http://localhost:3003/health');
    
    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();