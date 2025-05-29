# Smithery SDK Migration Guide

## Overview

This guide explains how to migrate from the legacy MCP client to the enhanced Smithery-enabled client. The migration is designed to be gradual and backward-compatible.

## Key Benefits of Migration

1. **Enhanced Configuration**: Support for dot-notation parameters and base64-encoded configs
2. **Authenticated Connections**: Built-in API key authentication for Smithery servers
3. **Advanced Monitoring**: Connection metrics and health monitoring
4. **Performance Optimization**: Configuration caching and optimized transport
5. **Future-Ready**: Access to upcoming Smithery features like registry integration

## Migration Approach: Plugin Architecture

The migration uses a unique **plugin-based architecture** that allows:
- Gradual feature enablement through feature flags
- Complete backward compatibility
- Runtime switching between legacy and Smithery transports
- A/B testing of new features

## Quick Start

### Step 1: No Code Changes Required

The enhanced client is a drop-in replacement:

```typescript
// Before (still works)
import { MCPClientManager, createMCPClient } from '@peragus/mcp-client';

const client = await createMCPClient({
  servers: [{
    name: 'my-server',
    transport: 'http',
    url: 'http://localhost:3001'
  }]
});

// After (enhanced, but backward compatible)
import { EnhancedMCPClientManager, createEnhancedMCPClient } from '@peragus/mcp-client';

const client = await createEnhancedMCPClient({
  servers: [{
    name: 'my-server',
    transport: 'http',
    url: 'http://localhost:3001'
  }]
});
```

### Step 2: Enable Smithery Features Gradually

```typescript
const client = await createEnhancedMCPClient({
  servers: [{
    name: 'my-server',
    transport: 'http',
    url: 'http://localhost:3001'
  }],
  plugins: {
    transport: {
      smithery: {
        enabled: true,  // Enable Smithery transport
        apiKey: 'your-api-key'  // Optional authentication
      },
      featureFlags: {
        useSmitheryUrl: true,  // Use Smithery URL generation
        enableAdvancedConfig: true,  // Advanced config parsing
        enableDotNotation: true  // Dot-notation support
      }
    }
  },
  experimental: {
    configCache: true,  // Cache configurations
    metricsCollection: true  // Collect usage metrics
  }
});
```

## Feature Flags Explained

### `smithery.enabled`
- **Default**: `false`
- **Purpose**: Switches to Smithery transport adapter
- **Impact**: None on API, changes internal transport handling

### `useSmitheryUrl`
- **Default**: `false`
- **Purpose**: Enables Smithery URL generation with auth
- **Requires**: `smithery.enabled = true`

### `enableAdvancedConfig`
- **Default**: `false`
- **Purpose**: Enables advanced configuration parsing
- **Benefits**: Better error messages, validation

### `enableDotNotation`
- **Default**: `false`
- **Purpose**: Support for `server.host=localhost` style params
- **Use Case**: Easier configuration via URL parameters

## Advanced Usage

### Monitoring Connection Health

```typescript
// Get metrics for a specific connection
const metrics = client.getConnectionMetrics('my-server');
console.log({
  uptime: Date.now() - metrics.createdAt.getTime(),
  requests: metrics.requestCount,
  errors: metrics.errorCount,
  avgResponseTime: metrics.averageResponseTime
});

// Get all connection metrics
const allMetrics = client.getAllConnectionMetrics();
```

### Using Configuration Cache

```typescript
const client = await createEnhancedMCPClient({
  // ... server config
  experimental: {
    configCache: true,
    configCacheTTL: 300000  // 5 minutes
  }
});
```

### Custom Transport Adapters

```typescript
import { TransportAdapterFactory } from '@peragus/mcp-client';

// Create custom adapter
const adapter = TransportAdapterFactory.create(
  serverConfig,
  { smithery: { enabled: true } }
);

// Check adapter metadata
console.log(adapter.getMetadata());
// Output: { provider: 'smithery', features: [...], version: '2.0.0' }
```

## Configuration Examples

### Dot-Notation Configuration

```typescript
// URL: http://server.com/mcp?server.host=localhost&server.port=8080&debug=true

const config = parseDotNotationConfig(urlParams);
// Result: { server: { host: 'localhost', port: 8080 }, debug: true }
```

### Base64 Encoded Configuration

```typescript
const smitheryUrl = createSmitheryUrl('http://server.com', {
  apiKey: 'secret-key',
  config: {
    server: { host: 'localhost', port: 8080 },
    features: { ai: true }
  }
});
// URL includes base64-encoded config parameter
```

## Testing Your Migration

### 1. Verify Backward Compatibility

```typescript
// Your existing code should work without changes
const legacyClient = new MCPClientManager(config);
const enhancedClient = new EnhancedMCPClientManager(config);

// Both should behave identically
```

### 2. Test Feature Flags Incrementally

```typescript
// Start with all flags disabled
const config = {
  plugins: {
    transport: {
      smithery: { enabled: false }
    }
  }
};

// Enable one at a time and test
config.plugins.transport.smithery.enabled = true;
// Test...

config.plugins.transport.featureFlags.useSmitheryUrl = true;
// Test...
```

### 3. Monitor Performance

```typescript
// Before migration
const startTime = Date.now();
await client.callTool('server', 'tool', args);
console.log('Legacy time:', Date.now() - startTime);

// After migration
const metrics = client.getConnectionMetrics('server');
console.log('Enhanced avg time:', metrics.averageResponseTime);
```

## Rollback Strategy

If issues arise, you can:

1. **Disable Smithery features** without code changes:
   ```typescript
   config.plugins.transport.smithery.enabled = false;
   ```

2. **Switch back to legacy client**:
   ```typescript
   // Change import
   import { MCPClientManager } from '@peragus/mcp-client';
   // Instead of EnhancedMCPClientManager
   ```

3. **Use feature flags** for gradual rollback:
   ```typescript
   // Disable specific features
   config.plugins.transport.featureFlags.useSmitheryUrl = false;
   ```

## Common Migration Patterns

### Pattern 1: A/B Testing

```typescript
const useEnhanced = Math.random() > 0.5;

const client = useEnhanced
  ? await createEnhancedMCPClient(enhancedConfig)
  : await createMCPClient(legacyConfig);
```

### Pattern 2: Environment-Based

```typescript
const config = {
  plugins: {
    transport: {
      smithery: {
        enabled: process.env.USE_SMITHERY === 'true'
      }
    }
  }
};
```

### Pattern 3: Progressive Rollout

```typescript
const enabledServers = ['server1', 'server2'];

const config = {
  servers: servers.map(server => ({
    ...server,
    plugins: enabledServers.includes(server.name)
      ? { transport: { smithery: { enabled: true } } }
      : undefined
  }))
};
```

## Troubleshooting

### Connection Issues

```typescript
// Check transport type
const adapter = client.getTransportAdapter('server-name');
console.log('Using:', adapter.getType()); // 'http-legacy' or 'http-smithery'

// Check feature status
const status = client.getFeatureStatus();
console.log('Features:', status);
```

### Performance Issues

```typescript
// Disable config cache if causing issues
config.experimental.configCache = false;

// Check metrics collection overhead
config.experimental.metricsCollection = false;
```

### Configuration Issues

```typescript
// Validate configuration
const result = validateConfigWithSchema(config, schema);
if (!result.valid) {
  console.error('Config errors:', result.errors);
}
```

## Next Steps

1. Start with the enhanced client but keep Smithery disabled
2. Enable metrics collection to establish baselines
3. Gradually enable Smithery features
4. Monitor metrics and adjust as needed
5. Report any issues or feedback

## Support

For questions or issues:
- Check the [test files](./src/__tests__) for examples
- Review the [backward compatibility tests](./src/__tests__/backward-compatibility.test.ts)
- Open an issue with your configuration and error details