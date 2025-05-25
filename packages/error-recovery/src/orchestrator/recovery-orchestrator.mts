/**
 * Error Recovery Orchestrator
 * Coordinates recovery actions across circuit breakers, health checks, retry mechanisms, and graceful degradation
 */

import { EventEmitter } from 'events';
import {
  type RecoveryAction,
  type RecoveryContext,
  type RecoveryResult,
  type RecoveryPlan,
  type ErrorRecoveryEvent,
  HealthStatus,
  CircuitBreakerState,
  DegradationLevel
} from '../types/index.mjs';
import { CircuitBreakerManager } from '../circuit-breaker/circuit-breaker.mjs';
import { HealthCheckManager } from '../health-check/health-manager.mjs';
import { GlobalRetryManager } from '../retry/retry-manager.mjs';
import { GlobalDegradationManager } from '../degradation/degradation-manager.mjs';

export class ErrorRecoveryOrchestrator extends EventEmitter {
  private readonly circuitBreakerManager: CircuitBreakerManager;
  private readonly healthCheckManager: HealthCheckManager;
  private readonly retryManager: GlobalRetryManager;
  private readonly degradationManager: GlobalDegradationManager;
  
  private readonly recoveryPlans = new Map<string, RecoveryPlan>();
  private readonly recoveryActions = new Map<string, RecoveryAction>();
  private readonly serviceStates = new Map<string, {
    lastError: Date;
    errorCount: number;
    recoveryAttempts: number;
    lastRecoveryAttempt: Date | null;
  }>();

  private isRunning = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly monitoringIntervalMs = 30000; // 30 seconds

  constructor() {
    super();
    
    this.circuitBreakerManager = new CircuitBreakerManager();
    this.healthCheckManager = new HealthCheckManager();
    this.retryManager = new GlobalRetryManager();
    this.degradationManager = new GlobalDegradationManager();

    this.setupEventHandlers();
    this.registerDefaultRecoveryActions();
  }

  /**
   * Start the error recovery orchestrator
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.healthCheckManager.start();

    // Start monitoring interval
    this.monitoringInterval = setInterval(() => {
      this.performSystemHealthCheck();
    }, this.monitoringIntervalMs);

    this.emitEvent('orchestrator_started', {
      monitoringInterval: this.monitoringIntervalMs
    });
  }

  /**
   * Stop the error recovery orchestrator
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.healthCheckManager.stop();

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emitEvent('orchestrator_stopped', {});
  }

  /**
   * Register a service for error recovery
   */
  registerService(
    serviceId: string,
    healthCheckFn: () => Promise<boolean>,
    options: {
      circuitBreakerConfig?: any;
      healthCheckConfig?: any;
      retryConfig?: any;
      degradationConfig?: any;
    } = {}
  ): void {
    // Register with health check manager
    this.healthCheckManager.registerService(serviceId, healthCheckFn, options.healthCheckConfig);

    // Initialize circuit breaker
    this.circuitBreakerManager.getCircuitBreaker(serviceId, options.circuitBreakerConfig);

    // Initialize retry manager
    this.retryManager.getRetryManager(serviceId, options.retryConfig);

    // Initialize degradation manager
    this.degradationManager.getDegradationManager(serviceId, options.degradationConfig);

    // Initialize service state
    this.serviceStates.set(serviceId, {
      lastError: new Date(),
      errorCount: 0,
      recoveryAttempts: 0,
      lastRecoveryAttempt: null
    });

    this.emitEvent('service_registered', {
      serviceId,
      options
    });
  }

  /**
   * Unregister a service from error recovery
   */
  unregisterService(serviceId: string): void {
    this.healthCheckManager.unregisterService(serviceId);
    this.circuitBreakerManager.remove(serviceId);
    this.retryManager.remove(serviceId);
    this.degradationManager.remove(serviceId);
    this.serviceStates.delete(serviceId);

    // Remove any active recovery plans for this service
    for (const [planId, plan] of this.recoveryPlans) {
      if (plan.serviceId === serviceId) {
        this.recoveryPlans.delete(planId);
      }
    }

    this.emitEvent('service_unregistered', { serviceId });
  }

  /**
   * Execute operation with full error recovery protection
   */
  async executeWithRecovery<T>(
    serviceId: string,
    operationName: string,
    operation: () => Promise<T>,
    options: {
      fallback?: () => Promise<T>;
      skipCircuitBreaker?: boolean;
      skipRetry?: boolean;
      skipDegradation?: boolean;
    } = {}
  ): Promise<T> {
    const context = await this.createRecoveryContext(serviceId, operationName);

    try {
      // Check circuit breaker
      if (!options.skipCircuitBreaker) {
        const circuitBreaker = this.circuitBreakerManager.getCircuitBreaker(serviceId);
        if (!circuitBreaker.canExecute()) {
          throw new Error(`Circuit breaker is open for service: ${serviceId}`);
        }
      }

      // Execute with retry logic
      if (!options.skipRetry) {
        const retryManager = this.retryManager.getRetryManager(serviceId);
        return await retryManager.execute(operation);
      } else {
        return await operation();
      }
    } catch (error) {
      // Record error
      this.recordServiceError(serviceId, error as Error);

      // Try degradation fallback
      if (!options.skipDegradation && options.fallback) {
        const degradationManager = this.degradationManager.getDegradationManager(serviceId);
        return await degradationManager.executeFallback(operationName, options.fallback);
      }

      // Trigger recovery plan
      await this.triggerRecovery(serviceId, error as Error, context);
      throw error;
    }
  }

  /**
   * Register a custom recovery action
   */
  registerRecoveryAction(action: RecoveryAction): void {
    this.recoveryActions.set(action.id, action);
    
    this.emitEvent('recovery_action_registered', {
      actionId: action.id,
      actionType: action.type,
      priority: action.priority
    });
  }

  /**
   * Trigger recovery for a service
   */
  async triggerRecovery(serviceId: string, error: Error, context?: RecoveryContext): Promise<RecoveryPlan> {
    const recoveryContext = context || await this.createRecoveryContext(serviceId, 'manual_trigger', error);
    
    // Create recovery plan
    const plan = await this.createRecoveryPlan(serviceId, recoveryContext);
    
    // Execute recovery plan
    await this.executeRecoveryPlan(plan);
    
    return plan;
  }

  /**
   * Get system health summary
   */
  getSystemHealthSummary(): {
    overallStatus: HealthStatus;
    services: Record<string, any>;
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
  } {
    const healthSummary = this.healthCheckManager.getSystemHealthSummary();
    const circuitBreakerSummary = this.circuitBreakerManager.getHealthSummary();
    const degradationSummary = this.degradationManager.getSystemSummary();
    const retrySummary = this.retryManager.getSummary();

    const services: Record<string, any> = {};
    for (const serviceId of this.serviceStates.keys()) {
      const health = this.healthCheckManager.getServiceHealth(serviceId);
      const circuitBreaker = this.circuitBreakerManager.getCircuitBreaker(serviceId).getMetrics();
      const retry = this.retryManager.getRetryManager(serviceId).getMetrics();
      const degradation = this.degradationManager.getDegradationManager(serviceId).getCurrentState();

      services[serviceId] = {
        health,
        circuitBreaker,
        retry,
        degradation
      };
    }

    return {
      overallStatus: healthSummary.overallStatus,
      services,
      degradationLevel: degradationSummary.globalLevel,
      activeRecoveryPlans: Array.from(this.recoveryPlans.values())
        .filter(plan => plan.status === 'executing' || plan.status === 'pending').length,
      metrics: {
        totalServices: healthSummary.serviceCount,
        healthyServices: healthSummary.healthyServices,
        degradedServices: healthSummary.degradedServices,
        unhealthyServices: healthSummary.unhealthyServices,
        openCircuitBreakers: circuitBreakerSummary.open,
        activeRetries: retrySummary.totalServices
      }
    };
  }

  /**
   * Get active recovery plans
   */
  getActiveRecoveryPlans(): RecoveryPlan[] {
    return Array.from(this.recoveryPlans.values())
      .filter(plan => plan.status === 'executing' || plan.status === 'pending');
  }

  /**
   * Get recovery plan by ID
   */
  getRecoveryPlan(planId: string): RecoveryPlan | null {
    return this.recoveryPlans.get(planId) || null;
  }

  /**
   * Force system degradation
   */
  forceSystemDegradation(level: DegradationLevel, reason: string): void {
    this.degradationManager.setGlobalDegradationLevel(level, reason);
    
    this.emitEvent('system_degradation_forced', {
      level,
      reason,
      timestamp: new Date()
    });
  }

  /**
   * Reset all recovery systems
   */
  resetAll(): void {
    this.circuitBreakerManager.resetAll();
    this.retryManager.resetAll();
    this.degradationManager.setGlobalDegradationLevel(DegradationLevel.NONE, 'Manual reset');
    
    // Clear recovery plans
    this.recoveryPlans.clear();
    
    // Reset service states
    for (const [_serviceId, state] of this.serviceStates) {
      state.errorCount = 0;
      state.recoveryAttempts = 0;
      state.lastRecoveryAttempt = null;
    }

    this.emitEvent('system_reset', {
      timestamp: new Date()
    });
  }

  /**
   * Setup event handlers for component events
   */
  private setupEventHandlers(): void {
    // Circuit breaker events
    this.circuitBreakerManager.on('event', (event: ErrorRecoveryEvent) => {
      this.handleCircuitBreakerEvent(event);
    });

    // Health check events
    this.healthCheckManager.on('event', (event: ErrorRecoveryEvent) => {
      this.handleHealthCheckEvent(event);
    });

    // Retry events
    this.retryManager.on('event', (event: ErrorRecoveryEvent) => {
      this.handleRetryEvent(event);
    });

    // Degradation events
    this.degradationManager.on('event', (event: ErrorRecoveryEvent) => {
      this.handleDegradationEvent(event);
    });
  }

  /**
   * Handle circuit breaker events
   */
  private async handleCircuitBreakerEvent(event: ErrorRecoveryEvent): Promise<void> {
    if (event.type === 'circuit_breaker_opened') {
      // Circuit breaker opened - trigger recovery
      const context = await this.createRecoveryContext(event.serviceId, 'circuit_breaker_opened');
      await this.triggerRecovery(event.serviceId, new Error('Circuit breaker opened'), context);
    }

    // Forward event
    this.emit('event', event);
  }

  /**
   * Handle health check events
   */
  private async handleHealthCheckEvent(event: ErrorRecoveryEvent): Promise<void> {
    if (event.type === 'health_check_failed') {
      // Health check failed - consider recovery
      const serviceHealth = this.healthCheckManager.getServiceHealth(event.serviceId);
      if (serviceHealth && serviceHealth.consecutiveFailures >= 3) {
        const context = await this.createRecoveryContext(event.serviceId, 'health_check_failed');
        await this.triggerRecovery(event.serviceId, new Error('Health check failed'), context);
      }
    }

    // Forward event
    this.emit('event', event);
  }

  /**
   * Handle retry events
   */
  private async handleRetryEvent(event: ErrorRecoveryEvent): Promise<void> {
    if (event.type === 'retry_exhausted') {
      // Retries exhausted - trigger recovery
      const context = await this.createRecoveryContext(event.serviceId, 'retry_exhausted');
      await this.triggerRecovery(event.serviceId, new Error('Retry exhausted'), context);
    }

    // Forward event
    this.emit('event', event);
  }

  /**
   * Handle degradation events
   */
  private handleDegradationEvent(event: ErrorRecoveryEvent): void {
    // Forward event
    this.emit('event', event);
  }

  /**
   * Create recovery context
   */
  private async createRecoveryContext(
    serviceId: string,
    errorType: string,
    error?: Error
  ): Promise<RecoveryContext> {
    const circuitBreaker = this.circuitBreakerManager.getCircuitBreaker(serviceId);
    const health = this.healthCheckManager.getServiceHealth(serviceId);
    const retry = this.retryManager.getRetryManager(serviceId);

    return {
      serviceId,
      errorType,
      error: error || new Error(`Error in ${errorType}`),
      metrics: {
        circuitBreaker: circuitBreaker.getMetrics(),
        health: health || {
          serviceId,
          status: HealthStatus.UNKNOWN,
          lastCheck: new Date(),
          consecutiveFailures: 0,
          consecutiveSuccesses: 0,
          uptime: 0,
          checks: [],
          config: {
            interval: 30000,
            timeout: 5000,
            unhealthyThreshold: 3,
            healthyThreshold: 2,
            deepCheck: false
          }
        },
        retry: retry.getMetrics()
      },
      timestamp: new Date(),
      previousActions: []
    };
  }

  /**
   * Create recovery plan
   */
  private async createRecoveryPlan(serviceId: string, context: RecoveryContext): Promise<RecoveryPlan> {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get applicable recovery actions
    const actions = this.getApplicableActions(context);
    
    const plan: RecoveryPlan = {
      id: planId,
      serviceId,
      actions,
      createdAt: new Date(),
      status: 'pending',
      results: []
    };

    this.recoveryPlans.set(planId, plan);
    
    this.emitEvent('recovery_plan_created', {
      planId,
      serviceId,
      actionCount: actions.length,
      context
    });

    return plan;
  }

  /**
   * Execute recovery plan
   */
  private async executeRecoveryPlan(plan: RecoveryPlan): Promise<void> {
    plan.status = 'executing';
    plan.executedAt = new Date();

    this.emitEvent('recovery_plan_started', {
      planId: plan.id,
      serviceId: plan.serviceId,
      actionCount: plan.actions.length
    });

    for (const action of plan.actions) {
      try {
        const context = await this.createRecoveryContext(plan.serviceId, 'recovery_action');
        const result = await this.executeRecoveryAction(action, context);
        plan.results.push(result);

        if (result.success) {
          this.emitEvent('recovery_action_success', {
            planId: plan.id,
            actionId: action.id,
            duration: result.duration
          });
          
          // If action succeeded and it's critical, we might stop here
          if (action.priority >= 9) {
            break;
          }
        } else {
          this.emitEvent('recovery_action_failed', {
            planId: plan.id,
            actionId: action.id,
            error: result.error?.message
          });
        }
      } catch (error) {
        const result: RecoveryResult = {
          success: false,
          action: action.id,
          duration: 0,
          error: error as Error
        };
        plan.results.push(result);
      }
    }

    plan.status = 'completed';
    plan.completedAt = new Date();

    this.emitEvent('recovery_plan_completed', {
      planId: plan.id,
      serviceId: plan.serviceId,
      success: plan.results.some(r => r.success),
      duration: plan.completedAt.getTime() - (plan.executedAt?.getTime() || plan.createdAt.getTime())
    });
  }

  /**
   * Execute individual recovery action
   */
  private async executeRecoveryAction(action: RecoveryAction, context: RecoveryContext): Promise<RecoveryResult> {
    const startTime = Date.now();

    try {
      await action.execute(context);
      
      return {
        success: true,
        action: action.id,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        action: action.id,
        duration: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  /**
   * Get applicable recovery actions for context
   */
  private getApplicableActions(context: RecoveryContext): RecoveryAction[] {
    const actions = Array.from(this.recoveryActions.values())
      .filter(action => action.condition(context))
      .sort((a, b) => b.priority - a.priority); // Sort by priority descending

    return actions;
  }

  /**
   * Record service error
   */
  private recordServiceError(serviceId: string, _error: Error): void {
    const state = this.serviceStates.get(serviceId);
    if (state) {
      state.lastError = new Date();
      state.errorCount++;
    }
  }

  /**
   * Perform system health check
   */
  private async performSystemHealthCheck(): Promise<void> {
    try {
      const summary = this.getSystemHealthSummary();
      
      // Check if system degradation is needed
      if (summary.metrics.unhealthyServices > summary.metrics.totalServices * 0.5) {
        // More than 50% of services are unhealthy
        this.forceSystemDegradation(DegradationLevel.EMERGENCY, 'System-wide health degradation');
      } else if (summary.metrics.unhealthyServices > summary.metrics.totalServices * 0.3) {
        // More than 30% of services are unhealthy
        this.forceSystemDegradation(DegradationLevel.MINIMAL, 'Partial system health degradation');
      } else if (summary.metrics.degradedServices > 0) {
        // Some services are degraded
        this.forceSystemDegradation(DegradationLevel.PARTIAL, 'Service degradation detected');
      } else {
        // System is healthy
        this.degradationManager.setGlobalDegradationLevel(DegradationLevel.NONE, 'System health restored');
      }

      this.emitEvent('system_health_check', {
        summary,
        timestamp: new Date()
      });
    } catch (error) {
      this.emitEvent('system_health_check_failed', {
        error: (error as Error).message,
        timestamp: new Date()
      });
    }
  }

  /**
   * Register default recovery actions
   */
  private registerDefaultRecoveryActions(): void {
    // Restart action
    this.registerRecoveryAction({
      id: 'restart_service',
      type: 'restart',
      priority: 8,
      condition: (context) => context.metrics.circuitBreaker.state === CircuitBreakerState.OPEN,
      execute: async (context) => {
        // Reset circuit breaker
        this.circuitBreakerManager.reset(context.serviceId);
        
        // Reset health check
        this.healthCheckManager.resetServiceHealth(context.serviceId);
      },
      timeout: 30000,
      retryable: true
    });

    // Reconnect action
    this.registerRecoveryAction({
      id: 'reconnect_service',
      type: 'reconnect',
      priority: 7,
      condition: (context) => context.metrics.health.status === HealthStatus.UNHEALTHY,
      execute: async (context) => {
        // Force health check
        await this.healthCheckManager.checkService(context.serviceId);
      },
      timeout: 15000,
      retryable: true
    });

    // Degrade service action
    this.registerRecoveryAction({
      id: 'degrade_service',
      type: 'degrade',
      priority: 6,
      condition: (context) => context.metrics.retry.failedAttempts > 5,
      execute: async (context) => {
        const degradationManager = this.degradationManager.getDegradationManager(context.serviceId);
        degradationManager.setDegradationLevel(DegradationLevel.PARTIAL, 'Recovery action triggered');
      },
      timeout: 5000,
      retryable: false
    });

    // Alert action
    this.registerRecoveryAction({
      id: 'alert_operators',
      type: 'alert',
      priority: 5,
      condition: () => true, // Always applicable
      execute: async (context) => {
        this.emitEvent('operator_alert', {
          serviceId: context.serviceId,
          errorType: context.errorType,
          error: context.error.message,
          metrics: context.metrics,
          severity: 'high'
        });
      },
      timeout: 1000,
      retryable: false
    });
  }

  /**
   * Emit orchestrator event
   */
  private emitEvent(type: string, data: Record<string, any>): void {
    const event: ErrorRecoveryEvent = {
      id: `orch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: type as any,
      serviceId: 'error-recovery-orchestrator',
      timestamp: new Date(),
      data,
      severity: type.includes('failed') || type.includes('critical') ? 'critical' : 
               type.includes('degradation') || type.includes('alert') ? 'high' : 'medium'
    };

    this.emit('event', event);
    this.emit(type, event);
  }
}