import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from './logger.mjs';
import { notebookStorage } from './storage.mjs';
import { 
  RESOURCE_URI_PATTERNS, 
  NotebookNotFoundError,
  MCPServerError 
} from './types.mjs';

/**
 * Register all resource handlers with the MCP server
 */
export function registerResourceHandlers(server: Server): void {
  // List all available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      const resources = [];

      // Add user notebooks as resources
      const notebooks = await notebookStorage.listNotebooks();
      for (const notebook of notebooks) {
        resources.push({
          uri: `${RESOURCE_URI_PATTERNS.NOTEBOOK_USER}${notebook.id}`,
          name: notebook.title || 'Untitled Notebook',
          description: `${notebook.language} notebook with ${notebook.cells.length} cells`,
          mimeType: 'application/json',
          annotations: {
            audience: ['user', 'assistant'],
            priority: 1,
          },
        });
      }

      // Add example notebooks as resources
      const examples = getExampleNotebooks();
      for (const example of examples) {
        resources.push({
          uri: `${RESOURCE_URI_PATTERNS.NOTEBOOK_EXAMPLES}${example.id}`,
          name: example.title,
          description: example.description || `Example ${example.language} notebook`,
          mimeType: 'application/json',
          annotations: {
            audience: ['user', 'assistant'],
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

      if (uri.startsWith(RESOURCE_URI_PATTERNS.NOTEBOOK_USER)) {
        const notebookId = extractIdFromURI(uri);
        const notebook = await notebookStorage.readNotebook(notebookId);
        
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(notebook, null, 2),
          }],
        };
      } 
      else if (uri.startsWith(RESOURCE_URI_PATTERNS.NOTEBOOK_EXAMPLES)) {
        const notebookId = extractIdFromURI(uri);
        const examples = getExampleNotebooks();
        const example = examples.find(ex => ex.id === notebookId);
        
        if (!example) {
          throw new NotebookNotFoundError(notebookId);
        }
        
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(example, null, 2),
          }],
        };
      }
      else {
        throw new MCPServerError(`Unsupported resource URI: ${uri}`, 'UNSUPPORTED_URI');
      }
    } catch (error) {
      logger.error(`Error reading resource ${uri}:`, error);
      if (error instanceof MCPServerError || error instanceof NotebookNotFoundError) {
        throw error;
      }
      throw new MCPServerError(`Failed to read resource: ${uri}`, 'RESOURCE_READ_ERROR', error);
    }
  });
}

/**
 * Get example notebooks (static examples for demonstration)
 */
function getExampleNotebooks() {
  return [
    {
      id: 'getting-started-ts',
      title: 'Getting Started with TypeScript',
      description: 'Learn the basics of TypeScript in notebooks',
      language: 'typescript' as const,
      cells: [
        {
          id: 'cell_title',
          type: 'title' as const,
          content: 'Getting Started with TypeScript'
        },
        {
          id: 'cell_intro',
          type: 'markdown' as const,
          content: '# Welcome to TypeScript Notebooks!\n\nThis is an interactive TypeScript environment where you can write and execute code.'
        },
        {
          id: 'cell_hello',
          type: 'code' as const,
          content: 'console.log("Hello, TypeScript!");\nconst message: string = "Welcome to Peragus!";\nconsole.log(message);',
          filename: 'hello.ts'
        },
        {
          id: 'cell_types',
          type: 'code' as const,
          content: '// TypeScript types in action\ninterface User {\n  name: string;\n  age: number;\n}\n\nconst user: User = {\n  name: "Alice",\n  age: 30\n};\n\nconsole.log(`User: ${user.name}, Age: ${user.age}`);',
          filename: 'types.ts'
        }
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    },
    {
      id: 'getting-started-js',
      title: 'Getting Started with JavaScript',
      description: 'Learn the basics of JavaScript in notebooks',
      language: 'javascript' as const,
      cells: [
        {
          id: 'cell_title',
          type: 'title' as const,
          content: 'Getting Started with JavaScript'
        },
        {
          id: 'cell_intro',
          type: 'markdown' as const,
          content: '# Welcome to JavaScript Notebooks!\n\nThis is an interactive JavaScript environment.'
        },
        {
          id: 'cell_hello',
          type: 'code' as const,
          content: 'console.log("Hello, JavaScript!");\nconst message = "Welcome to Peragus!";\nconsole.log(message);',
          filename: 'hello.js'
        },
        {
          id: 'cell_functions',
          type: 'code' as const,
          content: '// JavaScript functions\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconst greeting = greet("World");\nconsole.log(greeting);',
          filename: 'functions.js'
        }
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }
  ];
}

/**
 * Extract ID from resource URI
 */
function extractIdFromURI(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1];
}