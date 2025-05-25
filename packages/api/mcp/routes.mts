import { Router, type Request, type Response } from 'express';
import { mcpClientService } from './client-service.mjs';
import {
  ToolExecutionRequestSchema,
  BatchToolCallSchema,
  ToolApprovalActionSchema
} from '../../shared/src/schemas/mcp.mjs';

const router: Router = Router();

/**
 * Initialize MCP client service
 * POST /api/mcp/initialize
 */
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    await mcpClientService.initialize(req.body.config);
    res.json({ 
      success: true, 
      message: 'MCP client initialized successfully' 
    });
  } catch (error) {
    console.error('Failed to initialize MCP client:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * Get MCP service health status
 * GET /api/mcp/health
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await mcpClientService.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 206 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('MCP health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      connections: {},
      details: error instanceof Error ? error.message : 'Health check failed'
    });
  }
});

/**
 * Get connection status for all MCP servers
 * GET /api/mcp/status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = mcpClientService.getConnectionStatus();
    res.json({ 
      success: true, 
      connections: status,
      ready: mcpClientService.isReady()
    });
  } catch (error) {
    console.error('Failed to get MCP status:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * List all available tools from connected MCP servers
 * GET /api/mcp/tools
 */
router.get('/tools', async (_req: Request, res: Response) => {
  try {
    const tools = await mcpClientService.listTools();
    res.json({ 
      success: true, 
      tools 
    });
  } catch (error) {
    console.error('Failed to list MCP tools:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * List all available resources from connected MCP servers
 * GET /api/mcp/resources
 */
router.get('/resources', async (_req: Request, res: Response) => {
  try {
    const resources = await mcpClientService.listResources();
    res.json({ 
      success: true, 
      resources 
    });
  } catch (error) {
    console.error('Failed to list MCP resources:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * Call a tool on a specific MCP server with enhanced options
 * POST /api/mcp/tools/:serverId/:toolName
 */
router.post('/tools/:serverId/:toolName', async (req: Request, res: Response) => {
  try {
    const { serverId, toolName } = req.params;
    
    if (!serverId || !toolName) {
      return res.status(400).json({
        success: false,
        error: 'serverId and toolName are required'
      });
    }
    
    // Validate request body
    const validationResult = ToolExecutionRequestSchema.safeParse({
      serverId,
      toolName,
      ...req.body
    });
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request format',
        details: validationResult.error.errors
      });
    }
    
    const { arguments: args, requireApproval, approvedBy, bypassCircuitBreaker } = validationResult.data;

    const result = await mcpClientService.callTool(serverId, toolName, args, {
      requireApproval,
      approvedBy,
      bypassCircuitBreaker
    });
    
    if (result.success) {
      res.json({
        success: true,
        result: result.result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Tool call failed'
      });
    }
  } catch (error) {
    console.error('Failed to call MCP tool:', error);
    
    // Handle approval required error
    if (error instanceof Error && error.message.includes('requires approval')) {
      return res.status(202).json({
        success: false,
        error: error.message,
        requiresApproval: true
      });
    }
    
    // Handle circuit breaker error
    if (error instanceof Error && error.message.includes('Circuit breaker')) {
      return res.status(503).json({
        success: false,
        error: error.message,
        circuitBreakerOpen: true
      });
    }
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Read a resource from a specific MCP server
 * GET /api/mcp/resources/:serverId
 */
router.get('/resources/:serverId', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const { uri } = req.query;

    if (!serverId) {
      return res.status(400).json({
        success: false,
        error: 'serverId is required'
      });
    }

    if (!uri || typeof uri !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'URI parameter is required'
      });
    }

    const resource = await mcpClientService.readResource(serverId, uri);
    res.json({ 
      success: true, 
      resource 
    });
  } catch (error) {
    console.error('Failed to read MCP resource:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * Reconnect to a specific MCP server
 * POST /api/mcp/reconnect/:serverId
 */
router.post('/reconnect/:serverId', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    if (!serverId) {
      return res.status(400).json({
        success: false,
        error: 'serverId is required'
      });
    }
    
    await mcpClientService.reconnect(serverId);
    res.json({ 
      success: true, 
      message: `Reconnected to server: ${serverId}` 
    });
  } catch (error) {
    console.error('Failed to reconnect to MCP server:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * Batch tool call - call multiple tools in sequence
 * POST /api/mcp/batch
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = BatchToolCallSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request format',
        details: validationResult.error.errors
      });
    }
    
    const { calls } = validationResult.data;

    const results = [];
    for (const call of calls) {
      const { serverId, toolName, arguments: args } = call;
      try {
        const result = await mcpClientService.callTool(serverId, toolName, args || {});
        results.push(result);
      } catch (error) {
        results.push({
          serverId,
          toolName,
          result: null,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Failed to execute batch MCP calls:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get pending tool approval requests
 * GET /api/mcp/approvals/pending
 */
router.get('/approvals/pending', async (_req: Request, res: Response) => {
  try {
    const pendingApprovals = mcpClientService.getPendingApprovals();
    res.json({
      success: true,
      approvals: pendingApprovals
    });
  } catch (error) {
    console.error('Failed to get pending approvals:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Approve or reject a tool execution request
 * POST /api/mcp/approvals/:approvalId/action
 */
router.post('/approvals/:approvalId/action', async (req: Request, res: Response) => {
  try {
    const { approvalId } = req.params;
    
    if (!approvalId) {
      return res.status(400).json({
        success: false,
        error: 'approvalId is required'
      });
    }
    
    // Validate request body
    const validationResult = ToolApprovalActionSchema.safeParse({
      approvalId,
      ...req.body
    });
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request format',
        details: validationResult.error.errors
      });
    }
    
    const { action, approvedBy } = validationResult.data;
    
    let success = false;
    if (action === 'approve') {
      if (!approvedBy) {
        return res.status(400).json({
          success: false,
          error: 'approvedBy is required for approval action'
        });
      }
      success = await mcpClientService.approveToolExecution(approvalId, approvedBy);
    } else if (action === 'reject') {
      success = await mcpClientService.rejectToolExecution(approvalId);
    }
    
    if (success) {
      res.json({
        success: true,
        message: `Tool execution ${action}d successfully`
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Approval request not found or already processed'
      });
    }
  } catch (error) {
    console.error('Failed to process approval action:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Execute an approved tool call
 * POST /api/mcp/approvals/:approvalId/execute
 */
router.post('/approvals/:approvalId/execute', async (req: Request, res: Response) => {
  try {
    const { approvalId } = req.params;
    
    if (!approvalId) {
      return res.status(400).json({
        success: false,
        error: 'approvalId is required'
      });
    }
    
    const result = await mcpClientService.executeApprovedTool(approvalId);
    
    if (result.success) {
      res.json({
        success: true,
        result: result.result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Tool execution failed'
      });
    }
  } catch (error) {
    console.error('Failed to execute approved tool:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get server health metrics
 * GET /api/mcp/servers/health
 */
router.get('/servers/health', async (_req: Request, res: Response) => {
  try {
    const connectionStatus = mcpClientService.getConnectionStatus();
    res.json({
      success: true,
      servers: connectionStatus
    });
  } catch (error) {
    console.error('Failed to get server health:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Force reconnect to all servers
 * POST /api/mcp/servers/reconnect-all
 */
router.post('/servers/reconnect-all', async (_req: Request, res: Response) => {
  try {
    const connectionStatus = mcpClientService.getConnectionStatus();
    const reconnectPromises = Object.keys(connectionStatus).map(serverId =>
      mcpClientService.reconnect(serverId).catch(error => ({
        serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }))
    );
    
    const results = await Promise.allSettled(reconnectPromises);
    const errors = results
      .filter(result => result.status === 'rejected' || (result.status === 'fulfilled' && result.value?.error))
      .map(result => result.status === 'rejected' ? result.reason : result.value);
    
    if (errors.length === 0) {
      res.json({
        success: true,
        message: 'All servers reconnected successfully'
      });
    } else {
      res.status(207).json({
        success: false,
        message: 'Some servers failed to reconnect',
        errors
      });
    }
  } catch (error) {
    console.error('Failed to reconnect servers:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;