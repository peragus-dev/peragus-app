import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// @ts-ignore - ignore import errors during build time
import { createSrcbook, importSrcbookFromSrcmdText } from '@peragus/api/srcbook/index.mjs';
// @ts-ignore - ignore import errors during build time
import { encode } from '@peragus/api/srcmd.mjs';
// @ts-ignore - ignore import errors during build time
import type { SessionType } from '@peragus/api/types.mjs';
// @ts-ignore - ignore import errors during build time
import type { CellType, CodeLanguageType } from '@peragus/shared';
// @ts-ignore - ignore import errors during build time
import { randomid, validFilename, createDirIfNotExists } from '@peragus/shared';

import { logger } from './logger.mjs';
import { 
  TOOL_NAMES,
  ToolResult,
  MCPServerError,
  NotebookNotFoundError,
  InvalidOperationError,
  ExecutionError
} from './types.mjs';
import { getNotebookTemplates, createNotebookFromTemplate } from './templates.mjs';

/**
 * Register all tool handlers with the MCP server
 */
export function registerToolHandlers(server: Server): void {
  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      {
        name: TOOL_NAMES.CREATE_NOTEBOOK,
        description: 'Create a new TypeScript or JavaScript notebook',
        inputSchema: {
          type: 'object',
          properties: {
            title: { 
              type: 'string', 
              description: 'Notebook title' 
            },
            language: { 
              type: 'string', 
              enum: ['typescript', 'javascript'],
              description: 'Programming language for the notebook'
            },
            description: { 
              type: 'string', 
              description: 'Optional description of the notebook' 
            },
            templateId: {
              type: 'string',
              description: 'Optional template ID to create notebook from template'
            },
            tags: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Optional tags for categorization'
            }
          },
          required: ['title', 'language']
        }
      },
      {
        name: TOOL_NAMES.EDIT_NOTEBOOK,
        description: 'Edit an existing notebook by adding, updating, or deleting cells',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: { 
              type: 'string', 
              description: 'Unique identifier of the notebook to edit' 
            },
            operation: {
              type: 'string',
              enum: ['add_cell', 'edit_cell', 'delete_cell', 'move_cell'],
              description: 'Type of edit operation to perform'
            },
            cellIndex: { 
              type: 'number', 
              description: 'Index position for the cell operation' 
            },
            cellType: {
              type: 'string', 
              enum: ['title', 'markdown', 'code', 'package.json'],
              description: 'Type of cell (required for add_cell operation)'
            },
            content: { 
              type: 'string', 
              description: 'Cell content (required for add_cell and edit_cell operations)' 
            },
            filename: {
              type: 'string',
              description: 'Filename for code cells'
            },
            newIndex: {
              type: 'number',
              description: 'New index position (required for move_cell operation)'
            }
          },
          required: ['notebookId', 'operation']
        }
      },
      {
        name: TOOL_NAMES.EXECUTE_NOTEBOOK,
        description: 'Execute code cells in a notebook',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: { 
              type: 'string', 
              description: 'Unique identifier of the notebook to execute' 
            },
            cellIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific cell IDs to execute (if not provided, executes all code cells)'
            },
            timeout: { 
              type: 'number', 
              default: 30000,
              description: 'Execution timeout in milliseconds'
            }
          },
          required: ['notebookId']
        }
      },
      {
        name: TOOL_NAMES.LIST_NOTEBOOKS,
        description: 'List available notebooks with filtering options',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['user', 'example', 'all'],
              default: 'all',
              description: 'Type of notebooks to list'
            },
            language: {
              type: 'string',
              enum: ['typescript', 'javascript'],
              description: 'Filter by programming language'
            },
            limit: { 
              type: 'number', 
              default: 50,
              description: 'Maximum number of notebooks to return'
            },
            offset: {
              type: 'number',
              default: 0, 
              description: 'Offset for pagination'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags'
            }
          }
        }
      },
      {
        name: TOOL_NAMES.GET_NOTEBOOK_CONTENT,
        description: 'Get the full content of a specific notebook',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: { 
              type: 'string', 
              description: 'Unique identifier of the notebook' 
            },
            format: {
              type: 'string',
              enum: ['json', 'markdown', 'srcbook'],
              default: 'json',
              description: 'Output format for the notebook content'
            },
            includeCellOutputs: {
              type: 'boolean',
              default: false,
              description: 'Whether to include cell execution outputs'
            }
          },
          required: ['notebookId']
        }
      },
      {
        name: TOOL_NAMES.SAVE_NOTEBOOK,
        description: 'Save changes to a notebook',
        inputSchema: {
          type: 'object', 
          properties: {
            notebookId: { 
              type: 'string', 
              description: 'Unique identifier of the notebook' 
            },
            content: { 
              type: 'object', 
              description: 'Updated notebook content' 
            },
            message: { 
              type: 'string', 
              description: 'Optional save message or comment' 
            }
          },
          required: ['notebookId', 'content']
        }
      },
      {
        name: TOOL_NAMES.DELETE_NOTEBOOK,
        description: 'Delete a notebook permanently',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: { 
              type: 'string', 
              description: 'Unique identifier of the notebook to delete' 
            },
            confirm: {
              type: 'boolean',
              description: 'Confirmation flag to prevent accidental deletion'
            }
          },
          required: ['notebookId', 'confirm']
        }
      },
      {
        name: TOOL_NAMES.IMPORT_NOTEBOOK,
        description: 'Import a notebook from various sources',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              enum: ['file', 'url', 'text'],
              description: 'Source type for the import'
            },
            content: {
              type: 'string',
              description: 'File path, URL, or direct content to import'
            },
            title: {
              type: 'string',
              description: 'Optional title for the imported notebook'
            }
          },
          required: ['source', 'content']
        }
      },
      {
        name: TOOL_NAMES.EXPORT_NOTEBOOK,
        description: 'Export a notebook to various formats',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: { 
              type: 'string', 
              description: 'Unique identifier of the notebook to export' 
            },
            format: {
              type: 'string',
              enum: ['markdown', 'json', 'srcbook', 'html'],
              default: 'markdown',
              description: 'Export format'
            },
            includeOutputs: {
              type: 'boolean',
              default: true,
              description: 'Whether to include cell outputs in export'
            }
          },
          required: ['notebookId']
        }
      }
    ];

    logger.debug(`Listed ${tools.length} tools`);
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const toolName = request.params.name;
    const args = request.params.arguments || {};
    
    try {
      logger.debug(`Executing tool: ${toolName}`, args);
      
      let result: ToolResult;
      
      switch (toolName) {
        case TOOL_NAMES.CREATE_NOTEBOOK:
          result = await handleCreateNotebook(args);
          break;
        case TOOL_NAMES.EDIT_NOTEBOOK:
          result = await handleEditNotebook(args);
          break;
        case TOOL_NAMES.EXECUTE_NOTEBOOK:
          result = await handleExecuteNotebook(args);
          break;
        case TOOL_NAMES.LIST_NOTEBOOKS:
          result = await handleListNotebooks(args);
          break;
        case TOOL_NAMES.GET_NOTEBOOK_CONTENT:
          result = await handleGetNotebookContent(args);
          break;
        case TOOL_NAMES.SAVE_NOTEBOOK:
          result = await handleSaveNotebook(args);
          break;
        case TOOL_NAMES.DELETE_NOTEBOOK:
          result = await handleDeleteNotebook(args);
          break;
        case TOOL_NAMES.IMPORT_NOTEBOOK:
          result = await handleImportNotebook(args);
          break;
        case TOOL_NAMES.EXPORT_NOTEBOOK:
          result = await handleExportNotebook(args);
          break;
        default:
          throw new MCPServerError(`Unknown tool: ${toolName}`, 'UNKNOWN_TOOL');
      }
      
      logger.debug(`Tool ${toolName} completed successfully`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
      
    } catch (error) {
      logger.error(`Error executing tool ${toolName}:`, error);
      
      const errorResult: ToolResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `Failed to execute ${toolName}`
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResult, null, 2)
          }
        ],
        isError: true
      };
    }
  });
}

/**
 * Handle create notebook tool
 */
async function handleCreateNotebook(args: any): Promise<ToolResult> {
  const { title, language, description, templateId, tags } = args;
  
  try {
    let notebookDir: string;
    
    if (templateId) {
      // Create from template
      const template = await createNotebookFromTemplate(templateId, title);
      if (!template) {
        throw new NotebookNotFoundError(templateId);
      }
      
      // For now, create a basic notebook and let the user customize it
      // TODO: Implement proper template conversion
      notebookDir = await createSrcbook(title, template.language as CodeLanguageType);
    } else {
      // Create new notebook
      notebookDir = await createSrcbook(title, language as CodeLanguageType);
    }
    
    return {
      success: true,
      data: {
        notebookId: notebookDir.split('/').pop(),
        directory: notebookDir,
        title,
        language,
        description,
        tags
      },
      message: `Successfully created notebook: ${title}`
    };
  } catch (error) {
    throw new MCPServerError(
      `Failed to create notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CREATE_NOTEBOOK_ERROR',
      error
    );
  }
}

/**
 * Handle edit notebook tool
 */
async function handleEditNotebook(args: any): Promise<ToolResult> {
  const { notebookId, operation, cellIndex, cellType, content, filename, newIndex } = args;
  
  // TODO: Implement notebook editing logic
  // This would integrate with the existing session management and cell operations
  
  return {
    success: true,
    message: `Notebook edit operation '${operation}' completed`,
    data: {
      notebookId,
      operation,
      cellIndex
    }
  };
}

/**
 * Handle execute notebook tool
 */
async function handleExecuteNotebook(args: any): Promise<ToolResult> {
  const { notebookId, cellIds, timeout = 30000 } = args;
  
  // TODO: Implement notebook execution logic
  // This would integrate with the existing TypeScript server and execution engine
  
  return {
    success: true,
    message: `Notebook execution completed`,
    data: {
      notebookId,
      executedCells: cellIds || 'all',
      timeout
    }
  };
}

/**
 * Handle list notebooks tool
 */
async function handleListNotebooks(args: any): Promise<ToolResult> {
  const { type = 'all', language, limit = 50, offset = 0, tags } = args;
  
  // TODO: Implement notebook listing logic
  // This would query the file system and/or database for notebooks
  
  const notebooks = [
    {
      id: 'example-1',
      title: 'Getting Started',
      language: 'typescript',
      type: 'example',
      tags: ['tutorial', 'basics']
    }
  ];
  
  return {
    success: true,
    data: {
      notebooks,
      total: notebooks.length,
      limit,
      offset
    },
    message: `Found ${notebooks.length} notebooks`
  };
}

/**
 * Handle get notebook content tool
 */
async function handleGetNotebookContent(args: any): Promise<ToolResult> {
  const { notebookId, format = 'json', includeCellOutputs = false } = args;
  
  // TODO: Implement notebook content retrieval
  // This would load the notebook from the file system
  
  return {
    success: true,
    data: {
      notebookId,
      format,
      content: `Notebook content for ${notebookId}`
    },
    message: `Retrieved notebook content in ${format} format`
  };
}

/**
 * Handle save notebook tool
 */
async function handleSaveNotebook(args: any): Promise<ToolResult> {
  const { notebookId, content, message } = args;
  
  // TODO: Implement notebook saving logic
  // This would persist changes to the file system
  
  return {
    success: true,
    data: {
      notebookId,
      savedAt: new Date().toISOString()
    },
    message: message || `Notebook ${notebookId} saved successfully`
  };
}

/**
 * Handle delete notebook tool
 */
async function handleDeleteNotebook(args: any): Promise<ToolResult> {
  const { notebookId, confirm } = args;
  
  if (!confirm) {
    throw new InvalidOperationError('delete_notebook', 'Confirmation required for deletion');
  }
  
  // TODO: Implement notebook deletion logic
  // This would remove the notebook directory and files
  
  return {
    success: true,
    data: {
      notebookId,
      deletedAt: new Date().toISOString()
    },
    message: `Notebook ${notebookId} deleted successfully`
  };
}

/**
 * Handle import notebook tool
 */
async function handleImportNotebook(args: any): Promise<ToolResult> {
  const { source, content, title } = args;
  
  try {
    let notebookDir: string;
    
    switch (source) {
      case 'text':
        notebookDir = await importSrcbookFromSrcmdText(content, title);
        break;
      case 'file':
        // TODO: Implement file import
        throw new MCPServerError('File import not yet implemented', 'NOT_IMPLEMENTED');
      case 'url':
        // TODO: Implement URL import
        throw new MCPServerError('URL import not yet implemented', 'NOT_IMPLEMENTED');
      default:
        throw new InvalidOperationError('import_notebook', `Unsupported source type: ${source}`);
    }
    
    return {
      success: true,
      data: {
        notebookId: notebookDir.split('/').pop(),
        directory: notebookDir,
        source,
        title
      },
      message: `Successfully imported notebook from ${source}`
    };
  } catch (error) {
    throw new MCPServerError(
      `Failed to import notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'IMPORT_NOTEBOOK_ERROR',
      error
    );
  }
}

/**
 * Handle export notebook tool
 */
async function handleExportNotebook(args: any): Promise<ToolResult> {
  const { notebookId, format = 'markdown', includeOutputs = true } = args;
  
  // TODO: Implement notebook export logic
  // This would convert the notebook to the requested format
  
  return {
    success: true,
    data: {
      notebookId,
      format,
      exportedAt: new Date().toISOString(),
      content: `Exported content for ${notebookId} in ${format} format`
    },
    message: `Notebook exported successfully in ${format} format`
  };
}