import { describe, it, expect, vi } from 'vitest';
import {
  TransportAdapterFactory,
  LegacyHTTPTransportAdapter,
  SmitheryHTTPTransportAdapter,
  StdioTransportAdapter
} from '../transport/adapter.mjs';
import type { MCPServerConfig } from '../types.mjs';

// Mock the SDK imports
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation((url) => ({
    type: 'http',
    url: url.toString()
  }))
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation((config) => ({
    type: 'stdio',
    command: config.command,
    args: config.args
  }))
}));

describe('Transport Adapters', () => {
  describe('TransportAdapterFactory', () => {
    it('should create legacy HTTP adapter by default', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'http',
        url: 'http://localhost:3000'
      };
      
      const adapter = TransportAdapterFactory.create(config);
      
      expect(adapter).toBeInstanceOf(LegacyHTTPTransportAdapter);
      expect(adapter.getType()).toBe('http-legacy');
    });
    
    it('should create Smithery HTTP adapter when enabled', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'http',
        url: 'http://localhost:3000'
      };
      
      const adapter = TransportAdapterFactory.create(config, {
        smithery: { enabled: true }
      });
      
      expect(adapter).toBeInstanceOf(SmitheryHTTPTransportAdapter);
      expect(adapter.getType()).toBe('http-smithery');
    });
    
    it('should create stdio adapter', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'stdio',
        command: 'node',
        args: ['server.js']
      };
      
      const adapter = TransportAdapterFactory.create(config);
      
      expect(adapter).toBeInstanceOf(StdioTransportAdapter);
      expect(adapter.getType()).toBe('stdio');
    });
    
    it('should throw for unsupported transport', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'unknown' as any
      };
      
      expect(() => TransportAdapterFactory.create(config)).toThrow('Unsupported transport: unknown');
    });
  });
  
  describe('LegacyHTTPTransportAdapter', () => {
    it('should create transport with URL from config', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'http',
        url: 'http://example.com:8080'
      };
      
      const adapter = new LegacyHTTPTransportAdapter(config);
      const transport = await adapter.create();
      
      expect(transport.url).toBe('http://example.com:8080/');
    });
    
    it('should use default URL when not specified', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'http',
        port: 4000
      };
      
      const adapter = new LegacyHTTPTransportAdapter(config);
      const transport = await adapter.create();
      
      expect(transport.url).toBe('http://localhost:4000/');
    });
    
    it('should provide correct metadata', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'http'
      };
      
      const adapter = new LegacyHTTPTransportAdapter(config);
      const metadata = adapter.getMetadata();
      
      expect(metadata).toEqual({
        provider: 'legacy',
        features: ['basic-http'],
        version: '1.0.0'
      });
    });
  });
  
  describe('SmitheryHTTPTransportAdapter', () => {
    it('should use Smithery URL when feature flag enabled', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'http',
        url: 'http://example.com'
      };
      
      const adapter = new SmitheryHTTPTransportAdapter(config, {
        smithery: {
          enabled: true,
          apiKey: 'test-key'
        },
        featureFlags: {
          useSmitheryUrl: true
        }
      });
      
      const transport = await adapter.create();
      
      expect(transport.url).toContain('/mcp');
      expect(transport.url).toContain('api_key=test-key');
    });
    
    it('should fallback to standard URL when feature flag disabled', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'http',
        url: 'http://example.com'
      };
      
      const adapter = new SmitheryHTTPTransportAdapter(config, {
        smithery: { enabled: true }
      });
      
      const transport = await adapter.create();
      
      expect(transport.url).toBe('http://example.com/');
      expect(transport.url).not.toContain('/mcp');
    });
    
    it('should report enabled features in metadata', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'http'
      };
      
      const adapter = new SmitheryHTTPTransportAdapter(config, {
        featureFlags: {
          useSmitheryUrl: true,
          enableAdvancedConfig: true,
          enableDotNotation: true
        }
      });
      
      const metadata = adapter.getMetadata();
      
      expect(metadata.provider).toBe('smithery');
      expect(metadata.features).toContain('smithery-url');
      expect(metadata.features).toContain('advanced-config');
      expect(metadata.features).toContain('dot-notation');
      expect(metadata.version).toBe('2.0.0');
    });
  });
  
  describe('StdioTransportAdapter', () => {
    it('should create stdio transport with command', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'test' }
      };
      
      const adapter = new StdioTransportAdapter(config);
      const transport = await adapter.create();
      
      expect(transport.type).toBe('stdio');
      expect(transport.command).toBe('node');
      expect(transport.args).toEqual(['server.js']);
    });
    
    it('should throw when command is missing', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'stdio'
      };
      
      const adapter = new StdioTransportAdapter(config);
      
      await expect(adapter.create()).rejects.toThrow('Command is required for stdio transport');
    });
    
    it('should filter undefined environment values', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'stdio',
        command: 'node',
        env: {
          DEFINED: 'value',
          UNDEFINED: undefined as any
        }
      };
      
      const adapter = new StdioTransportAdapter(config);
      await adapter.create(); // Should not throw
    });
  });
});