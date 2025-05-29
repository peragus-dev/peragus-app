import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MCPClientManager } from './client.mjs';
import { 
  TransportAdapterFactory, 
  type TransportAdapter,
  type TransportPluginConfig 
} from './transport/adapter.mjs';
import { 
  type MCPClientConfig, 
  type MCPServerConfig, 
  type MCPConnection 
} from './types.mjs';
import { ConfigCache, ConfigTransformer } from './smithery/config.mjs';

/**
 * Enhanced MCP Client Configuration
 */
export interface EnhancedMCPClientConfig extends MCPClientConfig {
  plugins?: {
    transport?: TransportPluginConfig;
  };
  experimental?: {
    configCache?: boolean;
    configCacheTTL?: number;
    metricsCollection?: boolean;
  };
}

/**
 * Connection metrics for monitoring
 */
interface ConnectionMetrics {
  createdAt: Date;
  lastUsedAt: Date;
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  transportMetadata: any;
}

/**
 * Enhanced MCP Connection with metrics and adapter
 */
interface EnhancedMCPConnection extends MCPConnection {
  adapter: TransportAdapter;
  metrics: ConnectionMetrics;
}

/**
 * Enhanced MCP Client Manager
 * Extends the base client with Smithery features while maintaining backward compatibility
 */
export class EnhancedMCPClientManager extends MCPClientManager {
  private enhancedConfig: EnhancedMCPClientConfig;
  private configCache?: ConfigCache;
  private enhancedConnections = new Map<string, EnhancedMCPConnection>();
  
  constructor(config: EnhancedMCPClientConfig) {
    super(config);
    this.enhancedConfig = config;
    
    // Initialize config cache if enabled
    if (config.experimental?.configCache) {
      this.configCache = new ConfigCache(config.experimental.configCacheTTL);
    }
  }
  
  /**
   * Create a connection using the enhanced adapter system
   */
  protected async createConnection(serverConfig: MCPServerConfig): Promise<MCPConnection> {
    // Check cache first
    const cacheKey = JSON.stringify(serverConfig);
    const cachedConfig = this.configCache?.get(cacheKey);
    
    let processedConfig = serverConfig;
    if (cachedConfig) {
      processedConfig = cachedConfig as MCPServerConfig;
    } else {
      // Transform config if needed
      if (this.enhancedConfig.plugins?.transport?.smithery?.enabled) {
        processedConfig = ConfigTransformer.toSmithery(serverConfig) as MCPServerConfig;
      }
      this.configCache?.set(cacheKey, processedConfig);
    }
    
    // Create transport adapter
    const adapter = TransportAdapterFactory.create(
      processedConfig,
      this.enhancedConfig.plugins?.transport
    );
    
    const transport = await adapter.create();
    
    // Create client
    const client = new Client({
      name: 'peragus-notebook-client',
      version: '2.0.0' // Bumped version for enhanced client
    }, {
      capabilities: {
        tools: {},
        resources: { subscribe: true }
      }
    });
    
    await client.connect(transport);
    
    // Create enhanced connection
    const enhancedConnection: EnhancedMCPConnection = {
      client,
      transport,
      serverId: serverConfig.name,
      isConnected: () => true, // Will be managed by connection monitor
      close: async () => {
        await adapter.dispose();
        await client.close();
      },
      adapter,
      metrics: {
        createdAt: new Date(),
        lastUsedAt: new Date(),
        requestCount: 0,
        errorCount: 0,
        averageResponseTime: 0,
        transportMetadata: adapter.getMetadata()
      }
    };
    
    // Store enhanced connection
    this.enhancedConnections.set(serverConfig.name, enhancedConnection);
    
    // Set up connection monitoring
    this.setupConnectionMonitoring(enhancedConnection);
    
    return enhancedConnection;
  }
  
  /**
   * Set up connection health monitoring
   */
  private setupConnectionMonitoring(connection: EnhancedMCPConnection): void {
    let isConnected = true;
    
    // Override isConnected to use our monitoring
    connection.isConnected = () => isConnected;
    
    // Monitor connection health
    const checkInterval = setInterval(async () => {
      try {
        // Simple health check - list tools
        await connection.client.listTools();
        isConnected = true;
      } catch (error) {
        isConnected = false;
        console.warn(`Connection ${connection.serverId} health check failed:`, error);
      }
    }, 30000); // Check every 30 seconds
    
    // Clean up on close
    const originalClose = connection.close;
    connection.close = async () => {
      clearInterval(checkInterval);
      await originalClose();
      this.enhancedConnections.delete(connection.serverId);
    };
  }
  
  /**
   * Get enhanced connection metrics
   */
  getConnectionMetrics(serverId: string): ConnectionMetrics | undefined {
    return this.enhancedConnections.get(serverId)?.metrics;
  }
  
  /**
   * Get all connection metrics
   */
  getAllConnectionMetrics(): Record<string, ConnectionMetrics> {
    const metrics: Record<string, ConnectionMetrics> = {};
    for (const [serverId, connection] of this.enhancedConnections) {
      metrics[serverId] = connection.metrics;
    }
    return metrics;
  }
  
  /**
   * Update metrics after a request
   */
  private updateMetrics(
    serverId: string, 
    responseTime: number, 
    isError: boolean = false
  ): void {
    const connection = this.enhancedConnections.get(serverId);
    if (!connection) return;
    
    const metrics = connection.metrics;
    metrics.lastUsedAt = new Date();
    metrics.requestCount++;
    
    if (isError) {
      metrics.errorCount++;
    }
    
    // Update average response time
    metrics.averageResponseTime = 
      (metrics.averageResponseTime * (metrics.requestCount - 1) + responseTime) / 
      metrics.requestCount;
  }
  
  /**
   * Override callTool to add metrics collection
   */
  async callTool(
    serverId: string, 
    toolName: string, 
    args: Record<string, any>
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      const result = await super.callTool(serverId, toolName, args);
      
      if (this.enhancedConfig.experimental?.metricsCollection) {
        this.updateMetrics(serverId, Date.now() - startTime);
      }
      
      return result;
    } catch (error) {
      if (this.enhancedConfig.experimental?.metricsCollection) {
        this.updateMetrics(serverId, Date.now() - startTime, true);
      }
      throw error;
    }
  }
  
  /**
   * Get transport adapter for a connection
   */
  getTransportAdapter(serverId: string): TransportAdapter | undefined {
    return this.enhancedConnections.get(serverId)?.adapter;
  }
  
  /**
   * Enable/disable Smithery features at runtime
   */
  setSmitheryEnabled(serverId: string, enabled: boolean): void {
    const connection = this.enhancedConnections.get(serverId);
    if (!connection) return;
    
    // This would require reconnection with new adapter
    console.log(`Smithery ${enabled ? 'enabled' : 'disabled'} for ${serverId} (requires reconnection)`);
  }
  
  /**
   * Get feature flags status
   */
  getFeatureStatus(): Record<string, any> {
    return {
      smitheryEnabled: this.enhancedConfig.plugins?.transport?.smithery?.enabled || false,
      featureFlags: this.enhancedConfig.plugins?.transport?.featureFlags || {},
      experimental: this.enhancedConfig.experimental || {},
      connections: Object.fromEntries(
        Array.from(this.enhancedConnections.entries()).map(([id, conn]) => [
          id,
          {
            adapter: conn.adapter.getType(),
            metadata: conn.adapter.getMetadata()
          }
        ])
      )
    };
  }
}

/**
 * Factory function to create enhanced MCP client
 */
export async function createEnhancedMCPClient(
  config: EnhancedMCPClientConfig
): Promise<EnhancedMCPClientManager> {
  const client = new EnhancedMCPClientManager(config);
  await client.initialize();
  return client;
}

/**
 * Default enhanced configuration with Smithery disabled
 */
export const defaultEnhancedMCPConfig: EnhancedMCPClientConfig = {
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
  ],
  plugins: {
    transport: {
      smithery: {
        enabled: false // Disabled by default for backward compatibility
      },
      featureFlags: {
        useSmitheryUrl: false,
        enableAdvancedConfig: false,
        enableDotNotation: false
      }
    }
  },
  experimental: {
    configCache: true,
    configCacheTTL: 60000,
    metricsCollection: true
  }
};