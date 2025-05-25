import { z } from 'zod';

/**
 * MCP Tool Approval Workflow Schemas
 */
export const ToolApprovalRequestSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.any()),
  requestedAt: z.date(),
  status: z.enum(['pending', 'approved', 'rejected', 'expired']),
  approvedBy: z.string().optional(),
  expiresAt: z.date(),
});

export type ToolApprovalRequest = z.infer<typeof ToolApprovalRequestSchema>;

/**
 * MCP Server Health Metrics Schema
 */
export const ServerHealthMetricsSchema = z.object({
  serverId: z.string(),
  isConnected: z.boolean(),
  lastSuccessfulCall: z.date().nullable(),
  lastFailedCall: z.date().nullable(),
  consecutiveFailures: z.number(),
  circuitBreakerState: z.enum(['closed', 'open', 'half_open']),
  responseTimeMs: z.array(z.number()),
});

export type ServerHealthMetrics = z.infer<typeof ServerHealthMetricsSchema>;

/**
 * MCP Tool Execution Request Schema
 */
export const ToolExecutionRequestSchema = z.object({
  serverId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.any()).default({}),
  requireApproval: z.boolean().default(false),
  approvedBy: z.string().optional(),
  bypassCircuitBreaker: z.boolean().default(false),
});

export type ToolExecutionRequest = z.infer<typeof ToolExecutionRequestSchema>;

/**
 * MCP Resource Access Request Schema
 */
export const ResourceAccessRequestSchema = z.object({
  serverId: z.string(),
  uri: z.string(),
});

export type ResourceAccessRequest = z.infer<typeof ResourceAccessRequestSchema>;

/**
 * MCP Batch Tool Call Schema
 */
export const BatchToolCallSchema = z.object({
  calls: z.array(z.object({
    serverId: z.string(),
    toolName: z.string(),
    arguments: z.record(z.any()).default({}),
  })),
});

export type BatchToolCall = z.infer<typeof BatchToolCallSchema>;

/**
 * MCP Service Health Check Response Schema
 */
export const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  connections: z.record(z.object({
    connected: z.boolean(),
    health: ServerHealthMetricsSchema,
  })),
  details: z.string(),
  metrics: z.object({
    totalServers: z.number(),
    connectedServers: z.number(),
    circuitBreakersOpen: z.number(),
    pendingApprovals: z.number(),
  }),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

/**
 * MCP Tool Approval Action Schema
 */
export const ToolApprovalActionSchema = z.object({
  approvalId: z.string(),
  action: z.enum(['approve', 'reject']),
  approvedBy: z.string().optional(),
});

export type ToolApprovalAction = z.infer<typeof ToolApprovalActionSchema>;

/**
 * MCP Server Status Response Schema
 */
export const ServerStatusResponseSchema = z.object({
  success: z.boolean(),
  connections: z.record(z.boolean()),
  ready: z.boolean(),
});

export type ServerStatusResponse = z.infer<typeof ServerStatusResponseSchema>;

/**
 * MCP Error Response Schema
 */
export const MCPErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
  details: z.record(z.any()).optional(),
});

export type MCPErrorResponse = z.infer<typeof MCPErrorResponseSchema>;

/**
 * MCP Success Response Schema
 */
export const MCPSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.any().optional(),
});

export type MCPSuccessResponse = z.infer<typeof MCPSuccessResponseSchema>;

/**
 * Generic MCP API Response Schema
 */
export const MCPAPIResponseSchema = z.union([
  MCPSuccessResponseSchema,
  MCPErrorResponseSchema,
]);

export type MCPAPIResponse = z.infer<typeof MCPAPIResponseSchema>;

/**
 * MCP Tool List Response Schema
 */
export const ToolListResponseSchema = z.object({
  success: z.literal(true),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: z.any(),
    serverId: z.string(),
  })),
});

export type ToolListResponse = z.infer<typeof ToolListResponseSchema>;

/**
 * MCP Resource List Response Schema
 */
export const ResourceListResponseSchema = z.object({
  success: z.literal(true),
  resources: z.array(z.object({
    uri: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    serverId: z.string(),
  })),
});

export type ResourceListResponse = z.infer<typeof ResourceListResponseSchema>;

/**
 * MCP Tool Call Result Response Schema
 */
export const ToolCallResultResponseSchema = z.object({
  success: z.boolean(),
  result: z.any().optional(),
  error: z.string().optional(),
  serverId: z.string().optional(),
  toolName: z.string().optional(),
});

export type ToolCallResultResponse = z.infer<typeof ToolCallResultResponseSchema>;

/**
 * MCP Resource Read Response Schema
 */
export const ResourceReadResponseSchema = z.object({
  success: z.literal(true),
  resource: z.any(),
});

export type ResourceReadResponse = z.infer<typeof ResourceReadResponseSchema>;

/**
 * MCP Batch Tool Call Response Schema
 */
export const BatchToolCallResponseSchema = z.object({
  success: z.literal(true),
  results: z.array(ToolCallResultResponseSchema),
});

export type BatchToolCallResponse = z.infer<typeof BatchToolCallResponseSchema>;

/**
 * Circuit Breaker State Enum
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

/**
 * Tool Approval Status Enum
 */
export enum ToolApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

/**
 * MCP Service Health Status Enum
 */
export enum MCPHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}