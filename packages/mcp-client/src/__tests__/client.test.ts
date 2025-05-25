import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCPClientManager, createMCPClient, defaultMCPConfig } from '../client.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js');
vi.mock('@modelcontextprotocol/sdk/client/stdio.js');
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js');

const MockClient = vi.mocked(Client);
const MockStdioClientTransport = vi.mocked(StdioClientTransport);
const MockStreamableHTTPClientTransport = vi.mocked(StreamableHTTPClientTransport);

describe('MCPClientManager', () => {
  let mockClient: any;
  let mockTransport: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock instances
    mockTransport = {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      listTools: vi.fn().mockResolvedValue({
        tools: [
          {
            name: 'create-notebook',
            description: 'Create a new notebook',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                language: { type: 'string' }
              },
              required: ['title']
            }
          }
        ]
      }),
      listResources: vi.fn().mockResolvedValue({
        resources: [
          {
            uri: 'notebook://templates',
            name: 'Notebook Templates',
            description: 'Available notebook templates'
          }
        ]
      }),
      callTool: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'Notebook created successfully'
          }
        ]
      }),
      readResource: vi.fn().mockResolvedValue({
        contents: [
          {
            uri: 'notebook://templates',
            mimeType: 'application/json',
            text: JSON.stringify({ templates: ['basic', 'advanced'] })
          }
        ]
      }),
    };

    MockStdioClientTransport.mockImplementation(() => mockTransport);
    MockStreamableHTTPClientTransport.mockImplementation(() => mockTransport);
    MockClient.mockImplementation(() => mockClient);
  });

  describe('initialization', () => {
    it('should initialize with default HTTP configuration', async () => {
      const config = {
        ...defaultMCPConfig,
        servers: [
          {
            name: 'test-server',
            transport: 'http' as const,
            url: 'http://localhost:3001'
          }
        ]
      };

      const clientManager = await createMCPClient(config);

      expect(MockStreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://localhost:3001')
      );
      expect(MockClient).toHaveBeenCalledWith(
        { name: 'peragus-notebook-client', version: '1.0.0' },
        { capabilities: { tools: {}, resources: { subscribe: true } } }
      );
      expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);

      await clientManager.close();
    });

    it('should initialize with stdio configuration', async () => {
      const config = {
        ...defaultMCPConfig,
        servers: [
          {
            name: 'test-server',
            transport: 'stdio' as const,
            command: 'node',
            args: ['server.js'],
            env: { NODE_ENV: 'test' }
          }
        ]
      };

      const clientManager = await createMCPClient(config);

      expect(MockStdioClientTransport).toHaveBeenCalledWith({
        command: 'node',
        args: ['server.js'],
        env: expect.objectContaining({ NODE_ENV: 'test' })
      });

      await clientManager.close();
    });

    it('should handle partial failures when allowPartialFailure is true', async () => {
      const config = {
        ...defaultMCPConfig,
        allowPartialFailure: true,
        servers: [
          {
            name: 'working-server',
            transport: 'http' as const,
            url: 'http://localhost:3001'
          },
          {
            name: 'failing-server',
            transport: 'http' as const,
            url: 'http://localhost:3002'
          }
        ]
      };

      // Make the second connection fail
      let callCount = 0;
      MockClient.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          const failingClient = { ...mockClient };
          failingClient.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));
          return failingClient;
        }
        return mockClient;
      });

      // Should not throw despite one server failing
      const clientManager = await createMCPClient(config);
      
      // Should have one working connection
      const status = clientManager.getConnectionStatus();
      expect(status['working-server']).toBe(true);
      expect(status['failing-server']).toBeUndefined();

      await clientManager.close();
    });

    it('should throw error when allowPartialFailure is false and a server fails', async () => {
      const config = {
        ...defaultMCPConfig,
        allowPartialFailure: false,
        servers: [
          {
            name: 'failing-server',
            transport: 'http' as const,
            url: 'http://localhost:3001'
          }
        ]
      };

      mockClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(createMCPClient(config)).rejects.toThrow('Connection failed');
    });
  });

  describe('tool operations', () => {
    let clientManager: MCPClientManager;

    beforeEach(async () => {
      const config = {
        ...defaultMCPConfig,
        servers: [
          {
            name: 'test-server',
            transport: 'http' as const,
            url: 'http://localhost:3001'
          }
        ]
      };
      clientManager = await createMCPClient(config);
    });

    afterEach(async () => {
      await clientManager.close();
    });

    it('should list tools from all connected servers', async () => {
      const tools = await clientManager.listTools();

      expect(mockClient.listTools).toHaveBeenCalled();
      expect(tools).toEqual([
        {
          name: 'create-notebook',
          description: 'Create a new notebook',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              language: { type: 'string' }
            },
            required: ['title']
          },
          serverId: 'test-server'
        }
      ]);
    });

    it('should call tool with valid arguments', async () => {
      const result = await clientManager.callTool('test-server', 'create-notebook', {
        title: 'My Notebook',
        language: 'typescript'
      });

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'create-notebook',
        arguments: { title: 'My Notebook', language: 'typescript' }
      });

      expect(result).toEqual({
        serverId: 'test-server',
        toolName: 'create-notebook',
        result: {
          content: [
            {
              type: 'text',
              text: 'Notebook created successfully'
            }
          ]
        },
        success: true
      });
    });

    it('should validate tool arguments against schema', async () => {
      // Missing required 'title' field should throw an error
      await expect(
        clientManager.callTool('test-server', 'create-notebook', {
          language: 'typescript'
        })
      ).rejects.toThrow('Invalid arguments: Missing required field: title');
    });

    it('should handle tool execution errors gracefully', async () => {
      mockClient.callTool.mockRejectedValue(new Error('Tool execution failed'));

      const result = await clientManager.callTool('test-server', 'create-notebook', {
        title: 'My Notebook'
      });

      expect(result).toEqual({
        serverId: 'test-server',
        toolName: 'create-notebook',
        result: null,
        success: false,
        error: 'Tool execution failed'
      });
    });

    it('should throw error for non-existent server', async () => {
      await expect(
        clientManager.callTool('non-existent', 'create-notebook', { title: 'Test' })
      ).rejects.toThrow('No connection found for server: non-existent');
    });

    it('should throw error for non-existent tool', async () => {
      await expect(
        clientManager.callTool('test-server', 'non-existent-tool', {})
      ).rejects.toThrow('Tool non-existent-tool not found on server test-server');
    });
  });

  describe('resource operations', () => {
    let clientManager: MCPClientManager;

    beforeEach(async () => {
      const config = {
        ...defaultMCPConfig,
        servers: [
          {
            name: 'test-server',
            transport: 'http' as const,
            url: 'http://localhost:3001'
          }
        ]
      };
      clientManager = await createMCPClient(config);
    });

    afterEach(async () => {
      await clientManager.close();
    });

    it('should list resources from all connected servers', async () => {
      const resources = await clientManager.listResources();

      expect(mockClient.listResources).toHaveBeenCalled();
      expect(resources).toEqual([
        {
          uri: 'notebook://templates',
          name: 'Notebook Templates',
          description: 'Available notebook templates',
          serverId: 'test-server'
        }
      ]);
    });

    it('should read resource from server', async () => {
      const result = await clientManager.readResource('test-server', 'notebook://templates');

      expect(mockClient.readResource).toHaveBeenCalledWith({
        uri: 'notebook://templates'
      });

      expect(result).toEqual({
        contents: [
          {
            uri: 'notebook://templates',
            mimeType: 'application/json',
            text: JSON.stringify({ templates: ['basic', 'advanced'] })
          }
        ]
      });
    });

    it('should throw error for non-existent server when reading resource', async () => {
      await expect(
        clientManager.readResource('non-existent', 'notebook://templates')
      ).rejects.toThrow('No connection found for server: non-existent');
    });
  });

  describe('connection management', () => {
    let clientManager: MCPClientManager;

    beforeEach(async () => {
      const config = {
        ...defaultMCPConfig,
        servers: [
          {
            name: 'test-server',
            transport: 'http' as const,
            url: 'http://localhost:3001'
          }
        ]
      };
      clientManager = await createMCPClient(config);
    });

    afterEach(async () => {
      await clientManager.close();
    });

    it('should return connection status', () => {
      const status = clientManager.getConnectionStatus();
      expect(status).toEqual({
        'test-server': true
      });
    });

    it('should reconnect to a server', async () => {
      await clientManager.reconnect('test-server');

      // Should have closed old connection and created new one
      expect(mockClient.close).toHaveBeenCalled();
      expect(MockClient).toHaveBeenCalledTimes(2); // Initial + reconnect
    });

    it('should throw error when reconnecting to non-configured server', async () => {
      await expect(
        clientManager.reconnect('non-existent')
      ).rejects.toThrow('Server configuration not found: non-existent');
    });

    it('should close all connections', async () => {
      await clientManager.close();
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should get specific connection', () => {
      const connection = clientManager.getConnection('test-server');
      expect(connection).toBeDefined();
      expect(connection?.serverId).toBe('test-server');
      expect(connection?.isConnected()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle transport creation errors', async () => {
      const config = {
        ...defaultMCPConfig,
        allowPartialFailure: false, // Ensure errors are thrown
        servers: [
          {
            name: 'test-server',
            transport: 'invalid' as any,
            url: 'http://localhost:3001'
          }
        ]
      };

      await expect(createMCPClient(config)).rejects.toThrow('Unsupported transport: invalid');
    });

    it('should handle missing command for stdio transport', async () => {
      const config = {
        ...defaultMCPConfig,
        allowPartialFailure: false, // Ensure errors are thrown
        servers: [
          {
            name: 'test-server',
            transport: 'stdio' as const,
            // Missing command
          }
        ]
      };

      await expect(createMCPClient(config)).rejects.toThrow('Command is required for stdio transport');
    });

    it('should handle environment variables correctly', async () => {
      const config = {
        ...defaultMCPConfig,
        servers: [
          {
            name: 'test-server',
            transport: 'stdio' as const,
            command: 'node',
            args: ['server.js'],
            env: {
              NODE_ENV: 'test',
              DEBUG: 'true'
            }
          }
        ]
      };

      await createMCPClient(config);

      expect(MockStdioClientTransport).toHaveBeenCalledWith({
        command: 'node',
        args: ['server.js'],
        env: expect.objectContaining({
          NODE_ENV: 'test',
          DEBUG: 'true'
        })
      });
    });
  });
});