import { z } from 'zod';

// MCP Server Configuration
export const MCPServerConfigSchema = z.object({
  name: z.string(),
  transport: z.enum(['stdio', 'http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  port: z.number().optional(),
  url: z.string().optional(),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

// MCP Client Configuration
export const MCPClientConfigSchema = z.object({
  timeout: z.number().default(30000),
  maxRetries: z.number().default(3),
  enableAutoReconnect: z.boolean().default(true),
  allowPartialFailure: z.boolean().default(true),
  retryAttempts: z.number().default(3),
  retryDelay: z.number().default(1000),
  servers: z.array(MCPServerConfigSchema).default([]),
});

export type MCPClientConfig = z.infer<typeof MCPClientConfigSchema>;

// MCP Connection Interface
export interface MCPConnection {
  client: any; // MCP SDK Client
  transport: any; // MCP SDK Transport
  serverId: string;
  isConnected: () => boolean;
  close: () => Promise<void>;
}

// MCP Tool Interface
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: any;
  serverId: string;
}

// MCP Resource Interface
export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  serverId: string;
}

// Tool Usage Statistics
export interface MCPToolUsage {
  callCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  lastUsed: Date | null;
  errorCount: number;
}

// Tool Category
export interface MCPToolCategory {
  name: string;
  description: string;
  tools: string[];
}

// Tool Call Result
export interface MCPToolCallResult {
  serverId: string;
  toolName: string;
  result: any;
  success: boolean;
  error?: string;
}

// Search Integration Types
export interface ExaSearchConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxResults?: number;
}

export interface ExaSearchOptions {
  maxResults?: number;
  type?: 'neural' | 'keyword';
  useAutoprompt?: boolean;
  startDate?: string;
  endDate?: string;
  startPublishedDate?: string;
  endPublishedDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeText?: string[];
  excludeText?: string[];
}

export interface ExaContentOptions {
  includeText?: boolean;
  includeHighlights?: boolean;
  includeSummary?: boolean;
}

export interface ExaSearchResult {
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    publishedDate?: string;
    author?: string;
    score?: number;
  }>;
  executionTime: number;
  totalResults: number;
}

export interface ExaContentResult {
  urls: string[];
  contents: Array<{
    url: string;
    title?: string;
    text?: string;
    highlights?: string[];
    summary?: string;
  }>;
  executionTime: number;
}

// Utility function to validate arguments against JSON schema
export function validateArguments(args: any, schema: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!schema || !args) {
    return { valid: true, errors: [] };
  }
  
  // Basic validation for required fields
  if (schema.required && Array.isArray(schema.required)) {
    for (const requiredField of schema.required) {
      if (!(requiredField in args) || args[requiredField] === undefined || args[requiredField] === null) {
        errors.push(`Missing required field: ${requiredField}`);
      }
    }
  }
  
  // Basic type validation for properties
  if (schema.properties && typeof args === 'object') {
    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      if (fieldName in args && args[fieldName] !== undefined) {
        const fieldValue = args[fieldName];
        const expectedType = (fieldSchema as any)?.type;
        
        if (expectedType && typeof fieldValue !== expectedType) {
          errors.push(`Field ${fieldName} should be of type ${expectedType}, got ${typeof fieldValue}`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Utility function to remove undefined values from objects
export function removeUndefinedValues<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key as keyof T] = value;
    }
  }
  
  return result;
}

// Utility function to validate URLs
export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}