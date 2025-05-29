import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { logger } from './logger.mjs';
import { notebookStorage } from './storage.mjs';
import { 
  RESOURCE_URI_PATTERNS, 
  NotebookNotFoundError,
  MCPServerError 
} from './types.mjs';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
      const examples = await getExampleNotebooks();
      for (const example of examples) {
        resources.push({
          uri: `${RESOURCE_URI_PATTERNS.NOTEBOOK_EXAMPLES}${example.id}`,
          name: example.title,
          description: example.description,
          mimeType: 'text/markdown',
          annotations: {
            audience: ['assistant'],
            priority: 2,
            tags: example.tags,
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
        const content = await readExampleNotebook(notebookId);
        
        return {
          contents: [{
            uri,
            mimeType: 'text/markdown',
            text: content,
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
 * Example notebook metadata
 */
const EXAMPLE_NOTEBOOKS_METADATA: Record<string, {
  title: string;
  description: string;
  tags: string[];
}> = {
  'connecting-to-postgres': {
    title: 'Connecting to Postgres',
    description: 'Demonstrates database connection, queries, and data manipulation with PostgreSQL',
    tags: ['Database', 'PostgreSQL', 'SQL']
  },
  'contributions-from-github-api': {
    title: 'Contributions from GitHub API',
    description: 'Shows how to use the GitHub API to fetch contributor statistics',
    tags: ['API', 'GitHub', 'Data']
  },
  'diagramming-srcbook-architecture': {
    title: 'Diagramming Srcbook Architecture',
    description: 'Shows how to create architecture diagrams using Mermaid',
    tags: ['Visualization', 'Mermaid', 'Architecture']
  },
  'generating-random-ids': {
    title: 'Generating Random IDs',
    description: 'Different methods for generating secure random identifiers',
    tags: ['Security', 'Cryptography', 'Utilities']
  },
  'getting-started': {
    title: 'Getting Started',
    description: 'Quick tutorial to explore the basic concepts in Srcbooks',
    tags: ['Srcbook', 'Learn', 'Tutorial']
  },
  'hn-screenshots': {
    title: 'HN Screenshots',
    description: 'Demonstrates taking and manipulating screenshots from Hacker News',
    tags: ['Web Scraping', 'Screenshots', 'Puppeteer']
  },
  'langgraph-web-agent': {
    title: 'LangGraph Web Agent',
    description: 'Learn to write a stateful agent with memory using LangGraph and Tavily',
    tags: ['AI', 'LangGraph', 'Agents']
  },
  'openai-structured-outputs': {
    title: 'OpenAI Structured Outputs',
    description: 'How to work with structured outputs from OpenAI models',
    tags: ['AI', 'OpenAI', 'Structured Data']
  },
  'parea-ai-evals-101': {
    title: 'Parea AI Evals 101',
    description: 'Introduction to evaluating AI models using Parea',
    tags: ['AI', 'Evaluation', 'Testing']
  },
  'pinata-sdk-101': {
    title: 'Pinata SDK 101',
    description: 'Introduction to using the Pinata SDK for IPFS interactions',
    tags: ['IPFS', 'Storage', 'Web3']
  },
  'port-check': {
    title: 'Port Check',
    description: 'Utility to check if specific ports are open on a server',
    tags: ['Networking', 'Utilities', 'System']
  },
  'read-write-aws-s3': {
    title: 'Read/Write AWS S3',
    description: 'Examples of reading from and writing to AWS S3 buckets',
    tags: ['AWS', 'S3', 'Storage']
  },
  'shamir-secret-sharing': {
    title: 'Shamir Secret Sharing',
    description: 'Implementation of Shamir\'s Secret Sharing scheme for secure key distribution',
    tags: ['Security', 'Cryptography', 'Algorithms']
  },
  'traceloop-101': {
    title: 'Traceloop 101',
    description: 'Getting started with Traceloop for LLM observability',
    tags: ['AI', 'Observability', 'Monitoring']
  },
  'web-scraping-with-puppeteer': {
    title: 'Web Scraping with Puppeteer',
    description: 'Tutorial on web scraping using Puppeteer',
    tags: ['Web Scraping', 'Puppeteer', 'Automation']
  },
  'websockets': {
    title: 'WebSockets',
    description: 'Learn to build a simple WebSocket client and server in Node.js',
    tags: ['WebSockets', 'Real-time', 'Networking']
  }
};

/**
 * Get example notebooks from the file system
 */
async function getExampleNotebooks() {
  const examplesDir = join(__dirname, '../../api/srcbook/examples');
  const notebooks = [];
  
  try {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(examplesDir);
    
    for (const file of files) {
      if (file.endsWith('.src.md') && !file.startsWith('README')) {
        const id = file.replace('.src.md', '');
        const metadata = EXAMPLE_NOTEBOOKS_METADATA[id] || {
          title: id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: `Example notebook: ${id}`,
          tags: ['Example']
        };
        
        notebooks.push({
          id,
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          filename: file,
          language: 'typescript' // Most examples are TypeScript
        });
      }
    }
  } catch (error) {
    logger.error('Error reading example notebooks:', error);
  }
  
  return notebooks;
}

/**
 * Read example notebook content
 */
async function readExampleNotebook(id: string): Promise<string> {
  const examplesDir = join(__dirname, '../../api/srcbook/examples');
  const filePath = join(examplesDir, `${id}.src.md`);
  
  try {
    const content = await readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    logger.error(`Error reading example notebook ${id}:`, error);
    throw new NotebookNotFoundError(id);
  }
}

/**
 * Extract ID from resource URI
 */
function extractIdFromURI(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1];
}