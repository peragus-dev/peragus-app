// Legacy exports for backward compatibility
export {
  MCPClientManager,
  createMCPClient,
  defaultMCPConfig
} from './client.mjs';

// Enhanced client with Smithery support
export {
  EnhancedMCPClientManager,
  createEnhancedMCPClient,
  defaultEnhancedMCPConfig,
  type EnhancedMCPClientConfig
} from './enhanced-client.mjs';

// Transport adapters for custom implementations
export {
  TransportAdapterFactory,
  type TransportAdapter,
  type TransportMetadata,
  type TransportPluginConfig
} from './transport/adapter.mjs';

// Smithery configuration utilities
export {
  createSmitheryUrl,
  parseDotNotationConfig,
  decodeBase64Config,
  validateConfigWithSchema,
  mergeConfigurations,
  ConfigTransformer,
  ConfigCache,
  type SmitheryUrlOptions,
  type DotNotationConfig,
  type ConfigValidationResult,
  type ConfigValidationError
} from './smithery/config.mjs';

// Type exports
export {
  type MCPClientConfig,
  type MCPServerConfig,
  type MCPConnection,
  type MCPTool,
  type MCPResource,
  type MCPToolCallResult,
  type MCPToolUsage,
  type MCPToolCategory,
  type ExaSearchConfig,
  type ExaSearchOptions,
  type ExaContentOptions,
  type ExaSearchResult,
  type ExaContentResult,
  MCPClientConfigSchema,
  MCPServerConfigSchema,
  validateArguments,
  removeUndefinedValues,
  isValidURL
} from './types.mjs';