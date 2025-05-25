/**
 * Error Recovery System - Main Export
 * Comprehensive error recovery system with circuit breakers, health checks, retry mechanisms, and graceful degradation
 */

// Core types
export * from './types/index.mjs';

// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerManager
} from './circuit-breaker/circuit-breaker.mjs';

// Health Check Manager
export {
  HealthCheckManager
} from './health-check/health-manager.mjs';

// Retry Manager
export {
  RetryManager,
  GlobalRetryManager,
  RetryUtils
} from './retry/retry-manager.mjs';

// Graceful Degradation
export {
  GracefulDegradationManager,
  GlobalDegradationManager
} from './degradation/degradation-manager.mjs';

// Error Recovery Orchestrator
export {
  ErrorRecoveryOrchestrator
} from './orchestrator/recovery-orchestrator.mjs';

// Import for internal use
import { ErrorRecoveryOrchestrator } from './orchestrator/recovery-orchestrator.mjs';

// Convenience factory for creating a complete error recovery system
export class ErrorRecoverySystem {
  private readonly orchestrator: ErrorRecoveryOrchestrator;

  constructor() {
    this.orchestrator = new ErrorRecoveryOrchestrator();
  }

  /**
   * Get the orchestrator instance
   */
  getOrchestrator(): ErrorRecoveryOrchestrator {
    return this.orchestrator;
  }

  /**
   * Start the error recovery system
   */
  start(): void {
    this.orchestrator.start();
  }

  /**
   * Stop the error recovery system
   */
  stop(): void {
    this.orchestrator.stop();
  }

  /**
   * Register a service for error recovery
   */
  registerService(
    serviceId: string,
    healthCheckFn: () => Promise<boolean>,
    options?: {
      circuitBreakerConfig?: any;
      healthCheckConfig?: any;
      retryConfig?: any;
      degradationConfig?: any;
    }
  ): void {
    this.orchestrator.registerService(serviceId, healthCheckFn, options);
  }

  /**
   * Execute operation with full error recovery protection
   */
  async executeWithRecovery<T>(
    serviceId: string,
    operationName: string,
    operation: () => Promise<T>,
    options?: {
      fallback?: () => Promise<T>;
      skipCircuitBreaker?: boolean;
      skipRetry?: boolean;
      skipDegradation?: boolean;
    }
  ): Promise<T> {
    return this.orchestrator.executeWithRecovery(serviceId, operationName, operation, options);
  }

  /**
   * Get system health summary
   */
  getSystemHealth() {
    return this.orchestrator.getSystemHealthSummary();
  }

  /**
   * Force system degradation
   */
  forceSystemDegradation(level: any, reason: string): void {
    this.orchestrator.forceSystemDegradation(level, reason);
  }

  /**
   * Reset all recovery systems
   */
  resetAll(): void {
    this.orchestrator.resetAll();
  }

  /**
   * Add event listener
   */
  on(event: string, listener: (...args: any[]) => void): void {
    this.orchestrator.on(event, listener);
  }

  /**
   * Remove event listener
   */
  off(event: string, listener: (...args: any[]) => void): void {
    this.orchestrator.off(event, listener);
  }
}

// Default export
export default ErrorRecoverySystem;