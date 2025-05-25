/**
 * Retry Manager with Intelligent Exponential Backoff
 * Provides configurable retry strategies with jitter and adaptive backoff
 */

import { EventEmitter } from 'events';
import {
  RetryStrategy,
  type RetryConfig,
  type RetryAttempt,
  type RetryMetrics,
  type ErrorRecoveryEvent,
  RetryConfigSchema
} from '../types/index.mjs';

export class RetryManager extends EventEmitter {
  private readonly serviceId: string;
  private readonly config: RetryConfig;
  private attempts: RetryAttempt[] = [];
  private totalAttempts = 0;
  private successfulAttempts = 0;
  private failedAttempts = 0;

  constructor(serviceId: string, config: Partial<RetryConfig> = {}) {
    super();
    this.serviceId = serviceId;
    this.config = RetryConfigSchema.parse(config);
  }

  /**
   * Execute function with retry logic
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      const attemptStart = Date.now();
      
      try {
        // Execute with timeout
        const result = await this.executeWithTimeout(fn, this.config.attemptTimeout);
        const responseTime = Date.now() - attemptStart;
        
        // Record successful attempt
        this.recordAttempt(attempt, 0, null, true, responseTime);
        this.successfulAttempts++;
        
        this.emitEvent('retry_success', {
          attempt,
          totalAttempts: this.totalAttempts,
          responseTime
        });
        
        return result;
      } catch (error) {
        const responseTime = Date.now() - attemptStart;
        lastError = error as Error;
        
        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          this.recordAttempt(attempt, 0, lastError, false, responseTime);
          this.failedAttempts++;
          
          this.emitEvent('retry_non_retryable', {
            attempt,
            error: lastError.message,
            responseTime
          });
          
          throw lastError;
        }
        
        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        this.recordAttempt(attempt, delay, lastError, false, responseTime);
        
        // If this was the last attempt, throw the error
        if (attempt === this.config.maxAttempts) {
          this.failedAttempts++;
          
          this.emitEvent('retry_exhausted', {
            maxAttempts: this.config.maxAttempts,
            finalError: lastError.message,
            totalDelay: this.attempts.reduce((sum, a) => sum + a.delay, 0)
          });
          
          throw lastError;
        }
        
        // Wait before next attempt
        if (delay > 0) {
          this.emitEvent('retry_attempt', {
            attempt,
            nextAttempt: attempt + 1,
            delay,
            error: lastError.message
          });
          
          await this.sleep(delay);
        }
      }
    }
    
    // This should never be reached, but TypeScript requires it
    throw lastError || new Error('Retry execution failed');
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timeout after ${timeout}ms`));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Calculate delay for next retry attempt
   */
  private calculateDelay(attempt: number): number {
    let delay: number;

    switch (this.config.strategy) {
      case RetryStrategy.FIXED:
        delay = this.config.baseDelay;
        break;

      case RetryStrategy.LINEAR:
        delay = this.config.baseDelay * attempt;
        break;

      case RetryStrategy.EXPONENTIAL:
        delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
        break;

      case RetryStrategy.EXPONENTIAL_JITTER:
        const exponentialDelay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
        const jitter = exponentialDelay * this.config.jitterFactor * Math.random();
        delay = exponentialDelay + jitter;
        break;

      case RetryStrategy.CUSTOM:
        if (this.config.customDelayFn) {
          delay = this.config.customDelayFn(attempt, this.config.baseDelay);
        } else {
          delay = this.config.baseDelay;
        }
        break;

      default:
        delay = this.config.baseDelay;
    }

    // Ensure delay doesn't exceed maximum
    return Math.min(delay, this.config.maxDelay);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    if (this.config.isRetryable) {
      return this.config.isRetryable(error);
    }

    // Default retryable error detection
    const retryablePatterns = [
      /timeout/i,
      /connection/i,
      /network/i,
      /ECONNRESET/i,
      /ENOTFOUND/i,
      /ECONNREFUSED/i,
      /socket hang up/i,
      /request timeout/i,
      /service unavailable/i,
      /internal server error/i,
      /bad gateway/i,
      /gateway timeout/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Record retry attempt
   */
  private recordAttempt(
    attempt: number,
    delay: number,
    error: Error | null,
    success: boolean,
    responseTime: number
  ): void {
    const attemptRecord: RetryAttempt = {
      attempt,
      timestamp: new Date(),
      delay,
      success,
      responseTime
    };

    if (error) {
      attemptRecord.error = error;
    }

    this.attempts.push(attemptRecord);
    this.totalAttempts++;

    // Keep only recent attempts (last 1000)
    if (this.attempts.length > 1000) {
      this.attempts.shift();
    }
  }

  /**
   * Get retry metrics
   */
  getMetrics(): RetryMetrics {
    const recentAttempts = this.attempts.slice(-100); // Last 100 attempts
    const averageAttempts = recentAttempts.length > 0 
      ? recentAttempts.reduce((sum, a) => sum + a.attempt, 0) / recentAttempts.length 
      : 0;
    
    const averageDelay = recentAttempts.length > 0
      ? recentAttempts.reduce((sum, a) => sum + a.delay, 0) / recentAttempts.length
      : 0;

    return {
      totalAttempts: this.totalAttempts,
      successfulAttempts: this.successfulAttempts,
      failedAttempts: this.failedAttempts,
      averageAttempts,
      averageDelay,
      lastAttempt: this.attempts.length > 0 ? this.attempts[this.attempts.length - 1]! : null,
      attempts: [...recentAttempts]
    };
  }

  /**
   * Reset retry metrics
   */
  reset(): void {
    this.attempts = [];
    this.totalAttempts = 0;
    this.successfulAttempts = 0;
    this.failedAttempts = 0;

    this.emitEvent('retry_reset', {
      timestamp: new Date()
    });
  }

  /**
   * Update retry configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    const newConfig = { ...this.config, ...config };
    const validatedConfig = RetryConfigSchema.parse(newConfig);
    
    Object.assign(this.config, validatedConfig);

    this.emitEvent('retry_config_updated', {
      config: this.config
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Emit retry event
   */
  private emitEvent(type: string, data: Record<string, any>): void {
    const event: ErrorRecoveryEvent = {
      id: `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: type as any,
      serviceId: this.serviceId,
      timestamp: new Date(),
      data: {
        config: this.config,
        metrics: this.getMetrics(),
        ...data
      },
      severity: type.includes('exhausted') ? 'high' : 'medium'
    };

    this.emit('event', event);
    this.emit(type, event);
  }
}

/**
 * Global Retry Manager for multiple services
 */
export class GlobalRetryManager {
  private readonly retryManagers = new Map<string, RetryManager>();
  private readonly defaultConfig: RetryConfig;

  constructor(defaultConfig: Partial<RetryConfig> = {}) {
    this.defaultConfig = RetryConfigSchema.parse(defaultConfig);
  }

  /**
   * Get or create retry manager for service
   */
  getRetryManager(serviceId: string, config?: Partial<RetryConfig>): RetryManager {
    if (!this.retryManagers.has(serviceId)) {
      const mergedConfig = { ...this.defaultConfig, ...config };
      const retryManager = new RetryManager(serviceId, mergedConfig);
      
      // Forward events
      retryManager.on('event', (event) => {
        this.emit('event', event);
      });
      
      this.retryManagers.set(serviceId, retryManager);
    }
    
    return this.retryManagers.get(serviceId)!;
  }

  /**
   * Execute function with retry logic
   */
  async execute<T>(
    serviceId: string, 
    fn: () => Promise<T>, 
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const retryManager = this.getRetryManager(serviceId, config);
    return retryManager.execute(fn);
  }

  /**
   * Get metrics for all retry managers
   */
  getAllMetrics(): Record<string, RetryMetrics> {
    const metrics: Record<string, RetryMetrics> = {};
    
    for (const [serviceId, retryManager] of this.retryManagers) {
      metrics[serviceId] = retryManager.getMetrics();
    }
    
    return metrics;
  }

  /**
   * Reset all retry managers
   */
  resetAll(): void {
    for (const retryManager of this.retryManagers.values()) {
      retryManager.reset();
    }
  }

  /**
   * Reset specific retry manager
   */
  reset(serviceId: string): void {
    const retryManager = this.retryManagers.get(serviceId);
    if (retryManager) {
      retryManager.reset();
    }
  }

  /**
   * Remove retry manager for service
   */
  remove(serviceId: string): void {
    const retryManager = this.retryManagers.get(serviceId);
    if (retryManager) {
      retryManager.removeAllListeners();
      this.retryManagers.delete(serviceId);
    }
  }

  /**
   * Update configuration for all retry managers
   */
  updateGlobalConfig(config: Partial<RetryConfig>): void {
    Object.assign(this.defaultConfig, RetryConfigSchema.parse({ ...this.defaultConfig, ...config }));
    
    for (const retryManager of this.retryManagers.values()) {
      retryManager.updateConfig(config);
    }
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalServices: number;
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    averageSuccessRate: number;
    averageAttempts: number;
  } {
    const metrics = this.getAllMetrics();
    const services = Object.values(metrics);

    const totalServices = services.length;
    const totalAttempts = services.reduce((sum, m) => sum + m.totalAttempts, 0);
    const successfulAttempts = services.reduce((sum, m) => sum + m.successfulAttempts, 0);
    const failedAttempts = services.reduce((sum, m) => sum + m.failedAttempts, 0);
    
    const averageSuccessRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;
    const averageAttempts = services.length > 0 
      ? services.reduce((sum, m) => sum + m.averageAttempts, 0) / services.length 
      : 0;

    return {
      totalServices,
      totalAttempts,
      successfulAttempts,
      failedAttempts,
      averageSuccessRate,
      averageAttempts
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

/**
 * Utility functions for common retry scenarios
 */
export class RetryUtils {
  /**
   * Create retry config for API calls
   */
  static apiRetryConfig(): Partial<RetryConfig> {
    return {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      strategy: RetryStrategy.EXPONENTIAL_JITTER,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
      attemptTimeout: 30000,
      isRetryable: (error: Error) => {
        // Retry on network errors and 5xx status codes
        return /timeout|network|connection|5\d\d/i.test(error.message);
      }
    };
  }

  /**
   * Create retry config for database operations
   */
  static databaseRetryConfig(): Partial<RetryConfig> {
    return {
      maxAttempts: 5,
      baseDelay: 500,
      maxDelay: 5000,
      strategy: RetryStrategy.EXPONENTIAL,
      backoffMultiplier: 1.5,
      attemptTimeout: 10000,
      isRetryable: (error: Error) => {
        // Retry on connection errors and deadlocks
        return /connection|deadlock|lock|timeout/i.test(error.message);
      }
    };
  }

  /**
   * Create retry config for file operations
   */
  static fileRetryConfig(): Partial<RetryConfig> {
    return {
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 1000,
      strategy: RetryStrategy.LINEAR,
      attemptTimeout: 5000,
      isRetryable: (error: Error) => {
        // Retry on file system errors
        return /EBUSY|EMFILE|ENFILE|ENOENT/i.test(error.message);
      }
    };
  }

  /**
   * Create retry config for external service calls
   */
  static externalServiceRetryConfig(): Partial<RetryConfig> {
    return {
      maxAttempts: 4,
      baseDelay: 2000,
      maxDelay: 30000,
      strategy: RetryStrategy.EXPONENTIAL_JITTER,
      backoffMultiplier: 2.5,
      jitterFactor: 0.2,
      attemptTimeout: 60000,
      isRetryable: (error: Error) => {
        // Retry on service unavailable and rate limiting
        return /unavailable|rate.limit|429|502|503|504/i.test(error.message);
      }
    };
  }
}