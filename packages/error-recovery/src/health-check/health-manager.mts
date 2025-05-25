/**
 * Health Check Manager
 * Monitors service availability and provides health status with intelligent detection
 */

import { EventEmitter } from 'events';
import {
  HealthStatus,
  type HealthCheckConfig,
  type HealthCheckResult,
  type ServiceHealth,
  type ErrorRecoveryEvent,
  HealthCheckConfigSchema
} from '../types/index.mjs';

export class HealthCheckManager extends EventEmitter {
  private readonly services = new Map<string, ServiceHealthTracker>();
  private readonly defaultConfig: HealthCheckConfig;
  private globalInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(defaultConfig: Partial<HealthCheckConfig> = {}) {
    super();
    this.defaultConfig = HealthCheckConfigSchema.parse(defaultConfig);
  }

  /**
   * Register a service for health monitoring
   */
  registerService(
    serviceId: string,
    healthCheckFn: () => Promise<boolean>,
    config?: Partial<HealthCheckConfig>
  ): void {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const validatedConfig = HealthCheckConfigSchema.parse(mergedConfig);

    const tracker = new ServiceHealthTracker(serviceId, healthCheckFn, validatedConfig);
    
    // Forward events
    tracker.on('health_changed', (event) => {
      this.emit('health_changed', event);
      this.emit('event', event);
    });

    this.services.set(serviceId, tracker);

    // Start monitoring if not already running
    if (!this.isRunning) {
      this.start();
    }
  }

  /**
   * Unregister a service from health monitoring
   */
  unregisterService(serviceId: string): void {
    const tracker = this.services.get(serviceId);
    if (tracker) {
      tracker.stop();
      tracker.removeAllListeners();
      this.services.delete(serviceId);
    }

    // Stop global monitoring if no services
    if (this.services.size === 0 && this.isRunning) {
      this.stop();
    }
  }

  /**
   * Start health monitoring for all services
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Start individual service monitoring
    for (const tracker of this.services.values()) {
      tracker.start();
    }

    // Start global health check interval
    const minInterval = Math.min(
      ...Array.from(this.services.values()).map(t => t.getConfig().interval),
      this.defaultConfig.interval
    );

    this.globalInterval = setInterval(() => {
      this.performGlobalHealthCheck();
    }, minInterval);

    this.emitEvent('health_monitoring_started', {
      serviceCount: this.services.size,
      interval: minInterval
    });
  }

  /**
   * Stop health monitoring for all services
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop individual service monitoring
    for (const tracker of this.services.values()) {
      tracker.stop();
    }

    // Stop global interval
    if (this.globalInterval) {
      clearInterval(this.globalInterval);
      this.globalInterval = null;
    }

    this.emitEvent('health_monitoring_stopped', {
      serviceCount: this.services.size
    });
  }

  /**
   * Perform immediate health check for a specific service
   */
  async checkService(serviceId: string): Promise<HealthCheckResult | null> {
    const tracker = this.services.get(serviceId);
    if (!tracker) {
      return null;
    }

    return tracker.performHealthCheck();
  }

  /**
   * Perform immediate health check for all services
   */
  async checkAllServices(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {};

    const promises = Array.from(this.services.entries()).map(async ([serviceId, tracker]) => {
      try {
        const result = await tracker.performHealthCheck();
        results[serviceId] = result;
      } catch (error) {
        results[serviceId] = {
          status: HealthStatus.UNHEALTHY,
          timestamp: new Date(),
          responseTime: 0,
          details: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metadata: { error: error instanceof Error ? error.message : String(error) }
        };
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Get health status for a specific service
   */
  getServiceHealth(serviceId: string): ServiceHealth | null {
    const tracker = this.services.get(serviceId);
    return tracker ? tracker.getHealth() : null;
  }

  /**
   * Get health status for all services
   */
  getAllServiceHealth(): Record<string, ServiceHealth> {
    const health: Record<string, ServiceHealth> = {};

    for (const [serviceId, tracker] of this.services) {
      health[serviceId] = tracker.getHealth();
    }

    return health;
  }

  /**
   * Get overall system health summary
   */
  getSystemHealthSummary(): {
    overallStatus: HealthStatus;
    serviceCount: number;
    healthyServices: number;
    degradedServices: number;
    unhealthyServices: number;
    unknownServices: number;
    lastCheck: Date;
    uptime: number;
  } {
    const allHealth = this.getAllServiceHealth();
    const services = Object.values(allHealth);

    const serviceCount = services.length;
    const healthyServices = services.filter(s => s.status === HealthStatus.HEALTHY).length;
    const degradedServices = services.filter(s => s.status === HealthStatus.DEGRADED).length;
    const unhealthyServices = services.filter(s => s.status === HealthStatus.UNHEALTHY).length;
    const unknownServices = services.filter(s => s.status === HealthStatus.UNKNOWN).length;

    // Determine overall status
    let overallStatus: HealthStatus;
    if (unhealthyServices > 0) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (degradedServices > 0) {
      overallStatus = HealthStatus.DEGRADED;
    } else if (healthyServices > 0) {
      overallStatus = HealthStatus.HEALTHY;
    } else {
      overallStatus = HealthStatus.UNKNOWN;
    }

    const lastCheck = services.length > 0 
      ? new Date(Math.max(...services.map(s => s.lastCheck.getTime())))
      : new Date();

    const uptime = services.length > 0
      ? services.reduce((sum, s) => sum + s.uptime, 0) / services.length
      : 0;

    return {
      overallStatus,
      serviceCount,
      healthyServices,
      degradedServices,
      unhealthyServices,
      unknownServices,
      lastCheck,
      uptime
    };
  }

  /**
   * Force a service to a specific health status (for testing)
   */
  forceServiceStatus(serviceId: string, status: HealthStatus, reason: string): void {
    const tracker = this.services.get(serviceId);
    if (tracker) {
      tracker.forceStatus(status, reason);
    }
  }

  /**
   * Reset health status for a service
   */
  resetServiceHealth(serviceId: string): void {
    const tracker = this.services.get(serviceId);
    if (tracker) {
      tracker.reset();
    }
  }

  /**
   * Perform global health check coordination
   */
  private async performGlobalHealthCheck(): Promise<void> {
    try {
      const summary = this.getSystemHealthSummary();
      
      this.emitEvent('global_health_check', {
        summary,
        timestamp: new Date()
      });

      // Emit alerts for critical health issues
      if (summary.overallStatus === HealthStatus.UNHEALTHY) {
        this.emitEvent('system_health_critical', {
          summary,
          unhealthyServices: summary.unhealthyServices,
          totalServices: summary.serviceCount
        });
      }
    } catch (error) {
      this.emitEvent('global_health_check_failed', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      });
    }
  }

  /**
   * Emit health check event
   */
  private emitEvent(type: string, data: Record<string, any>): void {
    const event: ErrorRecoveryEvent = {
      id: `hc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: type as any,
      serviceId: 'health-manager',
      timestamp: new Date(),
      data,
      severity: type.includes('critical') ? 'critical' : 
               type.includes('failed') ? 'high' : 'medium'
    };

    this.emit('event', event);
    this.emit(type, event);
  }
}

/**
 * Individual service health tracker
 */
class ServiceHealthTracker extends EventEmitter {
  private readonly serviceId: string;
  private readonly healthCheckFn: () => Promise<boolean>;
  private readonly config: HealthCheckConfig;
  private status: HealthStatus = HealthStatus.UNKNOWN;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastCheck = new Date();
  private checks: HealthCheckResult[] = [];
  private interval: NodeJS.Timeout | null = null;
  private readonly startTime = new Date();
  private isRunning = false;

  constructor(
    serviceId: string,
    healthCheckFn: () => Promise<boolean>,
    config: HealthCheckConfig
  ) {
    super();
    this.serviceId = serviceId;
    this.healthCheckFn = healthCheckFn;
    this.config = config;
  }

  /**
   * Start health monitoring for this service
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.interval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error(`Health check failed for service ${this.serviceId}:`, error);
      });
    }, this.config.interval);

    // Perform initial health check
    this.performHealthCheck().catch(error => {
      console.error(`Initial health check failed for service ${this.serviceId}:`, error);
    });
  }

  /**
   * Stop health monitoring for this service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let result: HealthCheckResult;

    try {
      // Execute health check with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), this.config.timeout);
      });

      const healthCheckPromise = this.config.customCheck 
        ? this.config.customCheck()
        : this.healthCheckFn();

      const isHealthy = await Promise.race([healthCheckPromise, timeoutPromise]);
      const responseTime = Date.now() - startTime;

      result = {
        status: isHealthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        timestamp: new Date(),
        responseTime,
        details: isHealthy ? 'Health check passed' : 'Health check failed',
        metadata: { isHealthy }
      };

      this.onHealthCheckResult(result);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      result = {
        status: HealthStatus.UNHEALTHY,
        timestamp: new Date(),
        responseTime,
        details: `Health check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: error instanceof Error ? error.message : String(error) }
      };

      this.onHealthCheckResult(result);
    }

    this.lastCheck = result.timestamp;
    this.addCheckResult(result);

    return result;
  }

  /**
   * Get current health status
   */
  getHealth(): ServiceHealth {
    const uptime = Date.now() - this.startTime.getTime();

    return {
      serviceId: this.serviceId,
      status: this.status,
      lastCheck: this.lastCheck,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      uptime,
      checks: [...this.checks],
      config: { ...this.config }
    };
  }

  /**
   * Get configuration
   */
  getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  /**
   * Force status (for testing)
   */
  forceStatus(status: HealthStatus, reason: string): void {
    const previousStatus = this.status;
    this.status = status;

    if (previousStatus !== status) {
      this.emitHealthChanged(previousStatus, reason);
    }
  }

  /**
   * Reset health status
   */
  reset(): void {
    this.status = HealthStatus.UNKNOWN;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.checks = [];
  }

  /**
   * Handle health check result
   */
  private onHealthCheckResult(result: HealthCheckResult): void {
    const previousStatus = this.status;

    if (result.status === HealthStatus.HEALTHY) {
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;

      // Transition to healthy if we have enough consecutive successes
      if (this.consecutiveSuccesses >= this.config.healthyThreshold) {
        this.status = HealthStatus.HEALTHY;
      }
    } else {
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;

      // Transition to unhealthy if we have enough consecutive failures
      if (this.consecutiveFailures >= this.config.unhealthyThreshold) {
        this.status = HealthStatus.UNHEALTHY;
      } else if (this.status === HealthStatus.HEALTHY) {
        // Transition to degraded on first failure from healthy
        this.status = HealthStatus.DEGRADED;
      }
    }

    // Emit event if status changed
    if (previousStatus !== this.status) {
      this.emitHealthChanged(previousStatus, result.details);
    }
  }

  /**
   * Add check result to history
   */
  private addCheckResult(result: HealthCheckResult): void {
    this.checks.push(result);

    // Keep only recent checks (last 100)
    if (this.checks.length > 100) {
      this.checks.shift();
    }
  }

  /**
   * Emit health status change event
   */
  private emitHealthChanged(previousStatus: HealthStatus, details: string): void {
    const event: ErrorRecoveryEvent = {
      id: `hc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: this.status === HealthStatus.UNHEALTHY ? 'health_check_failed' : 'health_check_recovered',
      serviceId: this.serviceId,
      timestamp: new Date(),
      data: {
        previousStatus,
        currentStatus: this.status,
        consecutiveFailures: this.consecutiveFailures,
        consecutiveSuccesses: this.consecutiveSuccesses,
        details
      },
      severity: this.status === HealthStatus.UNHEALTHY ? 'high' : 'medium'
    };

    this.emit('health_changed', event);
  }
}