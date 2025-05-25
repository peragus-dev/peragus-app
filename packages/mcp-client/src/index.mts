export {
  MCPClientManager,
  createMCPClient,
  defaultMCPConfig
} from './client.mjs';

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