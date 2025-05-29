import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createSmitheryUrl, type SmitheryUrlOptions } from '../smithery/config.mjs';
import type { MCPServerConfig } from '../types.mjs';

/**
 * Transport Adapter Interface
 * Provides a unified interface for different transport implementations
 */
export interface TransportAdapter {
  create(): Promise<any>;
  getType(): string;
  getMetadata(): TransportMetadata;
  dispose(): Promise<void>;
}

export interface TransportMetadata {
  provider: 'legacy' | 'smithery';
  features: string[];
  version: string;
}

/**
 * Plugin-based transport configuration
 */
export interface TransportPluginConfig {
  smithery?: {
    enabled: boolean;
    apiKey?: string;
    profile?: string;
    config?: object;
  };
  featureFlags?: {
    useSmitheryUrl?: boolean;
    enableAdvancedConfig?: boolean;
    enableDotNotation?: boolean;
  };
}

/**
 * Base Transport Adapter
 */
abstract class BaseTransportAdapter implements TransportAdapter {
  protected config: MCPServerConfig;
  protected pluginConfig?: TransportPluginConfig;

  constructor(config: MCPServerConfig, pluginConfig?: TransportPluginConfig) {
    this.config = config;
    this.pluginConfig = pluginConfig;
  }

  abstract create(): Promise<any>;
  abstract getType(): string;
  abstract getMetadata(): TransportMetadata;
  
  async dispose(): Promise<void> {
    // Default no-op, override if needed
  }
}

/**
 * Legacy HTTP Transport Adapter
 * Maintains backward compatibility with existing implementation
 */
export class LegacyHTTPTransportAdapter extends BaseTransportAdapter {
  async create(): Promise<StreamableHTTPClientTransport> {
    const url = this.config.url || `http://localhost:${this.config.port || 3000}`;
    return new StreamableHTTPClientTransport(new URL(url));
  }

  getType(): string {
    return 'http-legacy';
  }

  getMetadata(): TransportMetadata {
    return {
      provider: 'legacy',
      features: ['basic-http'],
      version: '1.0.0'
    };
  }
}

/**
 * Smithery HTTP Transport Adapter
 * Provides enhanced Smithery features while maintaining compatibility
 */
export class SmitheryHTTPTransportAdapter extends BaseTransportAdapter {
  private smitheryOptions: SmitheryUrlOptions;

  constructor(config: MCPServerConfig, pluginConfig?: TransportPluginConfig) {
    super(config, pluginConfig);
    
    // Build Smithery options from plugin config
    this.smitheryOptions = {
      apiKey: pluginConfig?.smithery?.apiKey,
      profile: pluginConfig?.smithery?.profile,
      config: pluginConfig?.smithery?.config
    };
  }

  async create(): Promise<StreamableHTTPClientTransport> {
    const baseUrl = this.config.url || `http://localhost:${this.config.port || 3000}`;
    
    // Use Smithery URL generation if enabled
    if (this.pluginConfig?.featureFlags?.useSmitheryUrl) {
      const smitheryUrl = createSmitheryUrl(baseUrl, this.smitheryOptions);
      return new StreamableHTTPClientTransport(smitheryUrl);
    }
    
    // Fallback to standard URL
    return new StreamableHTTPClientTransport(new URL(baseUrl));
  }

  getType(): string {
    return 'http-smithery';
  }

  getMetadata(): TransportMetadata {
    const features = ['basic-http'];
    
    if (this.pluginConfig?.featureFlags?.useSmitheryUrl) {
      features.push('smithery-url');
    }
    if (this.pluginConfig?.featureFlags?.enableAdvancedConfig) {
      features.push('advanced-config');
    }
    if (this.pluginConfig?.featureFlags?.enableDotNotation) {
      features.push('dot-notation');
    }
    
    return {
      provider: 'smithery',
      features,
      version: '2.0.0'
    };
  }
}

/**
 * Stdio Transport Adapter
 * Handles stdio transport for both legacy and Smithery
 */
export class StdioTransportAdapter extends BaseTransportAdapter {
  async create(): Promise<StdioClientTransport> {
    if (!this.config.command) {
      throw new Error('Command is required for stdio transport');
    }
    
    // Filter out undefined values from environment
    const cleanEnv: Record<string, string> = {};
    if (this.config.env) {
      for (const [key, value] of Object.entries(this.config.env)) {
        if (value !== undefined) {
          cleanEnv[key] = value;
        }
      }
    }
    
    return new StdioClientTransport({
      command: this.config.command,
      args: this.config.args || [],
      env: { ...process.env as Record<string, string>, ...cleanEnv }
    });
  }

  getType(): string {
    return 'stdio';
  }

  getMetadata(): TransportMetadata {
    return {
      provider: 'legacy',
      features: ['stdio'],
      version: '1.0.0'
    };
  }
}

/**
 * Transport Adapter Factory
 * Creates appropriate transport adapter based on configuration
 */
export class TransportAdapterFactory {
  static create(
    config: MCPServerConfig, 
    pluginConfig?: TransportPluginConfig
  ): TransportAdapter {
    if (config.transport === 'stdio') {
      return new StdioTransportAdapter(config, pluginConfig);
    }
    
    if (config.transport === 'http') {
      // Use Smithery adapter if enabled, otherwise legacy
      if (pluginConfig?.smithery?.enabled) {
        return new SmitheryHTTPTransportAdapter(config, pluginConfig);
      }
      return new LegacyHTTPTransportAdapter(config, pluginConfig);
    }
    
    throw new Error(`Unsupported transport: ${config.transport}`);
  }
}