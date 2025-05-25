import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { 
  type MCPClientConfig, 
  type MCPServerConfig, 
  type MCPConnection, 
  type MCPTool, 
  type MCPResource,
  type MCPToolCallResult,
  validateArguments 
} from './types.mjs';

/**
 * MCP Client Manager
 * Manages connections to multiple MCP servers and provides a unified interface
 * for tool calling and resource access.
 */
export class MCPClientManager {
  private connections = new Map<string, MCPConnection>();
  private config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  /**
   * Initialize connections to all configured MCP servers
   */
  async initialize(): Promise<void> {
    const connectionPromises = this.config.servers.map(async (serverConfig) => {
      try {
        const connection = await this.createConnection(serverConfig);
        this.connections.set(serverConfig.name, connection);
        console.log(`Connected to MCP server: ${serverConfig.name}`);
      } catch (error) {
        console.error(`Failed to connect to MCP server ${serverConfig.name}:`, error);
        if (!this.config.allowPartialFailure) {
          throw error;
        }
      }
    });

    await Promise.all(connectionPromises);
  }

  /**
   * Create a connection to an MCP server
   */
  private async createConnection(serverConfig: MCPServerConfig): Promise<MCPConnection> {
    let transport: any;

    if (serverConfig.transport === 'stdio') {
      if (!serverConfig.command) {
        throw new Error('Command is required for stdio transport');
      }
      
      // Filter out undefined values from environment
      const cleanEnv: Record<string, string> = {};
      if (serverConfig.env) {
        for (const [key, value] of Object.entries(serverConfig.env)) {
          if (value !== undefined) {
            cleanEnv[key] = value;
          }
        }
      }
      
      transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: { ...process.env as Record<string, string>, ...cleanEnv }
      });
    } else if (serverConfig.transport === 'http') {
      // Use StreamableHttpClientTransport for HTTP connections
      const url = serverConfig.url || `http://localhost:${serverConfig.port || 3000}`;
      transport = new StreamableHTTPClientTransport(new URL(url));
    } else {
      throw new Error(`Unsupported transport: ${serverConfig.transport}`);
    }

    const client = new Client({
      name: 'peragus-notebook-client',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {},
        resources: { subscribe: true }
      }
    });

    await client.connect(transport);

    // Track connection state manually since client doesn't have isConnected method
    let connected = true;
    
    return {
      client,
      transport,
      serverId: serverConfig.name,
      isConnected: () => connected,
      close: async () => {
        connected = false;
        await client.close();
      }
    };
  }

  /**
   * Get all available tools from all connected servers
   */
  async listTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];

    for (const [serverId, connection] of this.connections) {
      if (!connection.isConnected()) continue;

      try {
        const response = await connection.client.listTools();
        const tools = response.tools.map((tool: any) => ({
          ...tool,
          serverId
        }));
        allTools.push(...tools);
      } catch (error) {
        console.error(`Failed to list tools from server ${serverId}:`, error);
      }
    }

    return allTools;
  }

  /**
   * Get all available resources from all connected servers
   */
  async listResources(): Promise<MCPResource[]> {
    const allResources: MCPResource[] = [];

    for (const [serverId, connection] of this.connections) {
      if (!connection.isConnected()) continue;

      try {
        const response = await connection.client.listResources();
        const resources = response.resources.map((resource: any) => ({
          ...resource,
          serverId
        }));
        allResources.push(...resources);
      } catch (error) {
        console.error(`Failed to list resources from server ${serverId}:`, error);
      }
    }

    return allResources;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<MCPToolCallResult> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`No connection found for server: ${serverId}`);
    }

    if (!connection.isConnected()) {
      throw new Error(`Connection to server ${serverId} is not active`);
    }

    // Get tool definition for validation
    const tools = await this.listTools();
    const tool = tools.find(t => t.name === toolName && t.serverId === serverId);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found on server ${serverId}`);
    }

    // Validate arguments
    if (tool.inputSchema) {
      const validation = validateArguments(args, tool.inputSchema);
      if (!validation.valid) {
        throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
      }
    }

    try {
      const response = await connection.client.callTool({
        name: toolName,
        arguments: args
      });

      return {
        serverId,
        toolName,
        result: response,
        success: true
      };
    } catch (error) {
      return {
        serverId,
        toolName,
        result: null,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Read a resource from a specific server
   */
  async readResource(serverId: string, uri: string): Promise<any> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`No connection found for server: ${serverId}`);
    }

    if (!connection.isConnected()) {
      throw new Error(`Connection to server ${serverId} is not active`);
    }

    try {
      const response = await connection.client.readResource({ uri });
      return response;
    } catch (error) {
      console.error(`Failed to read resource ${uri} from server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Get connection status for all servers
   */
  getConnectionStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [serverId, connection] of this.connections) {
      status[serverId] = connection.isConnected();
    }
    return status;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    const closePromises = Array.from(this.connections.values()).map(
      connection => connection.close()
    );
    await Promise.all(closePromises);
    this.connections.clear();
  }

  /**
   * Reconnect to a specific server
   */
  async reconnect(serverId: string): Promise<void> {
    const serverConfig = this.config.servers.find(s => s.name === serverId);
    if (!serverConfig) {
      throw new Error(`Server configuration not found: ${serverId}`);
    }

    // Close existing connection if it exists
    const existingConnection = this.connections.get(serverId);
    if (existingConnection) {
      await existingConnection.close();
      this.connections.delete(serverId);
    }

    // Create new connection
    try {
      const connection = await this.createConnection(serverConfig);
      this.connections.set(serverId, connection);
      console.log(`Reconnected to MCP server: ${serverId}`);
    } catch (error) {
      console.error(`Failed to reconnect to MCP server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific connection (for advanced usage)
   */
  getConnection(serverId: string): MCPConnection | undefined {
    return this.connections.get(serverId);
  }
}

/**
 * Factory function to create and initialize an MCP client manager
 */
export async function createMCPClient(config: MCPClientConfig): Promise<MCPClientManager> {
  const client = new MCPClientManager(config);
  await client.initialize();
  return client;
}

/**
 * Default configuration for local development
 */
export const defaultMCPConfig: MCPClientConfig = {
  timeout: 30000,
  maxRetries: 3,
  enableAutoReconnect: true,
  allowPartialFailure: true,
  retryAttempts: 3,
  retryDelay: 1000,
  servers: [
    {
      name: 'peragus-notebook-server',
      transport: 'http',
      url: 'http://localhost:3001'
    }
  ]
};