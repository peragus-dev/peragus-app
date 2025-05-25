import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from './logger.mjs';
import { 
  RESOURCE_URI_PATTERNS, 
  NotebookNotFoundError,
  MCPServerError 
} from './types.mjs';
import { getNotebookTemplates } from './templates.mjs';

/**
 * Register all resource handlers with the MCP server
 */
export function registerResourceHandlers(server: Server): void {
  // List all available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      const resources = [];

      // Add example notebooks as resources
      const examples = await getExampleNotebooks();
      for (const example of examples) {
        resources.push({
          uri: `${RESOURCE_URI_PATTERNS.NOTEBOOK_EXAMPLES}${example.id}`,
          name: example.title,
          description: example.description || `Example ${example.language} notebook`,
          mimeType: 'application/x-srcbook',
          annotations: {
            audience: ['user', 'assistant'],
            priority: getPriorityForExample(example),
          },
        });
      }

      // Add user notebooks as resources
      const userNotebooks = await getUserNotebooks();
      for (const notebook of userNotebooks) {
        resources.push({
          uri: `${RESOURCE_URI_PATTERNS.NOTEBOOK_USER}${notebook.id}`,
          name: notebook.title || 'Untitled Notebook',
          description: `User ${notebook.language} notebook`,
          mimeType: 'application/x-srcbook',
          annotations: {
            audience: ['user', 'assistant'],
            priority: 1,
          },
        });
      }

      // Add notebook templates as resources
      const templates = await getNotebookTemplates();
      for (const template of templates) {
        resources.push({
          uri: `${RESOURCE_URI_PATTERNS.TEMPLATE_NOTEBOOK}${template.id}`,
          name: template.name,
          description: template.description,
          mimeType: 'application/x-srcbook-template',
          annotations: {
            audience: ['assistant'],
            priority: 2,
          },
        });
      }

      logger.debug(`Listed ${resources.length} resources`);
      return { resources };
    } catch (error) {
      logger.error('Error listing resources:', error);
      throw new MCPServerError('Failed to list resources', 'RESOURCE_LIST_ERROR', error);
    }
  });

  // Read specific resource content
  server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
    const uri = request.params.uri;
    
    try {
      logger.debug(`Reading resource: ${uri}`);

      if (uri.startsWith(RESOURCE_URI_PATTERNS.NOTEBOOK_EXAMPLES)) {
        const notebookId = extractIdFromURI(uri);
        const notebook = await getExampleNotebook(notebookId);
        
        if (!notebook) {
          throw new NotebookNotFoundError(notebookId);
        }
        
        const content = serializeNotebook(notebook);
        
        return {
          contents: [{
            uri,
            mimeType: 'application/x-srcbook',
            text: content,
          }],
        };
      } 
      else if (uri.startsWith(RESOURCE_URI_PATTERNS.NOTEBOOK_USER)) {
        const notebookId = extractIdFromURI(uri);
        const notebook = await getUserNotebook(notebookId);
        
        if (!notebook) {
          throw new NotebookNotFoundError(notebookId);
        }
        
        const content = serializeNotebook(notebook);
        
        return {
          contents: [{
            uri,
            mimeType: 'application/x-srcbook',
            text: content,
          }],
        };
      }
      else if (uri.startsWith(RESOURCE_URI_PATTERNS.TEMPLATE_NOTEBOOK)) {
        const templateId = extractIdFromURI(uri);
        const template = await getNotebookTemplate(templateId);
        
        if (!template) {
          throw new NotebookNotFoundError(templateId);
        }
        
        const content = serializeTemplate(template);
        
        return {
          contents: [{
            uri,
            mimeType: 'application/x-srcbook-template',
            text: content,
          }],
        };
      }
      else {
        throw new MCPServerError(`Unsupported resource URI: ${uri}`, 'UNSUPPORTED_URI');
      }
    } catch (error) {
      logger.error(`Error reading resource ${uri}:`, error);
      if (error instanceof MCPServerError) {
        throw error;
      }
      throw new MCPServerError(`Failed to read resource: ${uri}`, 'RESOURCE_READ_ERROR', error);
    }
  });
}

/**
 * Get all example notebooks (simplified implementation)
 */
async function getExampleNotebooks() {
  // Simplified example notebooks - in real implementation would load from EXAMPLE_SRCBOOKS
  return [
    {
      id: 'getting-started',
      title: 'Getting Started with TypeScript',
      description: 'Learn the basics of TypeScript notebooks',
      language: 'typescript',
      tags: ['tutorial', 'basics'],
      content: {
        cells: [
          { type: 'title', text: 'Getting Started with TypeScript' },
          { type: 'markdown', source: '# Welcome to TypeScript notebooks!' },
          { type: 'code', source: 'console.log("Hello, TypeScript!");', filename: 'hello.ts' }
        ],
        language: 'typescript'
      }
    }
  ];
}

/**
 * Get all user notebooks (simplified implementation)
 */
async function getUserNotebooks() {
  // Simplified implementation - in real version would scan SRCBOOKS_DIR
  return [
    {
      id: 'user-notebook-1',
      title: 'My First Notebook',
      language: 'typescript',
      openedAt: Date.now()
    }
  ];
}

/**
 * Get a specific example notebook
 */
async function getExampleNotebook(notebookId: string) {
  const examples = await getExampleNotebooks();
  return examples.find(example => example.id === notebookId);
}

/**
 * Get a specific user notebook
 */
async function getUserNotebook(notebookId: string) {
  const userNotebooks = await getUserNotebooks();
  return userNotebooks.find(notebook => notebook.id === notebookId);
}

/**
 * Get a specific notebook template
 */
async function getNotebookTemplate(templateId: string) {
  const templates = await getNotebookTemplates();
  return templates.find((template: any) => template.id === templateId);
}

/**
 * Serialize notebook to string format
 */
function serializeNotebook(notebook: any): string {
  try {
    if (notebook.content) {
      // For example notebooks with content
      return JSON.stringify(notebook.content, null, 2);
    } else {
      // For session notebooks
      return JSON.stringify({ 
        id: notebook.id,
        title: notebook.title,
        language: notebook.language,
        cells: notebook.cells || []
      }, null, 2);
    }
  } catch (error) {
    logger.error('Error serializing notebook:', error);
    return JSON.stringify(notebook, null, 2);
  }
}

/**
 * Serialize template to string format
 */
function serializeTemplate(template: any): string {
  try {
    return JSON.stringify(template, null, 2);
  } catch (error) {
    logger.error('Error serializing template:', error);
    return JSON.stringify(template);
  }
}

/**
 * Extract ID from resource URI
 */
function extractIdFromURI(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1];
}

/**
 * Get priority for example notebook (higher priority = more important)
 */
function getPriorityForExample(example: any): number {
  // Prioritize getting started examples
  if (example.id === 'getting-started' || example.title.toLowerCase().includes('getting started')) {
    return 3;
  }
  
  // Prioritize TypeScript examples
  if (example.language === 'typescript') {
    return 2;
  }
  
  return 1;
}