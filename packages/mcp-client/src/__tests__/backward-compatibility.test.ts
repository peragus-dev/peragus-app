import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPClientManager } from '../client.mjs';
import { EnhancedMCPClientManager } from '../enhanced-client.mjs';
import type { MCPClientConfig } from '../types.mjs';

// Mock the SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    listResources: vi.fn().mockResolvedValue({ resources: [] }),
    callTool: vi.fn().mockResolvedValue({ result: 'success' })
  }))
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation((url) => ({
    type: 'http',
    url: url.toString()
  }))
}));

describe('Backward Compatibility', () => {
  const legacyConfig: MCPClientConfig = {
    timeout: 30000,
    maxRetries: 3,
    enableAutoReconnect: true,
    allowPartialFailure: true,
    retryAttempts: 3,
    retryDelay: 1000,
    servers: [
      {
        name: 'test-server',
        transport: 'http',
        url: 'http://localhost:3001'
      }
    ]
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('API Compatibility', () => {
    it('should maintain identical API surface', () => {
      const legacyClient = new MCPClientManager(legacyConfig);
      const enhancedClient = new EnhancedMCPClientManager(legacyConfig);
      
      // Check all public methods exist
      const methods = [
        'initialize',
        'listTools',
        'listResources',
        'callTool',
        'readResource',
        'getConnectionStatus',
        'close',
        'reconnect',
        'getConnection'
      ];
      
      for (const method of methods) {
        expect(typeof (legacyClient as any)[method]).toBe('function');
        expect(typeof (enhancedClient as any)[method]).toBe('function');
      }
    });
    
    it('should work with legacy config without plugins', async () => {
      const client = new EnhancedMCPClientManager(legacyConfig);
      
      // Should not throw
      await expect(client.initialize()).resolves.toBeUndefined();
      
      // Should maintain functionality
      const tools = await client.listTools();
      expect(Array.isArray(tools)).toBe(true);
      
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe(true);
    });
  });
  
  describe('Configuration Compatibility', () => {
    it('should accept all legacy config formats', () => {
      const configs = [
        // Minimal config
        {
          servers: [{
            name: 'server1',
            transport: 'http' as const,
            url: 'http://localhost:3000'
          }]
        },
        // With port instead of URL
        {
          servers: [{
            name: 'server2',
            transport: 'http' as const,
            port: 8080
          }]
        },
        // With all optional fields
        {
          timeout: 60000,
          maxRetries: 5,
          enableAutoReconnect: false,
          allowPartialFailure: false,
          retryAttempts: 10,
          retryDelay: 2000,
          servers: [{
            name: 'server3',
            transport: 'http' as const,
            url: 'http://example.com'
          }]
        }
      ];
      
      for (const config of configs) {
        expect(() => new EnhancedMCPClientManager(config as MCPClientConfig)).not.toThrow();
      }
    });
    
    it('should use legacy transport by default', async () => {
      const client = new EnhancedMCPClientManager(legacyConfig);
      await client.initialize();
      
      const adapter = client.getTransportAdapter('test-server');
      expect(adapter?.getType()).toBe('http-legacy');
      expect(adapter?.getMetadata().provider).toBe('legacy');
    });
  });
  
  describe('Behavior Compatibility', () => {
    it('should handle partial failures identically', async () => {
      const configWithFailure: MCPClientConfig = {
        ...legacyConfig,
        allowPartialFailure: true,
        servers: [
          {
            name: 'good-server',
            transport: 'http',
            url: 'http://localhost:3001'
          },
          {
            name: 'bad-server',
            transport: 'http',
            url: 'http://invalid-server:99999'
          }
        ]
      };
      
      // Mock one connection to fail
      const Client = (await import('@modelcontextprotocol/sdk/client/index.js')).Client as any;
      let callCount = 0;
      Client.mockImplementation(() => ({
        connect: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            return Promise.reject(new Error('Connection failed'));
          }
          return Promise.resolve();
        }),
        close: vi.fn(),
        listTools: vi.fn().mockResolvedValue({ tools: [] })
      }));
      
      const client = new EnhancedMCPClientManager(configWithFailure);
      
      // Should not throw with allowPartialFailure
      await expect(client.initialize()).resolves.toBeUndefined();
      
      const status = client.getConnectionStatus();
      expect(status['good-server']).toBe(true);
      expect(status['bad-server']).toBeUndefined();
    });
    
    it('should maintain tool calling behavior', async () => {
      const client = new EnhancedMCPClientManager(legacyConfig);
      await client.initialize();
      
      const result = await client.callTool('test-server', 'test-tool', { arg: 'value' });
      
      expect(result).toEqual({
        serverId: 'test-server',
        toolName: 'test-tool',
        result: { result: 'success' },
        success: true
      });
    });
  });
  
  describe('Error Handling Compatibility', () => {
    it('should handle connection errors identically', async () => {
      const config: MCPClientConfig = {
        ...legacyConfig,
        allowPartialFailure: false
      };
      
      // Mock connection failure
      const Client = (await import('@modelcontextprotocol/sdk/client/index.js')).Client as any;
      Client.mockImplementation(() => ({
        connect: vi.fn().mockRejectedValue(new Error('Connection refused'))
      }));
      
      const client = new EnhancedMCPClientManager(config);
      
      await expect(client.initialize()).rejects.toThrow('Connection refused');
    });
    
    it('should handle tool validation errors identically', async () => {
      const client = new EnhancedMCPClientManager(legacyConfig);
      await client.initialize();
      
      // Mock tool with schema
      const mockClient = client.getConnection('test-server')?.client;
      mockClient.listTools.mockResolvedValue({
        tools: [{
          name: 'validated-tool',
          inputSchema: {
            type: 'object',
            properties: {
              required_field: { type: 'string' }
            },
            required: ['required_field']
          }
        }]
      });
      
      // Call without required field
      const result = await client.callTool('test-server', 'validated-tool', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required field: required_field');
    });
  });
  
  describe('Migration Path', () => {
    it('should allow gradual feature enablement', async () => {
      // Start with legacy behavior
      const client = new EnhancedMCPClientManager(legacyConfig);
      await client.initialize();
      
      let adapter = client.getTransportAdapter('test-server');
      expect(adapter?.getMetadata().provider).toBe('legacy');
      
      // Enable Smithery features requires reconnection
      await client.close();
      
      // Reinitialize with Smithery enabled
      const enhancedConfig = {
        ...legacyConfig,
        plugins: {
          transport: {
            smithery: { enabled: true },
            featureFlags: {
              useSmitheryUrl: true
            }
          }
        }
      };
      
      const enhancedClient = new EnhancedMCPClientManager(enhancedConfig);
      await enhancedClient.initialize();
      
      adapter = enhancedClient.getTransportAdapter('test-server');
      expect(adapter?.getMetadata().provider).toBe('smithery');
    });
  });
});