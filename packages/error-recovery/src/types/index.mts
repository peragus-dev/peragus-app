/**
 * Error Recovery System Types
 * Comprehensive type definitions for circuit breakers, health checks, retry mechanisms, and graceful degradation
 */

import { z } from 'zod';

// ============================================================================
// Circuit Breaker Types
// ============================================================================

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Time in milliseconds before attempting to close the circuit */
  resetTimeout: number;
  /** Time window in milliseconds for monitoring failures */
  monitoringWindow: number;
  /** Minimum number of requests in monitoring window before evaluating */
  minimumThroughput: number;
  /** Error rate threshold (0-1) for opening circuit */
  errorRateThreshold: number;
  /** Maximum number of concurrent requests in half-open state */
  halfOpenMaxCalls: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  nextAttemptTime: Date | null;
  totalRequests: number;
  errorRate: number;
  averageResponseTime: number;
  concurrentRequests: number;
}

// ============================================================================
// Health Check Types
// ============================================================================

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

export interface HealthCheckConfig {
  /** Interval between health checks in milliseconds */
  interval: number;
  /** Timeout for individual health checks in milliseconds */
  timeout: number;
  /** Number of consecutive failures before marking as unhealthy */
  unhealthyThreshold: number;
  /** Number of consecutive successes before marking as healthy */
  healthyThreshold: number;
  /** Whether to perform deep health checks */
  deepCheck: boolean;
  /** Custom health check function */
  customCheck?: () => Promise<boolean>;
}

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: Date;
  responseTime: number;
  details: string;
  metadata?: Record<string, any>;
}

export interface ServiceHealth {
  serviceId: string;
  status: HealthStatus;
  lastCheck: Date;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  uptime: number;
  checks: HealthCheckResult[];
  config: HealthCheckConfig;
}

// ============================================================================
// Retry Mechanism Types
// ============================================================================

export enum RetryStrategy {
  FIXED = 'fixed',
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
  EXPONENTIAL_JITTER = 'exponential_jitter',
  CUSTOM = 'custom'
}

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay between retries in milliseconds */
  baseDelay: number;
  /** Maximum delay between retries in milliseconds */
  maxDelay: number;
  /** Retry strategy to use */
  strategy: RetryStrategy;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Jitter factor (0-1) for randomization */
  jitterFactor: number;
  /** Custom delay calculation function */
  customDelayFn?: (attempt: number, baseDelay: number) => number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Timeout for individual retry attempts */
  attemptTimeout: number;
}

export interface RetryAttempt {
  attempt: number;
  timestamp: Date;
  delay: number;
  error?: Error;
  success: boolean;
  responseTime: number;
}

export interface RetryMetrics {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  averageAttempts: number;
  averageDelay: number;
  lastAttempt: RetryAttempt | null;
  attempts: RetryAttempt[];
}

// ============================================================================
// Graceful Degradation Types
// ============================================================================

export enum DegradationLevel {
  NONE = 'none',
  PARTIAL = 'partial',
  MINIMAL = 'minimal',
  EMERGENCY = 'emergency'
}

export interface DegradationConfig {
  /** Degradation level to apply */
  level: DegradationLevel;
  /** Features to disable at this level */
  disabledFeatures: string[];
  /** Fallback implementations */
  fallbacks: Record<string, () => Promise<any>>;
  /** Cache settings for degraded mode */
  cacheSettings: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  /** Rate limiting for degraded mode */
  rateLimiting: {
    enabled: boolean;
    requestsPerMinute: number;
  };
}

export interface DegradationState {
  currentLevel: DegradationLevel;
  activeSince: Date;
  reason: string;
  affectedServices: string[];
  fallbacksActive: string[];
  metrics: {
    requestsServed: number;
    fallbacksUsed: number;
    cacheHits: number;
    cacheMisses: number;
  };
}

// ============================================================================
// Error Recovery Orchestrator Types
// ============================================================================

export interface RecoveryAction {
  id: string;
  type: 'restart' | 'reconnect' | 'fallback' | 'degrade' | 'alert' | 'custom';
  priority: number;
  condition: (context: RecoveryContext) => boolean;
  execute: (context: RecoveryContext) => Promise<void>;
  timeout: number;
  retryable: boolean;
}

export interface RecoveryContext {
  serviceId: string;
  errorType: string;
  error: Error;
  metrics: {
    circuitBreaker: CircuitBreakerMetrics;
    health: ServiceHealth;
    retry: RetryMetrics;
  };
  timestamp: Date;
  previousActions: RecoveryAction[];
}

export interface RecoveryResult {
  success: boolean;
  action: string;
  duration: number;
  error?: Error;
  metadata?: Record<string, any>;
}

export interface RecoveryPlan {
  id: string;
  serviceId: string;
  actions: RecoveryAction[];
  createdAt: Date;
  executedAt?: Date;
  completedAt?: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  results: RecoveryResult[];
}

// ============================================================================
// Service Integration Types
// ============================================================================

export interface ErrorRecoveryService {
  serviceId: string;
  circuitBreaker: CircuitBreakerMetrics;
  healthCheck: ServiceHealth;
  retryManager: RetryMetrics;
  degradationState: DegradationState;
  lastRecoveryPlan?: RecoveryPlan;
}

export interface SystemHealthSummary {
  overallStatus: HealthStatus;
  services: Record<string, ErrorRecoveryService>;
  degradationLevel: DegradationLevel;
  activeRecoveryPlans: number;
  metrics: {
    totalServices: number;
    healthyServices: number;
    degradedServices: number;
    unhealthyServices: number;
    openCircuitBreakers: number;
    activeRetries: number;
  };
  timestamp: Date;
}

// ============================================================================
// Configuration Schemas
// ============================================================================

export const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().min(1).max(100).default(5),
  resetTimeout: z.number().min(1000).max(300000).default(60000),
  monitoringWindow: z.number().min(10000).max(600000).default(60000),
  minimumThroughput: z.number().min(1).max(1000).default(10),
  errorRateThreshold: z.number().min(0).max(1).default(0.5),
  halfOpenMaxCalls: z.number().min(1).max(100).default(3)
});

export const HealthCheckConfigSchema = z.object({
  interval: z.number().min(1000).max(300000).default(30000),
  timeout: z.number().min(1000).max(60000).default(5000),
  unhealthyThreshold: z.number().min(1).max(10).default(3),
  healthyThreshold: z.number().min(1).max(10).default(2),
  deepCheck: z.boolean().default(false)
});

export const RetryConfigSchema = z.object({
  maxAttempts: z.number().min(1).max(10).default(3),
  baseDelay: z.number().min(100).max(10000).default(1000),
  maxDelay: z.number().min(1000).max(60000).default(30000),
  strategy: z.nativeEnum(RetryStrategy).default(RetryStrategy.EXPONENTIAL_JITTER),
  backoffMultiplier: z.number().min(1).max(10).default(2),
  jitterFactor: z.number().min(0).max(1).default(0.1),
  attemptTimeout: z.number().min(1000).max(60000).default(10000)
});

export const DegradationConfigSchema = z.object({
  level: z.nativeEnum(DegradationLevel).default(DegradationLevel.NONE),
  disabledFeatures: z.array(z.string()).default([]),
  fallbacks: z.record(z.any()).default({}),
  cacheSettings: z.object({
    enabled: z.boolean().default(true),
    ttl: z.number().min(1000).max(3600000).default(300000),
    maxSize: z.number().min(100).max(10000).default(1000)
  }),
  rateLimiting: z.object({
    enabled: z.boolean().default(false),
    requestsPerMinute: z.number().min(1).max(10000).default(100)
  })
});

// ============================================================================
// Event Types
// ============================================================================

export interface ErrorRecoveryEvent {
  id: string;
  type: 'circuit_breaker_opened' | 'circuit_breaker_closed' | 'health_check_failed' | 
        'health_check_recovered' | 'retry_exhausted' | 'degradation_activated' | 
        'degradation_deactivated' | 'recovery_plan_executed' | 'service_recovered';
  serviceId: string;
  timestamp: Date;
  data: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export type ErrorRecoveryEventHandler = (event: ErrorRecoveryEvent) => void | Promise<void>;
