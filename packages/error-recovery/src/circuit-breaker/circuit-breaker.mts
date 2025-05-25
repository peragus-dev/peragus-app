/**
 * Enhanced Circuit Breaker Implementation
 * Prevents cascade failures with intelligent state management and metrics
 */

import { EventEmitter } from 'events';
import {
  CircuitBreakerState,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type ErrorRecoveryEvent,
  CircuitBreakerConfigSchema
} from '../types/index.mjs';

export class CircuitBreaker extends EventEmitter {
  private readonly serviceId: string;
  private readonly config: CircuitBreakerConfig;
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private nextAttemptTime: Date | null = null;
  private requestTimes: number[] = [];
  private concurrentRequests = 0;
  private halfOpenAttempts = 0;
  // Marked as unused but kept for future use

  constructor(serviceId: string, config: Partial<CircuitBreakerConfig> = {}) {
    super();
    this.serviceId = serviceId;
    
    // Validate and set configuration
    const validatedConfig = CircuitBreakerConfigSchema.parse(config);
    this.config = validatedConfig;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        throw new Error(`Circuit breaker is OPEN for service: ${this.serviceId}`);
      }
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenAttempts >= this.config.halfOpenMaxCalls) {
        throw new Error(`Circuit breaker HALF_OPEN max calls exceeded for service: ${this.serviceId}`);
      }
      this.halfOpenAttempts++;
    }

    this.concurrentRequests++;
    const startTime = Date.now();

    try {
      const result = await fn();
      const responseTime = Date.now() - startTime;
      
      this.onSuccess(responseTime);
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.onFailure(error as Error, responseTime);
      throw error;
    } finally {
      this.concurrentRequests--;
    }
  }

  /**
   * Check if circuit breaker allows requests
   */
  canExecute(): boolean {
    if (this.state === CircuitBreakerState.CLOSED) {
      return true;
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      return this.halfOpenAttempts < this.config.halfOpenMaxCalls;
    }

    // OPEN state
    return this.shouldAttemptReset();
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const totalRequests = this.successCount + this.failureCount;
    const errorRate = totalRequests > 0 ? this.failureCount / totalRequests : 0;
    const averageResponseTime = this.requestTimes.length > 0 
      ? this.requestTimes.reduce((sum, time) => sum + time, 0) / this.requestTimes.length 
      : 0;

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
      totalRequests,
      errorRate,
      averageResponseTime,
      concurrentRequests: this.concurrentRequests
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.requestTimes = [];
    
    this.emitEvent('circuit_breaker_reset', {
      previousState: this.state,
      metrics: this.getMetrics()
    });
  }

  /**
   * Force circuit breaker to open state
   */
  forceOpen(): void {
    this.transitionToOpen();
  }

  /**
   * Force circuit breaker to closed state
   */
  forceClosed(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.halfOpenAttempts = 0;
    this.nextAttemptTime = null;
    
    this.emitEvent('circuit_breaker_closed', {
      forced: true,
      metrics: this.getMetrics()
    });
  }

  /**
   * Handle successful request
   */
  private onSuccess(responseTime: number): void {
    this.successCount++;
    this.lastSuccessTime = new Date();
    this.recordResponseTime(responseTime);

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Check if we should close the circuit
      if (this.halfOpenAttempts >= this.config.halfOpenMaxCalls) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitBreakerState.OPEN) {
      // This shouldn't happen, but handle gracefully
      this.transitionToClosed();
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(_error: Error, responseTime: number): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    this.recordResponseTime(responseTime);

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Failure in half-open state should open the circuit
      this.transitionToOpen();
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Check if we should open the circuit
      if (this.shouldOpen()) {
        this.transitionToOpen();
      }
    }
  }

  /**
   * Check if circuit should open based on failure criteria
   */
  private shouldOpen(): boolean {
    // Count recent requests
    const recentRequests = this.successCount + this.failureCount;
    
    // Check minimum throughput
    if (recentRequests < this.config.minimumThroughput) {
      return false;
    }

    // Check consecutive failures
    if (this.failureCount >= this.config.failureThreshold) {
      return true;
    }

    // Check error rate
    const errorRate = this.failureCount / recentRequests;
    return errorRate >= this.config.errorRateThreshold;
  }

  /**
   * Check if circuit should attempt reset from open state
   */
  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) {
      return false;
    }
    return Date.now() >= this.nextAttemptTime.getTime();
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.OPEN;
    this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeout);
    this.halfOpenAttempts = 0;

    this.emitEvent('circuit_breaker_opened', {
      previousState,
      failureCount: this.failureCount,
      errorRate: this.getMetrics().errorRate,
      nextAttemptTime: this.nextAttemptTime
    });
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.HALF_OPEN;
    this.halfOpenAttempts = 0;
    this.nextAttemptTime = null;

    this.emitEvent('circuit_breaker_half_opened', {
      previousState,
      maxCalls: this.config.halfOpenMaxCalls
    });
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this.nextAttemptTime = null;

    this.emitEvent('circuit_breaker_closed', {
      previousState,
      successCount: this.successCount,
      metrics: this.getMetrics()
    });
  }

  /**
   * Record response time for metrics
   */
  private recordResponseTime(responseTime: number): void {
    this.requestTimes.push(responseTime);
    
    // Keep only recent response times (last 100)
    if (this.requestTimes.length > 100) {
      this.requestTimes.shift();
    }
  }

  /**
   * Emit circuit breaker event
   */
  private emitEvent(type: string, data: Record<string, any>): void {
    const event: ErrorRecoveryEvent = {
      id: `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: type as any,
      serviceId: this.serviceId,
      timestamp: new Date(),
      data: {
        state: this.state,
        config: this.config,
        ...data
      },
      severity: type.includes('opened') ? 'high' : 'medium'
    };

    this.emit('event', event);
    this.emit(type, event);
  }
}

/**
 * Circuit Breaker Manager for multiple services
 */
export class CircuitBreakerManager {
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly defaultConfig: CircuitBreakerConfig;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = CircuitBreakerConfigSchema.parse(defaultConfig);
  }

  /**
   * Get or create circuit breaker for service
   */
  getCircuitBreaker(serviceId: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceId)) {
      const mergedConfig = { ...this.defaultConfig, ...config };
      const circuitBreaker = new CircuitBreaker(serviceId, mergedConfig);
      
      // Forward events
      circuitBreaker.on('event', (event) => {
        this.emit('event', event);
      });
      
      this.circuitBreakers.set(serviceId, circuitBreaker);
    }
    
    return this.circuitBreakers.get(serviceId)!;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(serviceId: string, fn: () => Promise<T>, config?: Partial<CircuitBreakerConfig>): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(serviceId, config);
    return circuitBreaker.execute(fn);
  }

  /**
   * Get metrics for all circuit breakers
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    
    for (const [serviceId, circuitBreaker] of this.circuitBreakers) {
      metrics[serviceId] = circuitBreaker.getMetrics();
    }
    
    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }
  }

  /**
   * Reset specific circuit breaker
   */
  reset(serviceId: string): void {
    const circuitBreaker = this.circuitBreakers.get(serviceId);
    if (circuitBreaker) {
      circuitBreaker.reset();
    }
  }

  /**
   * Remove circuit breaker for service
   */
  remove(serviceId: string): void {
    const circuitBreaker = this.circuitBreakers.get(serviceId);
    if (circuitBreaker) {
      circuitBreaker.removeAllListeners();
      this.circuitBreakers.delete(serviceId);
    }
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
    errorRate: number;
  } {
    const metrics = this.getAllMetrics();
    const states = Object.values(metrics);
    
    const total = states.length;
    const closed = states.filter(m => m.state === CircuitBreakerState.CLOSED).length;
    const open = states.filter(m => m.state === CircuitBreakerState.OPEN).length;
    const halfOpen = states.filter(m => m.state === CircuitBreakerState.HALF_OPEN).length;
    
    const totalRequests = states.reduce((sum, m) => sum + m.totalRequests, 0);
    const totalFailures = states.reduce((sum, m) => sum + m.failureCount, 0);
    const errorRate = totalRequests > 0 ? totalFailures / totalRequests : 0;

    return {
      total,
      closed,
      open,
      halfOpen,
      errorRate
    };
  }

  // EventEmitter methods
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }
}