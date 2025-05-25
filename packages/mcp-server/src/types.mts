import { z } from 'zod';

/**
 * MCP Server configuration schema
 */
export const MCPServerConfigSchema = z.object({
  transport: z.enum(['stdio', 'sse']).default('stdio'),
  port: z.number().optional().default(3001),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  srcbooksDir: z.string().optional(),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

/**
 * Notebook metadata for MCP resources
 */
export const NotebookMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  language: z.enum(['typescript', 'javascript']),
  tags: z.array(z.string()).default([]),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  type: z.enum(['user', 'example', 'template']).default('user'),
});

export type NotebookMetadata = z.infer<typeof NotebookMetadataSchema>;

/**
 * Tool execution result
 */
export const ToolResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

/**
 * Cell execution result
 */
export const CellExecutionResultSchema = z.object({
  cellId: z.string(),
  success: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
  executionTime: z.number().optional(),
});

export type CellExecutionResult = z.infer<typeof CellExecutionResultSchema>;

/**
 * Notebook operation types
 */
export const NotebookOperationSchema = z.enum([
  'add_cell',
  'edit_cell', 
  'delete_cell',
  'move_cell',
  'execute_cell',
  'execute_all'
]);

export type NotebookOperation = z.infer<typeof NotebookOperationSchema>;

/**
 * Resource URI patterns
 */
export const RESOURCE_URI_PATTERNS = {
  NOTEBOOK_EXAMPLES: 'notebook://examples/',
  NOTEBOOK_USER: 'notebook://user/',
  TEMPLATE_NOTEBOOK: 'template://notebook/',
  NOTEBOOK_LIST: 'notebook://list',
  NOTEBOOK_EXPORT: 'notebook://export/',
} as const;

/**
 * Tool names
 */
export const TOOL_NAMES = {
  CREATE_NOTEBOOK: 'create_notebook',
  EDIT_NOTEBOOK: 'edit_notebook',
  EXECUTE_NOTEBOOK: 'execute_notebook',
  LIST_NOTEBOOKS: 'list_notebooks',
  GET_NOTEBOOK_CONTENT: 'get_notebook_content',
  SAVE_NOTEBOOK: 'save_notebook',
  DELETE_NOTEBOOK: 'delete_notebook',
  IMPORT_NOTEBOOK: 'import_notebook',
  EXPORT_NOTEBOOK: 'export_notebook',
} as const;

/**
 * Error types
 */
export class MCPServerError extends Error {
  constructor(
    message: string,
    public code: string = 'UNKNOWN_ERROR',
    public details?: any
  ) {
    super(message);
    this.name = 'MCPServerError';
  }
}

export class NotebookNotFoundError extends MCPServerError {
  constructor(notebookId: string) {
    super(`Notebook not found: ${notebookId}`, 'NOTEBOOK_NOT_FOUND', { notebookId });
  }
}

export class InvalidOperationError extends MCPServerError {
  constructor(operation: string, reason: string) {
    super(`Invalid operation '${operation}': ${reason}`, 'INVALID_OPERATION', { operation, reason });
  }
}

export class ExecutionError extends MCPServerError {
  constructor(message: string, details?: any) {
    super(message, 'EXECUTION_ERROR', details);
  }
}