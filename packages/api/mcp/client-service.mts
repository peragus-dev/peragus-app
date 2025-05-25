import {
  MCPClientManager,
  createMCPClient,
  defaultMCPConfig,
  type MCPClientConfig,
  type MCPTool,
  type MCPResource,
  type MCPToolCallResult
} from '../../mcp-client/src/index.mjs';

/**
 * Circuit breaker states for connection management
 */
enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

/**
 * Server health metrics
 */
interface ServerHealthMetrics {
  serverId: string;
  isConnected: boolean;
  lastSuccessfulCall: Date | null;
  lastFailedCall: Date | null;
  consecutiveFailures: number;
  circuitBreakerState: CircuitBreakerState;
  responseTimeMs: number[];
}

/**
 * Tool approval workflow types
 */
interface ToolApprovalRequest {
  id: string;
  serverId: string;
  toolName: string;
  arguments: Record<string, any>;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  approvedBy?: string;
  expiresAt: Date;
}

/**
 * Enhanced MCP Client Service for the API layer
 * Provides multi-server connection management, tool approval workflow,
 * circuit breaker patterns, and comprehensive health monitoring.
 */
export class MCPClientService {
  private static instance: MCPClientService;
  private clientManager: MCPClientManager | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  
  // Health monitoring
  private serverMetrics: Map<string, ServerHealthMetrics> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  // Circuit breaker configuration
  private circuitBreakerConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 300000 // 5 minutes
  };
  
  // Tool approval workflow
  private pendingApprovals: Map<string, ToolApprovalRequest> = new Map();
  private approvalTimeout = 300000; // 5 minutes
  
  // Connection pooling
  private connectionPool: Map<string, { lastUsed: Date; inUse: boolean }> = new Map();

  private constructor() {
    // Start health monitoring
    this.startHealthMonitoring();
    
    // Start cleanup intervals
    this.startCleanupTasks();
  }

  static getInstance(): MCPClientService {
    if (!MCPClientService.instance) {
      MCPClientService.instance = new MCPClientService();
    }
    return MCPClientService.instance;
  }

  /**
   * Initialize the MCP client with enhanced configuration
   */
  async initialize(config?: MCPClientConfig): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize(config);
    return this.initializationPromise;
  }

  private async _initialize(config?: MCPClientConfig): Promise<void> {
    try {
      const clientConfig = config || this._getDefaultConfig();
      this.clientManager = await createMCPClient(clientConfig);
      
      // Initialize server metrics
      for (const server of clientConfig.servers) {
        this.serverMetrics.set(server.name, {
          serverId: server.name,
          isConnected: false,
          lastSuccessfulCall: null,
          lastFailedCall: null,
          consecutiveFailures: 0,
          circuitBreakerState: CircuitBreakerState.CLOSED,
          responseTimeMs: []
        });
      }
      
      this.isInitialized = true;
      console.log('Enhanced MCP Client Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Enhanced MCP Client Service:', error);
      throw error;
    }
  }

  /**
   * Get default configuration with environment-based overrides
   */
  private _getDefaultConfig(): MCPClientConfig {
    const config = { ...defaultMCPConfig };
    
    // Override with environment variables if available
    const mcpServerUrl = process.env.MCP_SERVER_URL;
    if (mcpServerUrl && config.servers.length > 0 && config.servers[0]) {
      config.servers[0].url = mcpServerUrl;
    }

    const mcpServerPort = process.env.MCP_SERVER_PORT;
    if (mcpServerPort && config.servers.length > 0 && config.servers[0]) {
      config.servers[0].port = parseInt(mcpServerPort, 10);
    }

    // Add additional servers from environment
    const additionalServers = process.env.MCP_ADDITIONAL_SERVERS;
    if (additionalServers) {
      try {
        const servers = JSON.parse(additionalServers);
        config.servers.push(...servers);
      } catch (error) {
        console.warn('Failed to parse MCP_ADDITIONAL_SERVERS:', error);
      }
    }

    return config;
  }

  /**
   * Check if the service is initialized and ready
   */
  isReady(): boolean {
    return this.isInitialized && this.clientManager !== null;
  }

  /**
   * Get connection status for all servers with health metrics
   */
  getConnectionStatus(): Record<string, {
    connected: boolean;
    health: ServerHealthMetrics;
  }> {
    if (!this.clientManager) {
      return {};
    }
    
    const basicStatus = this.clientManager.getConnectionStatus();
    const result: Record<string, { connected: boolean; health: ServerHealthMetrics }> = {};
    
    for (const [serverId, connected] of Object.entries(basicStatus)) {
      const metrics = this.serverMetrics.get(serverId);
      if (metrics) {
        const isConnected = Boolean(connected);
        metrics.isConnected = isConnected;
        result[serverId] = {
          connected: isConnected,
          health: { ...metrics }
        };
      }
    }
    
    return result;
  }

  /**
   * List all available tools from all connected servers
   */
  async listTools(): Promise<MCPTool[]> {
    if (!this.clientManager) {
      throw new Error('MCP Client Service not initialized');
    }
    return this.clientManager.listTools();
  }

  /**
   * List all available resources from all connected servers
   */
  async listResources(): Promise<MCPResource[]> {
    if (!this.clientManager) {
      throw new Error('MCP Client Service not initialized');
    }
    return this.clientManager.listResources();
  }

  /**
   * Call a tool with circuit breaker protection and approval workflow
   */
  async callTool(
    serverId: string, 
    toolName: string, 
    args: Record<string, any>,
    options: {
      requireApproval?: boolean;
      approvedBy?: string;
      bypassCircuitBreaker?: boolean;
    } = {}
  ): Promise<MCPToolCallResult> {
    if (!this.clientManager) {
      throw new Error('MCP Client Service not initialized');
    }

    // Check circuit breaker
    if (!options.bypassCircuitBreaker && !this._isCircuitBreakerClosed(serverId)) {
      throw new Error(`Circuit breaker is open for server: ${serverId}`);
    }

    // Handle approval workflow
    if (options.requireApproval && !options.approvedBy) {
      const approvalId = await this._requestToolApproval(serverId, toolName, args);
      throw new Error(`Tool execution requires approval. Approval ID: ${approvalId}`);
    }

    const startTime = Date.now();
    
    try {
      const result = await this.clientManager.callTool(serverId, toolName, args);
      
      // Record successful call
      this._recordSuccessfulCall(serverId, Date.now() - startTime);
      
      return result;
    } catch (error) {
      // Record failed call
      this._recordFailedCall(serverId);
      throw error;
    }
  }

  /**
   * Read a resource from a specific server with circuit breaker protection
   */
  async readResource(serverId: string, uri: string): Promise<any> {
    if (!this.clientManager) {
      throw new Error('MCP Client Service not initialized');
    }

    // Check circuit breaker
    if (!this._isCircuitBreakerClosed(serverId)) {
      throw new Error(`Circuit breaker is open for server: ${serverId}`);
    }

    const startTime = Date.now();
    
    try {
      const result = await this.clientManager.readResource(serverId, uri);
      
      // Record successful call
      this._recordSuccessfulCall(serverId, Date.now() - startTime);
      
      return result;
    } catch (error) {
      // Record failed call
      this._recordFailedCall(serverId);
      throw error;
    }
  }

  /**
   * Reconnect to a specific server
   */
  async reconnect(serverId: string): Promise<void> {
    if (!this.clientManager) {
      throw new Error('MCP Client Service not initialized');
    }
    
    // Reset circuit breaker
    const metrics = this.serverMetrics.get(serverId);
    if (metrics) {
      metrics.consecutiveFailures = 0;
      metrics.circuitBreakerState = CircuitBreakerState.CLOSED;
    }
    
    return this.clientManager.reconnect(serverId);
  }

  /**
   * Request tool approval
   */
  private async _requestToolApproval(
    serverId: string, 
    toolName: string, 
    args: Record<string, any>
  ): Promise<string> {
    const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date(Date.now() + this.approvalTimeout);
    
    const request: ToolApprovalRequest = {
      id: approvalId,
      serverId,
      toolName,
      arguments: args,
      requestedAt: new Date(),
      status: 'pending',
      expiresAt
    };
    
    this.pendingApprovals.set(approvalId, request);
    
    return approvalId;
  }

  /**
   * Approve a tool execution request
   */
  async approveToolExecution(approvalId: string, approvedBy: string): Promise<boolean> {
    const request = this.pendingApprovals.get(approvalId);
    
    if (!request) {
      return false;
    }
    
    if (request.status !== 'pending' || new Date() > request.expiresAt) {
      request.status = 'expired';
      return false;
    }
    
    request.status = 'approved';
    request.approvedBy = approvedBy;
    
    return true;
  }

  /**
   * Reject a tool execution request
   */
  async rejectToolExecution(approvalId: string): Promise<boolean> {
    const request = this.pendingApprovals.get(approvalId);
    
    if (!request || request.status !== 'pending') {
      return false;
    }
    
    request.status = 'rejected';
    return true;
  }

  /**
   * Get pending approval requests
   */
  getPendingApprovals(): ToolApprovalRequest[] {
    return Array.from(this.pendingApprovals.values())
      .filter(req => req.status === 'pending' && new Date() <= req.expiresAt);
  }

  /**
   * Execute approved tool call
   */
  async executeApprovedTool(approvalId: string): Promise<MCPToolCallResult> {
    const request = this.pendingApprovals.get(approvalId);
    
    if (!request || request.status !== 'approved') {
      throw new Error('Invalid or unapproved tool execution request');
    }
    
    return this.callTool(request.serverId, request.toolName, request.arguments, {
      requireApproval: false,
      approvedBy: request.approvedBy
    });
  }

  /**
   * Check if circuit breaker is closed for a server
   */
  private _isCircuitBreakerClosed(serverId: string): boolean {
    const metrics = this.serverMetrics.get(serverId);
    if (!metrics) {
      return true; // Default to allowing calls for unknown servers
    }
    
    return metrics.circuitBreakerState === CircuitBreakerState.CLOSED;
  }

  /**
   * Record successful call
   */
  private _recordSuccessfulCall(serverId: string, responseTime: number): void {
    const metrics = this.serverMetrics.get(serverId);
    if (!metrics) return;
    
    metrics.lastSuccessfulCall = new Date();
    metrics.consecutiveFailures = 0;
    metrics.circuitBreakerState = CircuitBreakerState.CLOSED;
    
    // Track response times (keep last 100)
    metrics.responseTimeMs.push(responseTime);
    if (metrics.responseTimeMs.length > 100) {
      metrics.responseTimeMs.shift();
    }
  }

  /**
   * Record failed call
   */
  private _recordFailedCall(serverId: string): void {
    const metrics = this.serverMetrics.get(serverId);
    if (!metrics) return;
    
    metrics.lastFailedCall = new Date();
    metrics.consecutiveFailures++;
    
    // Check if we should open the circuit breaker
    if (metrics.consecutiveFailures >= this.circuitBreakerConfig.failureThreshold) {
      metrics.circuitBreakerState = CircuitBreakerState.OPEN;
      
      // Schedule circuit breaker reset
      setTimeout(() => {
        if (metrics.circuitBreakerState === CircuitBreakerState.OPEN) {
          metrics.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        }
      }, this.circuitBreakerConfig.resetTimeout);
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this._performHealthChecks();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Perform health checks on all servers
   */
  private async _performHealthChecks(): Promise<void> {
    if (!this.isReady()) return;
    
    for (const [serverId, metrics] of this.serverMetrics) {
      try {
        // Simple health check by listing tools
        await this.listTools();
        metrics.isConnected = true;
      } catch (error) {
        metrics.isConnected = false;
        console.warn(`Health check failed for server ${serverId}:`, error);
      }
    }
  }

  /**
   * Start cleanup tasks
   */
  private startCleanupTasks(): void {
    // Clean up expired approvals every minute
    setInterval(() => {
      const now = new Date();
      for (const [id, request] of this.pendingApprovals) {
        if (now > request.expiresAt && request.status === 'pending') {
          request.status = 'expired';
        }
        
        // Remove old requests (older than 1 hour)
        if (now.getTime() - request.requestedAt.getTime() > 3600000) {
          this.pendingApprovals.delete(id);
        }
      }
    }, 60000);
  }

  /**
   * Enhanced health check with detailed metrics
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    connections: Record<string, { connected: boolean; health: ServerHealthMetrics }>;
    details: string;
    metrics: {
      totalServers: number;
      connectedServers: number;
      circuitBreakersOpen: number;
      pendingApprovals: number;
    };
  }> {
    if (!this.isReady()) {
      return {
        status: 'unhealthy',
        connections: {},
        details: 'MCP Client Service not initialized',
        metrics: {
          totalServers: 0,
          connectedServers: 0,
          circuitBreakersOpen: 0,
          pendingApprovals: 0
        }
      };
    }

    const connections = this.getConnectionStatus();
    const connectedCount = Object.values(connections).filter(c => c.connected).length;
    const totalCount = Object.keys(connections).length;
    const circuitBreakersOpen = Object.values(connections)
      .filter(c => c.health.circuitBreakerState === CircuitBreakerState.OPEN).length;
    const pendingApprovals = this.getPendingApprovals().length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    let details: string;

    if (connectedCount === totalCount && totalCount > 0 && circuitBreakersOpen === 0) {
      status = 'healthy';
      details = `All ${totalCount} MCP servers connected and operational`;
    } else if (connectedCount > 0) {
      status = 'degraded';
      details = `${connectedCount}/${totalCount} MCP servers connected, ${circuitBreakersOpen} circuit breakers open`;
    } else {
      status = 'unhealthy';
      details = 'No MCP servers connected';
    }

    return {
      status,
      connections,
      details,
      metrics: {
        totalServers: totalCount,
        connectedServers: connectedCount,
        circuitBreakersOpen,
        pendingApprovals
      }
    };
  }

  /**
   * Close all connections and cleanup
   */
  async close(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.clientManager) {
      await this.clientManager.close();
      this.clientManager = null;
    }
    
    this.serverMetrics.clear();
    this.pendingApprovals.clear();
    this.connectionPool.clear();
    
    this.isInitialized = false;
    this.initializationPromise = null;
  }
}

// Export singleton instance
export const mcpClientService = MCPClientService.getInstance();

// Export types for convenience
export type {
  MCPClientConfig,
  MCPTool,
  MCPResource,
  MCPToolCallResult
} from '../../mcp-client/src/index.mjs';

export type {
  ToolApprovalRequest,
  ServerHealthMetrics
};