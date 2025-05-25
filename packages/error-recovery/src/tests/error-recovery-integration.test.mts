/**
 * Error Recovery System Integration Tests
 * Tests the complete error recovery system with all components working together
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import {
  ErrorRecoverySystem,
  CircuitBreakerState,
  HealthStatus,
  DegradationLevel,
  RetryStrategy
} from '../index.mjs';

describe('Error Recovery System Integration', () => {
  let errorRecoverySystem: ErrorRecoverySystem;
  let mockHealthCheck: MockedFunction<() => Promise<boolean>>;
  let mockOperation: MockedFunction<() => Promise<string>>;
  let mockFallback: MockedFunction<() => Promise<string>>;

  beforeEach(() => {
    errorRecoverySystem = new ErrorRecoverySystem();
    mockHealthCheck = vi.fn();
    mockOperation = vi.fn();
    mockFallback = vi.fn();
  });

  afterEach(() => {
    errorRecoverySystem.stop();
    vi.clearAllMocks();
  });

  describe('Service Registration and Health Monitoring', () => {
    it('should register a service and start monitoring', async () => {
      mockHealthCheck.mockResolvedValue(true);

      errorRecoverySystem.registerService('test-service', mockHealthCheck, {
        healthCheckConfig: {
          interval: 1000,
          timeout: 500,
          unhealthyThreshold: 2,
          healthyThreshold: 1
        }
      });

      errorRecoverySystem.start();

      // Wait for initial health check
      await new Promise(resolve => setTimeout(resolve, 100));

      const health = errorRecoverySystem.getSystemHealth();
      expect(health.services['test-service']).toBeDefined();
      expect(health.services['test-service'].health.status).toBe(HealthStatus.HEALTHY);
    });

    it('should detect unhealthy service and trigger recovery', async () => {
      mockHealthCheck.mockResolvedValue(false);

      const eventPromise = new Promise((resolve) => {
        errorRecoverySystem.on('recovery_plan_created', resolve);
      });

      errorRecoverySystem.registerService('test-service', mockHealthCheck, {
        healthCheckConfig: {
          interval: 100,
          timeout: 50,
          unhealthyThreshold: 1,
          healthyThreshold: 1
        }
      });

      errorRecoverySystem.start();

      // Wait for health check failure and recovery trigger
      await eventPromise;

      const health = errorRecoverySystem.getSystemHealth();
      expect(health.services['test-service'].health.status).toBe(HealthStatus.UNHEALTHY);
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should open circuit breaker after failures and trigger recovery', async () => {
      mockHealthCheck.mockResolvedValue(true);
      mockOperation.mockRejectedValue(new Error('Service unavailable'));

      const circuitBreakerEvents: any[] = [];
      errorRecoverySystem.on('circuit_breaker_opened', (event) => {
        circuitBreakerEvents.push(event);
      });

      errorRecoverySystem.registerService('test-service', mockHealthCheck, {
        circuitBreakerConfig: {
          failureThreshold: 3,
          resetTimeout: 1000,
          monitoringWindow: 10000
        }
      });

      errorRecoverySystem.start();

      // Trigger multiple failures to open circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await errorRecoverySystem.executeWithRecovery(
            'test-service',
            'test-operation',
            mockOperation
          );
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreakerEvents.length).toBeGreaterThan(0);
      expect(mockOperation).toHaveBeenCalledTimes(5);
    });

    it('should use fallback when circuit breaker is open', async () => {
      mockHealthCheck.mockResolvedValue(true);
      mockOperation.mockRejectedValue(new Error('Service unavailable'));
      mockFallback.mockResolvedValue('fallback-result');

      errorRecoverySystem.registerService('test-service', mockHealthCheck, {
        circuitBreakerConfig: {
          failureThreshold: 2,
          resetTimeout: 1000
        }
      });

      errorRecoverySystem.start();

      // Trigger failures to open circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await errorRecoverySystem.executeWithRecovery(
            'test-service',
            'test-operation',
            mockOperation
          );
        } catch (error) {
          // Expected to fail
        }
      }

      // Now try with fallback
      const result = await errorRecoverySystem.executeWithRecovery(
        'test-service',
        'test-operation',
        mockOperation,
        { fallback: mockFallback }
      );

      expect(result).toBe('fallback-result');
      expect(mockFallback).toHaveBeenCalled();
    });
  });

  describe('Retry Mechanism Integration', () => {
    it('should retry failed operations with exponential backoff', async () => {
      mockHealthCheck.mockResolvedValue(true);
      mockOperation
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      errorRecoverySystem.registerService('test-service', mockHealthCheck, {
        retryConfig: {
          maxAttempts: 3,
          baseDelay: 100,
          strategy: RetryStrategy.EXPONENTIAL,
          backoffMultiplier: 2
        }
      });

      errorRecoverySystem.start();

      const startTime = Date.now();
      const result = await errorRecoverySystem.executeWithRecovery(
        'test-service',
        'test-operation',
        mockOperation
      );
      const duration = Date.now() - startTime;

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(duration).toBeGreaterThan(300); // Should have delays
    });

    it('should exhaust retries and trigger recovery plan', async () => {
      mockHealthCheck.mockResolvedValue(true);
      mockOperation.mockRejectedValue(new Error('Persistent failure'));

      const recoveryEvents: any[] = [];
      errorRecoverySystem.on('retry_exhausted', (event) => {
        recoveryEvents.push(event);
      });

      errorRecoverySystem.registerService('test-service', mockHealthCheck, {
        retryConfig: {
          maxAttempts: 2,
          baseDelay: 50
        }
      });

      errorRecoverySystem.start();

      try {
        await errorRecoverySystem.executeWithRecovery(
          'test-service',
          'test-operation',
          mockOperation
        );
      } catch (error) {
        expect(error.message).toBe('Persistent failure');
      }

      expect(mockOperation).toHaveBeenCalledTimes(2);
      expect(recoveryEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Graceful Degradation Integration', () => {
    it('should activate degradation mode and use cache', async () => {
      mockHealthCheck.mockResolvedValue(true);
      mockOperation
        .mockResolvedValueOnce('original-result')
        .mockRejectedValue(new Error('Service degraded'));

      errorRecoverySystem.registerService('test-service', mockHealthCheck, {
        degradationConfig: {
          level: DegradationLevel.NONE,
          cacheSettings: {
            enabled: true,
            ttl: 5000,
            maxSize: 100
          }
        }
      });

      errorRecoverySystem.start();

      // First call should succeed and cache result
      const orchestrator = errorRecoverySystem.getOrchestrator();
      const degradationManager = orchestrator['degradationManager'].getDegradationManager('test-service');
      
      const result1 = await degradationManager.executeWithCache(
        'test-operation',
        mockOperation,
        'cache-key-1'
      );

      expect(result1).toBe('original-result');

      // Force degradation
      degradationManager.setDegradationLevel(DegradationLevel.PARTIAL, 'Test degradation');

      // Second call should use cache even though operation fails
      const result2 = await degradationManager.executeWithCache(
        'test-operation',
        mockOperation,
        'cache-key-1'
      );

      expect(result2).toBe('original-result'); // From cache
    });

    it('should escalate degradation levels based on system health', async () => {
      const services = ['service-1', 'service-2', 'service-3'];
      
      // Register multiple services
      services.forEach(serviceId => {
        const healthCheck = vi.fn().mockResolvedValue(false); // All unhealthy
        errorRecoverySystem.registerService(serviceId, healthCheck);
      });

      errorRecoverySystem.start();

      // Wait for health checks and system degradation
      await new Promise(resolve => setTimeout(resolve, 200));

      const health = errorRecoverySystem.getSystemHealth();
      expect(health.degradationLevel).toBe(DegradationLevel.EMERGENCY);
    });
  });

  describe('Recovery Orchestration', () => {
    it('should execute recovery plan with multiple actions', async () => {
      mockHealthCheck.mockResolvedValue(false);

      const recoveryEvents: any[] = [];
      errorRecoverySystem.on('recovery_plan_completed', (event) => {
        recoveryEvents.push(event);
      });

      errorRecoverySystem.registerService('test-service', mockHealthCheck, {
        healthCheckConfig: {
          interval: 100,
          unhealthyThreshold: 1
        }
      });

      errorRecoverySystem.start();

      // Wait for recovery plan execution
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(recoveryEvents.length).toBeGreaterThan(0);
      
      const recoveryPlan = recoveryEvents[0];
      expect(recoveryPlan.data.success).toBeDefined();
    });

    it('should coordinate recovery across multiple failing services', async () => {
      const services = ['service-1', 'service-2'];
      const healthChecks = services.map(() => vi.fn().mockResolvedValue(false));

      const systemEvents: any[] = [];
      errorRecoverySystem.on('system_health_check', (event) => {
        systemEvents.push(event);
      });

      services.forEach((serviceId, index) => {
        errorRecoverySystem.registerService(serviceId, healthChecks[index]);
      });

      errorRecoverySystem.start();

      // Wait for system health checks
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(systemEvents.length).toBeGreaterThan(0);
      
      const health = errorRecoverySystem.getSystemHealth();
      expect(health.metrics.unhealthyServices).toBe(2);
      expect(health.degradationLevel).not.toBe(DegradationLevel.NONE);
    });
  });

  describe('System Reset and Recovery', () => {
    it('should reset all systems and restore normal operation', async () => {
      mockHealthCheck.mockResolvedValue(false);

      errorRecoverySystem.registerService('test-service', mockHealthCheck);
      errorRecoverySystem.start();

      // Wait for degradation
      await new Promise(resolve => setTimeout(resolve, 100));

      let health = errorRecoverySystem.getSystemHealth();
      expect(health.degradationLevel).not.toBe(DegradationLevel.NONE);

      // Reset system
      errorRecoverySystem.resetAll();

      health = errorRecoverySystem.getSystemHealth();
      expect(health.degradationLevel).toBe(DegradationLevel.NONE);
    });
  });

  describe('Event Handling and Monitoring', () => {
    it('should emit comprehensive events throughout recovery process', async () => {
      const events: any[] = [];
      const eventTypes = [
        'service_registered',
        'health_check_failed',
        'circuit_breaker_opened',
        'retry_exhausted',
        'degradation_activated',
        'recovery_plan_created',
        'recovery_plan_completed'
      ];

      eventTypes.forEach(eventType => {
        errorRecoverySystem.on(eventType, (event) => {
          events.push({ type: eventType, event });
        });
      });

      mockHealthCheck.mockResolvedValue(false);
      mockOperation.mockRejectedValue(new Error('Test failure'));

      errorRecoverySystem.registerService('test-service', mockHealthCheck, {
        circuitBreakerConfig: { failureThreshold: 1 },
        retryConfig: { maxAttempts: 1 }
      });

      errorRecoverySystem.start();

      // Trigger failures
      try {
        await errorRecoverySystem.executeWithRecovery(
          'test-service',
          'test-operation',
          mockOperation
        );
      } catch (error) {
        // Expected
      }

      // Wait for events
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'service_registered')).toBe(true);
    });
  });

  describe('Performance and Metrics', () => {
    it('should track comprehensive metrics across all components', async () => {
      mockHealthCheck.mockResolvedValue(true);
      mockOperation.mockResolvedValue('success');

      errorRecoverySystem.registerService('test-service', mockHealthCheck);
      errorRecoverySystem.start();

      // Execute multiple operations
      for (let i = 0; i < 5; i++) {
        await errorRecoverySystem.executeWithRecovery(
          'test-service',
          'test-operation',
          mockOperation
        );
      }

      const health = errorRecoverySystem.getSystemHealth();
      const service = health.services['test-service'];

      expect(service.circuitBreaker.totalRequests).toBe(5);
      expect(service.circuitBreaker.successCount).toBe(5);
      expect(service.retry.totalAttempts).toBeGreaterThan(0);
      expect(service.health.status).toBe(HealthStatus.HEALTHY);
    });
  });
});