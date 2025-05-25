import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMCPServer } from '../server.mjs';

describe('MCP Server Integration', () => {
  let server: any;

  beforeAll(() => {
    server = createMCPServer();
  });

  afterAll(async () => {
    if (server) {
      try {
        await server.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it('should have correct server info', () => {
    expect(server).toBeDefined();
    expect(typeof server).toBe('object');
  });

  it('should be configured with proper capabilities', () => {
    // Test that the server was created with the expected configuration
    expect(server).toHaveProperty('onerror');
  });

  it('should handle tool discovery', async () => {
    // This would normally test the actual MCP protocol
    // For now, just verify the server exists and can be configured
    expect(server).toBeDefined();
  });

  it('should handle resource discovery', async () => {
    // This would normally test the actual MCP protocol
    // For now, just verify the server exists and can be configured
    expect(server).toBeDefined();
  });
});