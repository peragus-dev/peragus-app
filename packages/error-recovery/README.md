# @peragus/error-recovery

A comprehensive error recovery system for Node.js applications, providing circuit breakers, health checks, retry mechanisms, and graceful degradation capabilities.

## Features

- **Circuit Breaker Pattern**: Prevents cascade failures by monitoring service health and opening circuits when failure thresholds are exceeded
- **Health Check System**: Continuous monitoring of service availability with configurable intervals and thresholds
- **Intelligent Retry Mechanisms**: Exponential backoff, linear backoff, and fixed delay strategies with jitter support
- **Graceful Degradation**: Automatic fallback mechanisms with caching and rate limiting
- **Recovery Orchestration**: Coordinated recovery actions across all system components
- **Comprehensive Monitoring**: Real-time metrics and events for all recovery operations
- **TypeScript Support**: Full type safety with comprehensive type definitions

## Installation

```bash
npm install @peragus/error-recovery
```

## Quick Start

```typescript
import { ErrorRecoverySystem } from '@peragus/error-recovery';

// Create error recovery system
const errorRecovery = new ErrorRecoverySystem();

// Register a service
errorRecovery.registerService('my-api', async () => {
  // Health check function
  const response = await fetch('http://my-api/health');
  return response.ok;
}, {
  circuitBreakerConfig: {
    failureThreshold: 5,
    resetTimeout: 30000
  },
  retryConfig: {
    maxAttempts: 3,
    baseDelay: 1000,
    strategy: 'exponential'
  }
});

// Start monitoring
errorRecovery.start();

// Execute operations with full error recovery
const result = await errorRecovery.executeWithRecovery(
  'my-api',
  'fetch-data',
  async () => {
    const response = await fetch('http://my-api/data');
    return response.json();
  },
  {
    fallback: async () => {
      // Fallback when service is unavailable
      return { data: 'cached-data' };
    }
  }
);
```

## Core Components

### Circuit Breaker

Implements the circuit breaker pattern to prevent cascade failures:

```typescript
import { CircuitBreaker, CircuitBreakerState } from '@peragus/error-recovery';

const circuitBreaker = new CircuitBreaker('my-service', {
  failureThreshold: 5,
  resetTimeout: 30000,
  monitoringWindow: 60000
});

// Execute operation through circuit breaker
const result = await circuitBreaker.execute(async () => {
  return await someOperation();
});

// Check circuit breaker state
if (circuitBreaker.getState() === CircuitBreakerState.OPEN) {
  console.log('Circuit breaker is open - service is unavailable');
}
```

### Health Check Manager

Continuous health monitoring with configurable checks:

```typescript
import { HealthCheckManager } from '@peragus/error-recovery';

const healthManager = new HealthCheckManager();

// Register health check
healthManager.registerService('database', async () => {
  try {
    await db.ping();
    return true;
  } catch {
    return false;
  }
}, {
  interval: 30000,
  timeout: 5000,
  unhealthyThreshold: 3,
  healthyThreshold: 2
});

healthManager.start();

// Get health status
const health = healthManager.getServiceHealth('database');
console.log(`Database status: ${health.status}`);
```

### Retry Manager

Intelligent retry mechanisms with multiple strategies:

```typescript
import { RetryManager, RetryStrategy } from '@peragus/error-recovery';

const retryManager = new RetryManager('api-service', {
  maxAttempts: 5,
  baseDelay: 1000,
  strategy: RetryStrategy.EXPONENTIAL,
  backoffMultiplier: 2,
  jitter: true,
  maxDelay: 30000
});

// Execute with retry
const result = await retryManager.execute(async () => {
  const response = await fetch('http://api/endpoint');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
});
```

### Graceful Degradation

Automatic fallback mechanisms with caching:

```typescript
import { GracefulDegradationManager, DegradationLevel } from '@peragus/error-recovery';

const degradationManager = new GracefulDegradationManager('content-service', {
  level: DegradationLevel.NONE,
  cacheSettings: {
    enabled: true,
    ttl: 300000, // 5 minutes
    maxSize: 1000
  }
});

// Execute with caching and fallback
const content = await degradationManager.executeWithCache(
  'get-content',
  async () => {
    return await fetchContentFromAPI();
  },
  'content-key-123',
  async () => {
    return { content: 'Default content when service is unavailable' };
  }
);
```

## Configuration

### Circuit Breaker Configuration

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening circuit
  resetTimeout: number;          // Time before attempting to close circuit (ms)
  monitoringWindow: number;      // Time window for failure counting (ms)
  volumeThreshold: number;       // Minimum requests before circuit can open
  errorFilter?: (error: Error) => boolean; // Filter which errors count as failures
}
```

### Health Check Configuration

```typescript
interface HealthCheckConfig {
  interval: number;              // Check interval (ms)
  timeout: number;               // Check timeout (ms)
  unhealthyThreshold: number;    // Consecutive failures before unhealthy
  healthyThreshold: number;      // Consecutive successes before healthy
  deepCheck: boolean;            // Enable deep health checks
}
```

### Retry Configuration

```typescript
interface RetryConfig {
  maxAttempts: number;           // Maximum retry attempts
  baseDelay: number;             // Base delay between retries (ms)
  strategy: RetryStrategy;       // Retry strategy (exponential, linear, fixed)
  backoffMultiplier: number;     // Multiplier for exponential backoff
  jitter: boolean;               // Add random jitter to delays
  maxDelay: number;              // Maximum delay between retries (ms)
  retryableErrors?: string[];    // Error types that should trigger retries
}
```

### Degradation Configuration

```typescript
interface DegradationConfig {
  level: DegradationLevel;       // Initial degradation level
  disabledFeatures: string[];    // Features to disable during degradation
  fallbacks: Record<string, Function>; // Fallback functions
  cacheSettings: {
    enabled: boolean;
    ttl: number;                 // Cache time-to-live (ms)
    maxSize: number;             // Maximum cache entries
  };
  rateLimiting: {
    enabled: boolean;
    requestsPerMinute: number;   // Rate limit during degradation
  };
}
```

## Events and Monitoring

The error recovery system emits comprehensive events for monitoring:

```typescript
errorRecovery.on('circuit_breaker_opened', (event) => {
  console.log(`Circuit breaker opened for ${event.serviceId}`);
});

errorRecovery.on('health_check_failed', (event) => {
  console.log(`Health check failed for ${event.serviceId}`);
});

errorRecovery.on('retry_exhausted', (event) => {
  console.log(`Retries exhausted for ${event.serviceId}`);
});

errorRecovery.on('recovery_plan_completed', (event) => {
  console.log(`Recovery completed for ${event.serviceId}`);
});

// Get system health summary
const health = errorRecovery.getSystemHealth();
console.log(`System status: ${health.overallStatus}`);
console.log(`Healthy services: ${health.metrics.healthyServices}`);
console.log(`Degradation level: ${health.degradationLevel}`);
```

## Advanced Usage

### Custom Recovery Actions

```typescript
import { ErrorRecoveryOrchestrator } from '@peragus/error-recovery';

const orchestrator = new ErrorRecoveryOrchestrator();

// Register custom recovery action
orchestrator.registerRecoveryAction({
  id: 'restart-service',
  type: 'restart',
  priority: 9,
  condition: (context) => context.errorType === 'service_crash',
  execute: async (context) => {
    await restartService(context.serviceId);
  },
  timeout: 30000,
  retryable: true
});
```

### Integration with Existing Systems

```typescript
// Integration with Express.js
app.use(async (req, res, next) => {
  try {
    const result = await errorRecovery.executeWithRecovery(
      'user-service',
      'get-user',
      async () => {
        return await userService.getUser(req.params.id);
      },
      {
        fallback: async () => {
          return { id: req.params.id, name: 'Unknown User' };
        }
      }
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});
```

## Best Practices

1. **Service Registration**: Register all critical services with appropriate health checks
2. **Fallback Strategies**: Always provide meaningful fallbacks for user-facing operations
3. **Monitoring**: Monitor error recovery events and adjust thresholds based on system behavior
4. **Testing**: Test recovery scenarios in staging environments
5. **Graceful Degradation**: Design your system to degrade gracefully rather than fail completely

## API Reference

### ErrorRecoverySystem

Main class that provides a complete error recovery solution.

#### Methods

- `start()`: Start the error recovery system
- `stop()`: Stop the error recovery system
- `registerService(serviceId, healthCheck, options)`: Register a service for monitoring
- `executeWithRecovery(serviceId, operationName, operation, options)`: Execute operation with full error recovery
- `getSystemHealth()`: Get comprehensive system health summary
- `forceSystemDegradation(level, reason)`: Force system degradation
- `resetAll()`: Reset all recovery systems

### CircuitBreaker

Implements the circuit breaker pattern.

#### Methods

- `execute(operation)`: Execute operation through circuit breaker
- `getState()`: Get current circuit breaker state
- `getMetrics()`: Get circuit breaker metrics
- `reset()`: Reset circuit breaker to closed state

### HealthCheckManager

Manages health checks for multiple services.

#### Methods

- `registerService(serviceId, healthCheck, config)`: Register health check
- `unregisterService(serviceId)`: Unregister health check
- `checkService(serviceId)`: Force health check
- `getServiceHealth(serviceId)`: Get service health status
- `getSystemHealthSummary()`: Get system-wide health summary

### RetryManager

Manages retry logic with multiple strategies.

#### Methods

- `execute(operation)`: Execute operation with retry logic
- `getMetrics()`: Get retry metrics
- `reset()`: Reset retry state

### GracefulDegradationManager

Manages graceful degradation and fallback mechanisms.

#### Methods

- `executeWithCache(key, operation, cacheKey, fallback)`: Execute with caching
- `executeFallback(operationName, fallback)`: Execute fallback operation
- `setDegradationLevel(level, reason)`: Set degradation level
- `getCurrentState()`: Get current degradation state

## License

MIT License - see LICENSE file for details.