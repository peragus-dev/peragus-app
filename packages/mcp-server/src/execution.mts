import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { logger } from './logger.mjs';
import { ExecutionError } from './types.mjs';
import type { NotebookFile } from './storage.mjs';

/**
 * Cell execution result
 */
export interface CellExecutionResult {
  cellId: string;
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
}

/**
 * Notebook execution result
 */
export interface NotebookExecutionResult {
  notebookId: string;
  success: boolean;
  results: CellExecutionResult[];
  totalExecutionTime: number;
}

/**
 * Standalone code execution engine
 */
export class CodeExecutor {
  private readonly tempDir: string;

  constructor() {
    this.tempDir = path.join(tmpdir(), 'peragus-mcp-execution');
  }

  /**
   * Initialize execution environment
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      logger.info(`Execution environment initialized at: ${this.tempDir}`);
    } catch (error) {
      throw new ExecutionError(
        `Failed to initialize execution environment: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Execute a single code cell
   */
  async executeCell(
    cellId: string,
    content: string,
    language: 'typescript' | 'javascript',
    timeout: number = 30000
  ): Promise<CellExecutionResult> {
    const startTime = Date.now();
    
    try {
      // Create temporary file for execution
      const extension = language === 'typescript' ? '.ts' : '.js';
      const filename = `cell_${cellId}_${Date.now()}${extension}`;
      const filePath = path.join(this.tempDir, filename);
      
      await fs.writeFile(filePath, content, 'utf-8');
      
      // Execute the code
      const result = await this.runCode(filePath, language, timeout);
      
      // Clean up temporary file
      try {
        await fs.unlink(filePath);
      } catch (error) {
        logger.warn(`Failed to cleanup temp file ${filePath}:`, error);
      }
      
      const executionTime = Date.now() - startTime;
      
      return {
        cellId,
        success: result.success,
        output: result.output,
        error: result.error,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        cellId,
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown execution error',
        executionTime,
      };
    }
  }

  /**
   * Execute all code cells in a notebook
   */
  async executeNotebook(
    notebook: NotebookFile,
    cellIds?: string[],
    timeout: number = 30000
  ): Promise<NotebookExecutionResult> {
    const startTime = Date.now();
    const results: CellExecutionResult[] = [];
    
    // Filter code cells to execute
    const codeCells = notebook.cells.filter(cell => {
      return cell.type === 'code' && (!cellIds || cellIds.includes(cell.id));
    });
    
    logger.info(`Executing ${codeCells.length} code cells from notebook ${notebook.id}`);
    
    // Execute cells sequentially
    for (const cell of codeCells) {
      try {
        const result = await this.executeCell(cell.id, cell.content, notebook.language, timeout);
        results.push(result);
        
        // If a cell fails, log it but continue with other cells
        if (!result.success) {
          logger.warn(`Cell ${cell.id} execution failed: ${result.error}`);
        }
      } catch (error) {
        logger.error(`Failed to execute cell ${cell.id}:`, error);
        results.push({
          cellId: cell.id,
          success: false,
          output: '',
          error: error instanceof Error ? error.message : 'Execution failed',
          executionTime: 0,
        });
      }
    }
    
    const totalExecutionTime = Date.now() - startTime;
    const success = results.every(result => result.success);
    
    return {
      notebookId: notebook.id,
      success,
      results,
      totalExecutionTime,
    };
  }

  /**
   * Run code in a subprocess
   */
  private async runCode(
    filePath: string,
    language: 'typescript' | 'javascript',
    timeout: number
  ): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      let command: string;
      let args: string[];
      
      if (language === 'typescript') {
        // Use tsx if available, otherwise ts-node, otherwise compile and run
        command = 'npx';
        args = ['tsx', filePath];
      } else {
        command = 'node';
        args = [filePath];
      }
      
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            output: stdout.trim(),
          });
        } else {
          resolve({
            success: false,
            output: stdout.trim(),
            error: stderr.trim() || `Process exited with code ${code}`,
          });
        }
      });
      
      child.on('error', (error) => {
        resolve({
          success: false,
          output: '',
          error: `Execution error: ${error.message}`,
        });
      });
      
      // Handle timeout
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGTERM');
          resolve({
            success: false,
            output: stdout.trim(),
            error: `Execution timed out after ${timeout}ms`,
          });
        }
      }, timeout);
    });
  }

  /**
   * Create a package.json file for TypeScript execution
   */
  async createPackageJson(deps: string[] = []): Promise<string> {
    const packageJson = {
      name: 'peragus-mcp-execution',
      version: '1.0.0',
      type: 'module',
      dependencies: deps.reduce((acc, dep) => {
        acc[dep] = 'latest';
        return acc;
      }, {} as Record<string, string>),
    };
    
    const packagePath = path.join(this.tempDir, 'package.json');
    await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2), 'utf-8');
    
    return packagePath;
  }

  /**
   * Clean up execution environment
   */
  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.tempDir, file)).catch(() => {}))
      );
      logger.info('Execution environment cleaned up');
    } catch (error) {
      logger.warn('Failed to cleanup execution environment:', error);
    }
  }
}

// Export singleton instance
export const codeExecutor = new CodeExecutor();