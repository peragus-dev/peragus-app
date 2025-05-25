import { eq, and, inArray } from 'drizzle-orm';
import { type SecretWithAssociatedSessions, randomid } from '@peragus/shared';
import {
  configs,
  type Config,
  secrets,
  type Secret,
  secretsToSession,
} from './db/schema.mjs';
import { db } from './db/index.mjs';
import { HOME_DIR } from './constants.mjs';
import { type MCPClientConfig } from '../mcp-client/src/index.mjs';

async function init() {
  const existingConfig = await db.select().from(configs).limit(1);

  if (existingConfig.length === 0) {
    const defaultConfig = {
      baseDir: HOME_DIR,
      defaultLanguage: 'typescript',
      installId: randomid(),
      aiConfig: { provider: 'openai', model: 'gpt-4o' } as const,
      aiProvider: 'openai',
      aiModel: 'gpt-4o',
    };
    console.log();
    console.log('Initializing application with the following configuration:\n');
    console.log(JSON.stringify(defaultConfig, null, 2));
    console.log();
    await db.insert(configs).values(defaultConfig).returning();
  }
}

// Block rest of module until we have initialized config.
await init();

export async function getConfig(): Promise<Config> {
  const results = await db.select().from(configs);

  if (results.length !== 1) {
    console.warn('Expected exactly one config record, found:', results.length);
  }
  if (results.length === 0) {
    throw new Error('No config found');
  }
  // explicitly known that a config exists here
  return results[0] as Config;
}

export async function updateConfig(attrs: Partial<Config>) {
  return db.update(configs).set(attrs).returning();
}


export async function getSecrets(): Promise<Array<SecretWithAssociatedSessions>> {
  const secretsResult = await db.select().from(secrets);
  const secretsToSessionResult = await db
    .select()
    .from(secretsToSession)
    .where(
      inArray(
        secretsToSession.secret_id,
        secretsResult.map((secret) => secret.id),
      ),
    );

  return secretsResult.map((secret) => ({
    name: secret.name,
    value: secret.value,
    associatedWithSessionIds: secretsToSessionResult
      .filter((secretToSession) => secretToSession.secret_id === secret.id)
      .map((secretToSession) => secretToSession.session_id),
  }));
}

export async function getSecretsAssociatedWithSession(
  sessionId: string,
): Promise<Record<string, string>> {
  const secretsResults = await getSecrets();
  return Object.fromEntries(
    secretsResults
      .filter((secret) => secret.associatedWithSessionIds.includes(sessionId))
      .map((secret) => [secret.name, secret.value]),
  );
}

export async function addSecret(name: string, value: string): Promise<Secret> {
  const result = await db
    .insert(secrets)
    .values({ name, value })
    .onConflictDoUpdate({ target: secrets.name, set: { value } })
    .returning();
  if (result.length === 0) {
    throw new Error('No secret returned');
  }
  // explicitly known that a config exists here
  return result[0] as Secret;
}

export async function removeSecret(name: string) {
  await db.delete(secrets).where(eq(secrets.name, name)).returning();
}

export async function associateSecretWithSession(secretName: string, sessionId: string) {
  const result = await db
    .select({ id: secrets.id })
    .from(secrets)
    .where(eq(secrets.name, secretName))
    .limit(1);
  if (result.length < 1) {
    throw new Error(
      `Cannot associate '${secretName}' with ${sessionId}: cannot find secret with that name!`,
    );
  }
  const secretId = result[0]!.id;

  await db
    .insert(secretsToSession)
    .values({ secret_id: secretId, session_id: sessionId })
    .onConflictDoNothing()
    .returning();
}

export async function disassociateSecretWithSession(secretName: string, sessionId: string) {
  const result = await db
    .select({ id: secrets.id })
    .from(secrets)
    .where(eq(secrets.name, secretName))
    .limit(1);
  if (result.length < 1) {
    throw new Error(
      `Cannot associate '${secretName}' with ${sessionId}: cannot find secret with that name!`,
    );
  }
  const secretId = result[0]!.id;

  await db
    .delete(secretsToSession)
    .where(
      and(eq(secretsToSession.secret_id, secretId), eq(secretsToSession.session_id, sessionId)),
    )
    .returning();
}

/**
 * Get MCP client configuration from environment and database
 */
export async function getMCPConfig(): Promise<MCPClientConfig> {
  // Default MCP configuration
  const mcpConfig: MCPClientConfig = {
    timeout: parseInt(process.env.MCP_TIMEOUT || '30000', 10),
    maxRetries: parseInt(process.env.MCP_MAX_RETRIES || '3', 10),
    enableAutoReconnect: process.env.MCP_AUTO_RECONNECT !== 'false',
    allowPartialFailure: process.env.MCP_ALLOW_PARTIAL_FAILURE !== 'false',
    retryAttempts: parseInt(process.env.MCP_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.MCP_RETRY_DELAY || '1000', 10),
    servers: []
  };

  // Add servers from environment variables
  const serverConfigs = process.env.MCP_SERVERS;
  if (serverConfigs) {
    try {
      const servers = JSON.parse(serverConfigs);
      if (Array.isArray(servers)) {
        mcpConfig.servers.push(...servers);
      }
    } catch (error) {
      console.warn('Failed to parse MCP_SERVERS environment variable:', error);
    }
  }

  // Add default local server if no servers configured
  if (mcpConfig.servers.length === 0) {
    mcpConfig.servers.push({
      name: 'local-mcp-server',
      transport: 'stdio' as const,
      command: 'node',
      args: ['./packages/mcp-server/dist/cli.mjs'],
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development'
      }
    });
  }

  return mcpConfig;
}

/**
 * Update MCP configuration in environment
 */
export async function updateMCPConfig(mcpConfig: Partial<MCPClientConfig>): Promise<void> {
  // This would typically update database configuration
  // For now, we'll just validate the configuration
  if (mcpConfig.servers) {
    for (const server of mcpConfig.servers) {
      if (!server.name || !server.transport) {
        throw new Error('Invalid server configuration: name and transport are required');
      }
      
      if (server.transport === 'stdio' && !server.command) {
        throw new Error('Invalid stdio server configuration: command is required');
      }
      
      if (server.transport === 'http' && !server.url) {
        throw new Error('Invalid http server configuration: url is required');
      }
    }
  }
  
  console.log('MCP configuration updated:', mcpConfig);
}

/**
 * Get MCP server discovery configuration
 */
export function getMCPServerDiscovery(): {
  enableAutoDiscovery: boolean;
  discoveryPaths: string[];
  discoveryInterval: number;
} {
  return {
    enableAutoDiscovery: process.env.MCP_AUTO_DISCOVERY === 'true',
    discoveryPaths: process.env.MCP_DISCOVERY_PATHS?.split(',') || [
      './packages/mcp-server',
      './node_modules/@peragus/mcp-*',
      '~/.local/share/mcp-servers'
    ],
    discoveryInterval: parseInt(process.env.MCP_DISCOVERY_INTERVAL || '300000', 10) // 5 minutes
  };
}

/**
 * Get MCP connection timeout and retry settings
 */
export function getMCPConnectionSettings(): {
  connectionTimeout: number;
  maxRetries: number;
  retryDelay: number;
  healthCheckInterval: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetTimeout: number;
} {
  return {
    connectionTimeout: parseInt(process.env.MCP_CONNECTION_TIMEOUT || '10000', 10),
    maxRetries: parseInt(process.env.MCP_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.MCP_RETRY_DELAY || '1000', 10),
    healthCheckInterval: parseInt(process.env.MCP_HEALTH_CHECK_INTERVAL || '30000', 10),
    circuitBreakerThreshold: parseInt(process.env.MCP_CIRCUIT_BREAKER_THRESHOLD || '5', 10),
    circuitBreakerResetTimeout: parseInt(process.env.MCP_CIRCUIT_BREAKER_RESET_TIMEOUT || '60000', 10)
  };
}
