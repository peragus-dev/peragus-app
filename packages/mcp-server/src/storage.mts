import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import { logger } from './logger.mjs';
import { MCPServerError, NotebookNotFoundError } from './types.mjs';

/**
 * Notebook file structure
 */
export const NotebookFileSchema = z.object({
  id: z.string(),
  title: z.string(),
  language: z.enum(['typescript', 'javascript']),
  cells: z.array(z.object({
    id: z.string(),
    type: z.enum(['title', 'markdown', 'code', 'package.json']),
    content: z.string(),
    filename: z.string().optional(),
  })),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type NotebookFile = z.infer<typeof NotebookFileSchema>;

/**
 * Storage manager for file-based notebook persistence
 */
export class NotebookStorage {
  private readonly storageDir: string;

  constructor() {
    this.storageDir = path.join(homedir(), '.peragus-mcp', 'notebooks');
  }

  /**
   * Initialize storage directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      logger.info(`Storage initialized at: ${this.storageDir}`);
    } catch (error) {
      throw new MCPServerError(
        `Failed to initialize storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'STORAGE_INIT_ERROR'
      );
    }
  }

  /**
   * Generate a unique notebook ID
   */
  private generateId(): string {
    return `nb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get file path for a notebook
   */
  private getNotebookPath(id: string): string {
    return path.join(this.storageDir, `${id}.json`);
  }

  /**
   * Create a new notebook
   */
  async createNotebook(
    title: string, 
    language: 'typescript' | 'javascript',
    initialCells: Array<{
      type: 'title' | 'markdown' | 'code' | 'package.json';
      content: string;
      filename?: string;
    }> = []
  ): Promise<NotebookFile> {
    const id = this.generateId();
    const now = new Date().toISOString();

    // Add default cells if none provided
    const cells = initialCells.length > 0 ? initialCells : [
      {
        id: `cell_${Date.now()}_1`,
        type: 'title' as const,
        content: title,
      },
      {
        id: `cell_${Date.now()}_2`,
        type: 'markdown' as const,
        content: '# Getting Started\n\nThis is a new notebook. Add your content below.',
      },
    ];

    // Ensure all cells have IDs
    const cellsWithIds = cells.map((cell, index) => ({
      ...cell,
      id: (cell as any).id || `cell_${Date.now()}_${index + 1}`,
    }));

    const notebook: NotebookFile = {
      id,
      title,
      language,
      cells: cellsWithIds,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const filePath = this.getNotebookPath(id);
      await fs.writeFile(filePath, JSON.stringify(notebook, null, 2), 'utf-8');
      logger.info(`Created notebook: ${id} at ${filePath}`);
      return notebook;
    } catch (error) {
      throw new MCPServerError(
        `Failed to create notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_ERROR'
      );
    }
  }

  /**
   * Read a notebook by ID
   */
  async readNotebook(id: string): Promise<NotebookFile> {
    try {
      const filePath = this.getNotebookPath(id);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      // Validate the data structure
      const notebook = NotebookFileSchema.parse(data);
      return notebook;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new NotebookNotFoundError(id);
      }
      throw new MCPServerError(
        `Failed to read notebook ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'READ_ERROR'
      );
    }
  }

  /**
   * Update a notebook
   */
  async updateNotebook(id: string, updates: Partial<Omit<NotebookFile, 'id' | 'createdAt'>>): Promise<NotebookFile> {
    try {
      const existing = await this.readNotebook(id);
      const updated: NotebookFile = {
        ...existing,
        ...updates,
        id, // Ensure ID doesn't change
        createdAt: existing.createdAt, // Preserve creation time
        updatedAt: new Date().toISOString(),
      };

      const filePath = this.getNotebookPath(id);
      await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      logger.info(`Updated notebook: ${id}`);
      return updated;
    } catch (error) {
      if (error instanceof NotebookNotFoundError) {
        throw error;
      }
      throw new MCPServerError(
        `Failed to update notebook ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_ERROR'
      );
    }
  }

  /**
   * Delete a notebook
   */
  async deleteNotebook(id: string): Promise<void> {
    try {
      const filePath = this.getNotebookPath(id);
      await fs.unlink(filePath);
      logger.info(`Deleted notebook: ${id}`);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new NotebookNotFoundError(id);
      }
      throw new MCPServerError(
        `Failed to delete notebook ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_ERROR'
      );
    }
  }

  /**
   * List all notebooks
   */
  async listNotebooks(): Promise<NotebookFile[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      const notebooks: NotebookFile[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const id = file.replace('.json', '');
            const notebook = await this.readNotebook(id);
            notebooks.push(notebook);
          } catch (error) {
            logger.warn(`Failed to read notebook file ${file}:`, error);
            // Continue with other files
          }
        }
      }

      // Sort by creation date (newest first)
      return notebooks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Directory doesn't exist yet, return empty array
        return [];
      }
      throw new MCPServerError(
        `Failed to list notebooks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_ERROR'
      );
    }
  }

  /**
   * Check if storage directory exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.storageDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get storage directory path
   */
  getStorageDir(): string {
    return this.storageDir;
  }
}

// Export singleton instance
export const notebookStorage = new NotebookStorage();