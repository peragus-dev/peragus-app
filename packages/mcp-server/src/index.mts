/**
 * Peragus MCP Server - TypeScript Notebook Server
 * 
 * This package provides an MCP (Model Context Protocol) server that exposes
 * TypeScript notebook functionality as tools and resources.
 */

export { createMCPServer, startMCPServer, shutdownMCPServer } from './server.mjs';
export { registerResourceHandlers } from './resources.mjs';
export { registerToolHandlers } from './tools.mjs';
export { getNotebookTemplates, getNotebookTemplate, createNotebookFromTemplate, type NotebookTemplate } from './templates.mjs';
export { logger, createLogger, type Logger } from './logger.mjs';
export {
  MCPServerConfig,
  MCPServerConfigSchema,
  NotebookMetadata,
  NotebookMetadataSchema,
  ToolResult,
  ToolResultSchema,
  CellExecutionResult,
  CellExecutionResultSchema,
  NotebookOperation,
  NotebookOperationSchema,
  RESOURCE_URI_PATTERNS,
  TOOL_NAMES,
  MCPServerError,
  NotebookNotFoundError,
  InvalidOperationError,
  ExecutionError
} from './types.mjs';

/**
 * Default configuration for the MCP server
 */
export const DEFAULT_CONFIG = {
  transport: 'stdio' as const,
  port: 3001,
  logLevel: 'info' as const,
};

/**
 * Version information
 */
export const VERSION = '1.0.0';

/**
 * Server capabilities
 */
export const CAPABILITIES = {
  resources: {
    subscribe: true,
    listChanged: true,
  },
  tools: {
    listChanged: true,
  },
  logging: {
    level: 'info',
  },
} as const;

/**
 * Supported notebook languages
 */
export const SUPPORTED_LANGUAGES = ['typescript', 'javascript'] as const;

/**
 * Supported export formats
 */
export const EXPORT_FORMATS = ['markdown', 'json', 'srcbook', 'html'] as const;

/**
 * Supported import sources
 */
export const IMPORT_SOURCES = ['file', 'url', 'text'] as const;

/**
 * Cell types supported by the notebook system
 */
export const CELL_TYPES = ['title', 'markdown', 'code', 'package.json'] as const;

/**
 * Notebook operations supported by the edit tool
 */
export const NOTEBOOK_OPERATIONS = ['add_cell', 'edit_cell', 'delete_cell', 'move_cell', 'execute_cell', 'execute_all'] as const;