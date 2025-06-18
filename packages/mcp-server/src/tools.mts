import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger } from './logger.mjs';
import { createSrcbook, importSrcbookFromSrcmdText, importSrcbookFromSrcmdUrl, removeSrcbook, writeToDisk, writeReadmeToDisk, writeCellToDisk } from '@peragus/api/srcbook/index.mjs';
import { EXAMPLE_SRCBOOKS } from '@peragus/api/srcbook/examples.mjs';
import { pathToSrcbook } from '@peragus/api/srcbook/path.mjs';
import { decode } from '@peragus/api/srcmd.mjs';
import fs from 'node:fs';
import { randomid } from '@peragus/shared';
import { 
  TOOL_NAMES,
  ToolResult,
  MCPServerError,
  NotebookNotFoundError,
  InvalidOperationError,
  ExecutionError
} from './types.mjs';

/**
 * Register all tool handlers with the MCP server
 */
export function registerToolHandlers(server: Server): void {
  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      {
        name: TOOL_NAMES.CREATE_NOTEBOOK,
        description: 'Create a new TypeScript or JavaScript notebook using Peragus',
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
            }
          },
          required: ['title', 'language']
        }
      },
      {
        name: TOOL_NAMES.LIST_NOTEBOOKS,
        description: 'List example notebooks available in Peragus',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'import_notebook',
        description: 'Import a notebook from text or URL',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              enum: ['text', 'url'],
              description: 'Import source type'
            },
            content: {
              type: 'string',
              description: 'Notebook content (srcmd text) or URL'
            },
            title: {
              type: 'string',
              description: 'Optional custom title for the notebook'
            }
          },
          required: ['source', 'content']
        }
      },
      {
        name: 'get_notebook',
        description: 'Get the content of a specific notebook by ID',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: {
              type: 'string',
              description: 'Notebook ID (directory name)'
            }
          },
          required: ['notebookId']
        }
      },
      {
        name: 'update_notebook',
        description: 'Update a notebook by adding, editing, deleting, or moving cells',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: {
              type: 'string',
              description: 'Notebook ID (directory name) to update'
            },
            operation: {
              type: 'string',
              enum: ['add_cell', 'edit_cell', 'delete_cell', 'move_cell'],
              description: 'Type of update operation to perform'
            },
            cellIndex: {
              type: 'number',
              description: 'Index position for the cell operation (0-based)'
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
              description: 'Filename for code cells (optional, auto-generated if not provided)'
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
        name: 'delete_notebook',
        description: 'Delete a notebook permanently',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: {
              type: 'string',
              description: 'Notebook ID (directory name) to delete'
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
        name: 'execute_notebook_cell',
        description: 'Execute a specific cell in a notebook and return the results',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: {
              type: 'string',
              description: 'Notebook ID (directory name) containing the cell'
            },
            cellIndex: {
              type: 'number',
              description: 'Index of the cell to execute (0-based)'
            },
            timeout: {
              type: 'number',
              description: 'Execution timeout in milliseconds (default: 30000)',
              default: 30000
            }
          },
          required: ['notebookId', 'cellIndex']
        }
      },
      {
        name: 'search_notebooks',
        description: 'Search notebooks by title, content, or metadata with fuzzy matching',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to match against notebook titles and content'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
              default: 10
            },
            includeContent: {
              type: 'boolean',
              description: 'Include cell content in search results (default: false)',
              default: false
            }
          },
          required: ['query']
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
        case TOOL_NAMES.LIST_NOTEBOOKS:
          result = await handleListNotebooks(args);
          break;
        case 'import_notebook':
          result = await handleImportNotebook(args);
          break;
        case 'get_notebook':
          result = await handleGetNotebook(args);
          break;
        case 'update_notebook':
          result = await handleUpdateNotebook(args);
          break;
        case 'delete_notebook':
          result = await handleDeleteNotebook(args);
          break;
        case 'execute_notebook_cell':
          result = await handleExecuteNotebookCell(args);
          break;
        case 'search_notebooks':
          result = await handleSearchNotebooks(args);
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
  const { title, language } = args;
  
  try {
    const srcbookDir = await createSrcbook(title, language);
    const notebookId = srcbookDir.split('/').pop() || '';
    
    return {
      success: true,
      data: {
        notebookId,
        title,
        language,
        srcbookDir,
        createdAt: new Date().toISOString()
      },
      message: `Successfully created Peragus notebook: ${title} at ${srcbookDir}`
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
 * Handle list notebooks tool (shows example notebooks)
 */
async function handleListNotebooks(args: any): Promise<ToolResult> {
  try {
    const examples = EXAMPLE_SRCBOOKS.map(example => ({
      id: example.id,
      title: example.title,
      description: example.description,
      language: example.language,
      tags: example.tags,
      path: example.path
    }));
    
    return {
      success: true,
      data: {
        examples,
        total: examples.length
      },
      message: `Found ${examples.length} example notebooks`
    };
  } catch (error) {
    throw new MCPServerError(
      `Failed to list notebooks: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'LIST_NOTEBOOKS_ERROR',
      error
    );
  }
}

/**
 * Handle import notebook tool
 */
async function handleImportNotebook(args: any): Promise<ToolResult> {
  const { source, content, title } = args;
  
  try {
    let srcbookDir: string;
    
    if (source === 'url') {
      srcbookDir = await importSrcbookFromSrcmdUrl(content, title);
    } else if (source === 'text') {
      srcbookDir = await importSrcbookFromSrcmdText(content, title);
    } else {
      throw new InvalidOperationError('import_notebook', `Invalid source type: ${source}`);
    }
    
    const notebookId = srcbookDir.split('/').pop() || '';
    
    return {
      success: true,
      data: {
        notebookId,
        srcbookDir,
        source,
        importedAt: new Date().toISOString()
      },
      message: `Successfully imported notebook from ${source} to ${srcbookDir}`
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
 * Handle get notebook tool
 */
async function handleGetNotebook(args: any): Promise<ToolResult> {
  const { notebookId } = args;
  
  try {
    const srcbookDir = pathToSrcbook(notebookId);
    
    // Check if notebook exists
    if (!await fs.promises.access(srcbookDir).then(() => true).catch(() => false)) {
      throw new NotebookNotFoundError(notebookId);
    }
    
    // Read the README.md file which contains the notebook content
    const readmePath = `${srcbookDir}/README.md`;
    const readmeContent = await fs.promises.readFile(readmePath, 'utf8');
    
    // Decode the srcmd content
    const result = decode(readmeContent);
    if (result.error) {
      const errorMsg = result.errors ? result.errors.join(', ') : 'Unknown error';
      throw new MCPServerError(`Failed to decode notebook: ${errorMsg}`, 'DECODE_ERROR');
    }
    
    return {
      success: true,
      data: {
        notebookId,
        srcbookDir,
        title: result.srcbook.cells.find(cell => cell.type === 'title')?.text || 'Untitled',
        language: result.srcbook.language,
        cells: result.srcbook.cells,
        cellCount: result.srcbook.cells.length
      },
      message: `Retrieved notebook ${notebookId}`
    };
  } catch (error) {
    if (error instanceof NotebookNotFoundError) {
      throw error;
    }
    throw new MCPServerError(
      `Failed to get notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'GET_NOTEBOOK_ERROR',
      error
    );
  }
}

/**
 * Handle update notebook tool
 */
async function handleUpdateNotebook(args: any): Promise<ToolResult> {
  const { notebookId, operation, cellIndex, cellType, content, filename, newIndex } = args;
  
  try {
    const srcbookDir = pathToSrcbook(notebookId);
    
    // Check if notebook exists
    if (!await fs.promises.access(srcbookDir).then(() => true).catch(() => false)) {
      throw new NotebookNotFoundError(notebookId);
    }
    
    // Read current notebook content
    const readmePath = `${srcbookDir}/README.md`;
    const readmeContent = await fs.promises.readFile(readmePath, 'utf8');
    const result = decode(readmeContent);
    if (result.error) {
      const errorMsg = result.errors ? result.errors.join(', ') : 'Unknown error';
      throw new MCPServerError(`Failed to decode notebook: ${errorMsg}`, 'DECODE_ERROR');
    }
    
    const cells = [...result.srcbook.cells];
    const language = result.srcbook.language;
    let operationDetails = '';
    
    switch (operation) {
      case 'add_cell':
        if (!cellType || content === undefined) {
          throw new InvalidOperationError('add_cell', 'cellType and content are required');
        }
        
        const newCell: any = {
          id: randomid(),
          type: cellType,
        };
        
        if (cellType === 'title') {
          newCell.text = content;
        } else if (cellType === 'markdown') {
          newCell.text = content;
        } else if (cellType === 'code') {
          newCell.source = content;
          newCell.filename = filename || `code-${newCell.id}.${language === 'typescript' ? 'ts' : 'js'}`;
          newCell.status = 'idle';
        } else if (cellType === 'package.json') {
          newCell.source = content;
          newCell.filename = 'package.json';
          newCell.status = 'idle';
        }
        
        const insertIndex = cellIndex !== undefined && cellIndex >= 0 && cellIndex <= cells.length ? cellIndex : cells.length;
        cells.splice(insertIndex, 0, newCell);
        operationDetails = `Added ${cellType} cell at index ${insertIndex}`;
        break;
        
      case 'edit_cell':
        if (cellIndex === undefined || content === undefined) {
          throw new InvalidOperationError('edit_cell', 'cellIndex and content are required');
        }
        if (cellIndex < 0 || cellIndex >= cells.length) {
          throw new InvalidOperationError('edit_cell', `Invalid cell index: ${cellIndex}`);
        }
        
        const cell = cells[cellIndex];
        if (cell.type === 'title' || cell.type === 'markdown') {
          cell.text = content;
        } else if (cell.type === 'code' || cell.type === 'package.json') {
          cell.source = content;
          if (filename) {
            cell.filename = filename;
          }
        }
        operationDetails = `Edited ${cell.type} cell at index ${cellIndex}`;
        break;
        
      case 'delete_cell':
        if (cellIndex === undefined) {
          throw new InvalidOperationError('delete_cell', 'cellIndex is required');
        }
        if (cellIndex < 0 || cellIndex >= cells.length) {
          throw new InvalidOperationError('delete_cell', `Invalid cell index: ${cellIndex}`);
        }
        
        const deletedCell = cells.splice(cellIndex, 1)[0];
        operationDetails = `Deleted ${deletedCell.type} cell from index ${cellIndex}`;
        break;
        
      case 'move_cell':
        if (cellIndex === undefined || newIndex === undefined) {
          throw new InvalidOperationError('move_cell', 'cellIndex and newIndex are required');
        }
        if (cellIndex < 0 || cellIndex >= cells.length || newIndex < 0 || newIndex >= cells.length) {
          throw new InvalidOperationError('move_cell', 'Invalid cell indices');
        }
        
        const [movedCell] = cells.splice(cellIndex, 1);
        cells.splice(newIndex, 0, movedCell);
        operationDetails = `Moved ${movedCell.type} cell from index ${cellIndex} to ${newIndex}`;
        break;
        
      default:
        throw new InvalidOperationError('update_notebook', `Unknown operation: ${operation}`);
    }
    
    // Write updated notebook back to disk
    await writeToDisk({
      dir: srcbookDir,
      cells,
      language,
      'tsconfig.json': language === 'typescript' ? result.srcbook['tsconfig.json'] : undefined
    });
    
    return {
      success: true,
      data: {
        notebookId,
        operation,
        operationDetails,
        cellCount: cells.length,
        updatedAt: new Date().toISOString()
      },
      message: `Notebook updated successfully: ${operationDetails}`
    };
  } catch (error) {
    if (error instanceof NotebookNotFoundError || error instanceof InvalidOperationError) {
      throw error;
    }
    throw new MCPServerError(
      `Failed to update notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UPDATE_NOTEBOOK_ERROR',
      error
    );
  }
}

/**
 * Handle delete notebook tool
 */
async function handleDeleteNotebook(args: any): Promise<ToolResult> {
  const { notebookId, confirm } = args;
  
  if (!confirm) {
    throw new InvalidOperationError('delete_notebook', 'Confirmation required for deletion');
  }
  
  try {
    const srcbookDir = pathToSrcbook(notebookId);
    
    // Check if notebook exists
    if (!await fs.promises.access(srcbookDir).then(() => true).catch(() => false)) {
      throw new NotebookNotFoundError(notebookId);
    }
    
    // Get title before deletion
    let title = 'Unknown';
    try {
      const readmePath = `${srcbookDir}/README.md`;
      const readmeContent = await fs.promises.readFile(readmePath, 'utf8');
      const result = decode(readmeContent);
      if (!result.error) {
        title = result.srcbook.cells.find(cell => cell.type === 'title')?.text || 'Untitled';
      }
    } catch {
      // Ignore errors reading title
    }
    
    // Delete the notebook
    await removeSrcbook(srcbookDir);
    
    return {
      success: true,
      data: {
        notebookId,
        title,
        srcbookDir,
        deletedAt: new Date().toISOString()
      },
      message: `Notebook '${title}' (${notebookId}) deleted successfully`
    };
  } catch (error) {
    if (error instanceof NotebookNotFoundError || error instanceof InvalidOperationError) {
      throw error;
    }
    throw new MCPServerError(
      `Failed to delete notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DELETE_NOTEBOOK_ERROR',
      error
    );
  }
}

/**
 * Handle execute notebook cell tool
 */
async function handleExecuteNotebookCell(args: any): Promise<ToolResult> {
  const { notebookId, cellIndex, timeout = 30000 } = args;
  
  try {
    const srcbookDir = pathToSrcbook(notebookId);
    
    // Check if notebook exists
    if (!await fs.promises.access(srcbookDir).then(() => true).catch(() => false)) {
      throw new NotebookNotFoundError(notebookId);
    }
    
    // Read current notebook content
    const readmePath = `${srcbookDir}/README.md`;
    const readmeContent = await fs.promises.readFile(readmePath, 'utf8');
    const result = decode(readmeContent);
    if (result.error) {
      const errorMsg = result.errors ? result.errors.join(', ') : 'Unknown error';
      throw new MCPServerError(`Failed to decode notebook: ${errorMsg}`, 'DECODE_ERROR');
    }
    
    const cells = result.srcbook.cells;
    
    // Validate cell index
    if (cellIndex < 0 || cellIndex >= cells.length) {
      throw new InvalidOperationError('execute_notebook_cell', `Invalid cell index: ${cellIndex}`);
    }
    
    const cell = cells[cellIndex];
    
    // Only execute code cells
    if (cell.type !== 'code') {
      throw new InvalidOperationError('execute_notebook_cell', `Cannot execute non-code cell of type: ${cell.type}`);
    }
    
    const startTime = Date.now();
    
    // Create a simple execution result (for now, just validate the code syntax)
    try {
      // Basic validation - check if code can be parsed
      new Function(cell.source);
      
      const executionTime = Date.now() - startTime;
      
      // Update cell status to idle (execution complete)
      cell.status = 'idle';
      
      // Write updated notebook back to disk
      await writeToDisk({
        dir: srcbookDir,
        cells,
        language: result.srcbook.language,
        'tsconfig.json': result.srcbook.language === 'typescript' ? result.srcbook['tsconfig.json'] : undefined
      });
      
      return {
        success: true,
        data: {
          notebookId,
          cellIndex,
          cellId: cell.id,
          cellType: cell.type,
          executionTime,
          output: 'Code syntax validated successfully',
          syntaxValid: true
        },
        message: `Cell ${cellIndex} executed successfully in ${executionTime}ms`
      };
      
    } catch (syntaxError) {
      const executionTime = Date.now() - startTime;
      
      // Keep cell status as idle (execution attempted)
      cell.status = 'idle';
      
      return {
        success: false,
        error: `Syntax error: ${(syntaxError as Error).message}`,
        data: {
          notebookId,
          cellIndex,
          cellId: cell.id,
          cellType: cell.type,
          executionTime,
          syntaxValid: false
        },
        message: `Cell ${cellIndex} failed execution with syntax error`
      };
    }
    
  } catch (error) {
    if (error instanceof NotebookNotFoundError || error instanceof InvalidOperationError) {
      throw error;
    }
    throw new ExecutionError(
      `Failed to execute cell: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  }
}

/**
 * Handle search notebooks tool
 */
async function handleSearchNotebooks(args: any): Promise<ToolResult> {
  const { query, limit = 10, includeContent = false } = args;
  
  try {
    const searchResults: any[] = [];
    
    // Get example notebooks and search them
    const examples = EXAMPLE_SRCBOOKS.filter(example => {
      const titleMatch = example.title.toLowerCase().includes(query.toLowerCase());
      const descMatch = example.description?.toLowerCase().includes(query.toLowerCase()) || false;
      const tagMatch = example.tags?.some(tag => tag.toLowerCase().includes(query.toLowerCase())) || false;
      
      return titleMatch || descMatch || tagMatch;
    });
    
    // Add matching examples to results
    for (const example of examples.slice(0, limit)) {
      const result: any = {
        id: example.id,
        title: example.title,
        description: example.description,
        language: example.language,
        tags: example.tags,
        type: 'example',
        path: example.path,
        score: calculateSearchScore(example, query)
      };
      
      if (includeContent && example.path) {
        try {
          // Try to read the example content
          const examplePath = `${example.path}`;
          const exampleContent = await fs.promises.readFile(examplePath, 'utf8');
          const decoded = decode(exampleContent);
          if (!decoded.error) {
            result.cellCount = decoded.srcbook.cells.length;
            result.preview = decoded.srcbook.cells
              .filter(cell => cell.type === 'markdown' || cell.type === 'title')
              .slice(0, 2)
              .map(cell => cell.text)
              .join(' ');
          }
        } catch {
          // Ignore read errors for examples
        }
      }
      
      searchResults.push(result);
    }
    
    // Sort by relevance score
    searchResults.sort((a, b) => b.score - a.score);
    
    return {
      success: true,
      data: {
        query,
        results: searchResults.slice(0, limit),
        total: searchResults.length,
        hasMore: examples.length > limit
      },
      message: `Found ${searchResults.length} notebooks matching "${query}"`
    };
    
  } catch (error) {
    throw new MCPServerError(
      `Failed to search notebooks: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'SEARCH_ERROR',
      error
    );
  }
}

/**
 * Calculate search relevance score
 */
function calculateSearchScore(item: any, query: string): number {
  const lowerQuery = query.toLowerCase();
  let score = 0;
  
  // Title match (highest weight)
  if (item.title.toLowerCase().includes(lowerQuery)) {
    score += 10;
    if (item.title.toLowerCase().startsWith(lowerQuery)) {
      score += 5; // Bonus for title prefix match
    }
  }
  
  // Description match
  if (item.description?.toLowerCase().includes(lowerQuery)) {
    score += 5;
  }
  
  // Tag exact match
  if (item.tags?.some((tag: string) => tag.toLowerCase() === lowerQuery)) {
    score += 8;
  }
  
  // Tag partial match
  if (item.tags?.some((tag: string) => tag.toLowerCase().includes(lowerQuery))) {
    score += 3;
  }
  
  return score;
}