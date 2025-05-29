import { z } from 'zod';
import _ from 'lodash';

/**
 * Smithery URL generation options
 */
export interface SmitheryUrlOptions {
  apiKey?: string;
  profile?: string;
  config?: object;
}

/**
 * Enhanced configuration with dot-notation support
 */
export interface DotNotationConfig {
  [key: string]: any;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult<T = any> {
  valid: boolean;
  data?: T;
  errors?: ConfigValidationError[];
}

export interface ConfigValidationError {
  param: string;
  pointer: string;
  reason: string;
  received?: any;
}

/**
 * Creates a Smithery-compatible URL with encoded configuration
 * @param baseUrl The base URL of the server
 * @param options Optional Smithery configuration
 * @returns A URL with properly encoded parameters
 */
export function createSmitheryUrl(
  baseUrl: string,
  options?: SmitheryUrlOptions
): URL {
  const url = new URL(baseUrl.endsWith('/mcp') ? baseUrl : `${baseUrl}/mcp`);
  
  if (options?.config) {
    // Encode config as base64 for URL-safe transmission
    const encoded = typeof window !== 'undefined'
      ? btoa(JSON.stringify(options.config))
      : Buffer.from(JSON.stringify(options.config)).toString('base64');
    url.searchParams.set('config', encoded);
  }
  
  if (options?.apiKey) {
    url.searchParams.set('api_key', options.apiKey);
  }
  
  if (options?.profile) {
    url.searchParams.set('profile', options.profile);
  }
  
  return url;
}

/**
 * Parses dot-notation configuration parameters
 * Examples: server.host=localhost, server.port=8080, debug=true
 * @param params URL search parameters or plain object
 * @returns Parsed configuration object
 */
export function parseDotNotationConfig(
  params: URLSearchParams | Record<string, string>
): DotNotationConfig {
  const config: DotNotationConfig = {};
  
  const entries = params instanceof URLSearchParams 
    ? Array.from(params.entries())
    : Object.entries(params);
  
  for (const [key, value] of entries) {
    // Skip reserved parameters
    if (['config', 'api_key', 'profile'].includes(key)) continue;
    
    // Parse dot notation
    const pathParts = key.split('.');
    
    // Try to parse value as JSON for proper types
    let parsedValue: any = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      // Keep as string if not valid JSON
    }
    
    // Use lodash to set nested values
    _.set(config, pathParts, parsedValue);
  }
  
  return config;
}

/**
 * Decodes base64 configuration from URL parameter
 * @param encodedConfig Base64 encoded configuration string
 * @returns Decoded configuration object
 */
export function decodeBase64Config(encodedConfig: string): object {
  try {
    const decoded = typeof window !== 'undefined'
      ? atob(encodedConfig)
      : Buffer.from(encodedConfig, 'base64').toString();
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error(`Failed to decode configuration: ${error}`);
  }
}

/**
 * Validates configuration against a Zod schema with enhanced error reporting
 * @param config Configuration to validate
 * @param schema Zod schema for validation
 * @returns Validation result with detailed errors
 */
export function validateConfigWithSchema<T>(
  config: any,
  schema: z.ZodSchema<T>
): ConfigValidationResult<T> {
  const result = schema.safeParse(config);
  
  if (result.success) {
    return {
      valid: true,
      data: result.data
    };
  }
  
  // Convert Zod errors to our error format
  const errors: ConfigValidationError[] = result.error.issues.map(issue => {
    // Traverse config to get actual received value
    let received: any = config;
    for (const key of issue.path) {
      if (received && typeof received === 'object' && key in received) {
        received = received[key];
      } else {
        received = undefined;
        break;
      }
    }
    
    return {
      param: issue.path.join('.') || 'root',
      pointer: `/${issue.path.join('/')}`,
      reason: issue.message,
      received
    };
  });
  
  return {
    valid: false,
    errors
  };
}

/**
 * Merges multiple configuration sources with priority
 * Priority: dot-notation > explicit config > profile defaults
 * @param sources Configuration sources in priority order
 * @returns Merged configuration
 */
export function mergeConfigurations(...sources: (object | undefined)[]): object {
  return _.merge({}, ...sources.filter(Boolean));
}

/**
 * Configuration transformer for backward compatibility
 * Transforms legacy configuration to Smithery format
 */
export class ConfigTransformer {
  static toSmithery(legacyConfig: any): object {
    const transformed: any = { ...legacyConfig };
    
    // Transform known legacy patterns
    if ('host' in legacyConfig && 'port' in legacyConfig) {
      transformed.server = {
        host: legacyConfig.host,
        port: legacyConfig.port
      };
      delete transformed.host;
      delete transformed.port;
    }
    
    return transformed;
  }
  
  static fromSmithery(smitheryConfig: any): object {
    const transformed: any = { ...smitheryConfig };
    
    // Transform back to legacy format if needed
    if (transformed.server) {
      transformed.host = transformed.server.host;
      transformed.port = transformed.server.port;
      delete transformed.server;
    }
    
    return transformed;
  }
}

/**
 * Configuration cache for performance optimization
 */
export class ConfigCache {
  private cache = new Map<string, { config: object; timestamp: number }>();
  private ttl: number;
  
  constructor(ttlMs: number = 60000) { // 1 minute default
    this.ttl = ttlMs;
  }
  
  set(key: string, config: object): void {
    this.cache.set(key, {
      config,
      timestamp: Date.now()
    });
  }
  
  get(key: string): object | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.config;
  }
  
  clear(): void {
    this.cache.clear();
  }
}