import { MCPClientManager } from './client.mjs';
import { 
  type TransportPluginConfig 
} from './transport/adapter.mjs';
import { 
  type MCPClientConfig,
  type MCPTool,
  type MCPResource
} from './types.mjs';

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
 * Enhanced MCP Client Manager
 * Wraps the base client with Smithery features while maintaining backward compatibility
 */
export class EnhancedMCPClientManager {
  private baseClient: MCPClientManager;
  private enhancedConfig: EnhancedMCPClientConfig;
  private enhancedConnections = new Map<string, any>();
  
  constructor(config: EnhancedMCPClientConfig) {
    this.baseClient = new MCPClientManager(config);
    this.enhancedConfig = config;
    
  }
  
  /**
   * Delegate to base client for listing tools
   */
  async listTools(): Promise<MCPTool[]> {
    return this.baseClient.listTools();
  }
  
  /**
   * Delegate to base client for listing resources
   */
  async listResources(): Promise<MCPResource[]> {
    return this.baseClient.listResources();
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
   * Initialize the enhanced client
   */
  async initialize(): Promise<void> {
    // First, let the base client create the connections
    await this.baseClient.initialize();
    
    // Then enhance them with our features
    // Note: Since we can't access parent's private connections,
    // we'll track enhanced features separately
    for (const serverConfig of this.enhancedConfig.servers) {
      try {
        // Create enhanced metadata for the connection
        const enhancedMetadata = {
          serverId: serverConfig.name,
          metrics: {
            createdAt: new Date(),
            lastUsedAt: new Date(),
            requestCount: 0,
            errorCount: 0,
            averageResponseTime: 0,
            transportMetadata: {}
          }
        };
        
        // Store enhanced metadata
        this.enhancedConnections.set(serverConfig.name, enhancedMetadata);
      } catch (error) {
        console.error(`Failed to enhance connection for ${serverConfig.name}:`, error);
      }
    }
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
      const result = await this.baseClient.callTool(serverId, toolName, args);
      
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
      url: 'http://localhost:3001/mcp'
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