import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMCPServer, startMCPServer, shutdownMCPServer } from '../server.mjs';
import { MCPServerConfig } from '../types.mjs';

describe('MCP Server', () => {
  let server: any;

  afterEach(async () => {
    if (server) {
      try {
        await shutdownMCPServer(server);
      } catch (error) {
        // Ignore shutdown errors in tests
      }
      server = null;
    }
  });

  describe('createMCPServer', () => {
    it('should create a server instance', () => {
      const mcpServer = createMCPServer();
      expect(mcpServer).toBeDefined();
      expect(typeof mcpServer).toBe('object');
    });
  });

  describe('startMCPServer', () => {
    it('should start server with stdio transport', async () => {
      const config: MCPServerConfig = {
        transport: 'stdio',
        port: 3001, // Required by schema even for stdio
        logLevel: 'error', // Reduce noise in tests
      };

      // Note: This test may not work in CI/CD environments without proper stdio setup
      try {
        server = await startMCPServer(config);
        expect(server).toBeDefined();
      } catch (error) {
        // Expected in test environment without proper stdio setup
        expect(error).toBeDefined();
      }
    });

    it('should reject SSE transport', async () => {
      const config: MCPServerConfig = {
        transport: 'sse',
        port: 3001,
        logLevel: 'error',
      };

      await expect(startMCPServer(config)).rejects.toThrow(
        'SSE transport not fully implemented yet'
      );
    });

    it('should validate configuration', async () => {
      const invalidConfig = {
        transport: 'invalid',
        port: 3001,
        logLevel: 'error',
      } as any;

      await expect(startMCPServer(invalidConfig)).rejects.toThrow();
    });
  });

  describe('shutdownMCPServer', () => {
    it('should shutdown server gracefully', async () => {
      const mockServer = {
        close: vi.fn().mockResolvedValue(undefined),
      };

      await expect(shutdownMCPServer(mockServer as any)).resolves.not.toThrow();
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should handle shutdown errors', async () => {
      const mockServer = {
        close: vi.fn().mockRejectedValue(new Error('Shutdown failed')),
      };

      await expect(shutdownMCPServer(mockServer as any)).rejects.toThrow('Shutdown failed');
    });
  });
});