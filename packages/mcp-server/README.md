# Peragus MCP Server

A Model Context Protocol (MCP) server that provides TypeScript notebook functionality for AI assistants and other MCP clients.

## Overview

This MCP server exposes Peragus TypeScript notebook operations as standardized MCP tools and resources, allowing AI assistants to create, execute, and manage TypeScript notebooks programmatically.

## Features

### Tools
- **create_notebook** - Create new TypeScript notebooks
- **execute_cell** - Execute TypeScript code cells
- **add_cell** - Add new cells to notebooks
- **update_cell** - Update existing cell content
- **delete_cell** - Remove cells from notebooks
- **save_notebook** - Save notebooks to disk
- **import_notebook** - Import existing notebooks
- **generate_notebook** - AI-powered notebook generation

### Resources
- **notebook://list** - List all available notebooks
- **notebook://read/{id}** - Read specific notebook content
- **notebook://export/{id}** - Export notebook in various formats
- **notebook://examples** - List example notebooks

## Installation

```bash
cd packages/mcp-server
pnpm install
pnpm build
```

## Usage

### As a Standalone Server

```bash
# Start server on default port 3001
pnpm start

# Or with custom configuration
node dist/index.js --port 3002 --log-level info
```

### Programmatic Usage

```typescript
import { startMCPServer } from '@srcbook/mcp-server';

const server = await startMCPServer({
  port: 3001,
  logLevel: 'info',
  srcbooksDir: './notebooks'
});
```

### MCP Client Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "peragus-notebooks": {
      "url": "http://localhost:3001/mcp",
      "env": {
        "SRCBOOKS_DIR": "/path/to/your/notebooks"
      }
    }
  }
}
```

## Configuration

### Environment Variables

- `SRCBOOKS_DIR` - Directory for storing notebooks (default: `~/.srcbook`)
- `LOG_LEVEL` - Logging level: `debug`, `info`, `warn`, `error` (default: `info`)
- `MCP_PORT` - Port for HTTP server (default: `3001`)

### Configuration Schema

```typescript
interface MCPServerConfig {
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  srcbooksDir?: string;
}
```

## API Reference

### Tools

#### create_notebook
Creates a new TypeScript notebook.

**Parameters:**
- `title` (string) - Notebook title
- `language` (string) - Programming language (`typescript` or `javascript`)
- `template` (string, optional) - Template ID to use

**Returns:**
- `notebookId` (string) - ID of created notebook
- `path` (string) - File system path to notebook

#### execute_cell
Executes a code cell in a notebook.

**Parameters:**
- `notebookId` (string) - Notebook ID
- `cellId` (string) - Cell ID to execute

**Returns:**
- `output` (object) - Execution results
- `status` (string) - Execution status

#### add_cell
Adds a new cell to a notebook.

**Parameters:**
- `notebookId` (string) - Notebook ID
- `type` (string) - Cell type (`code`, `markdown`, `title`)
- `content` (string) - Cell content
- `position` (number, optional) - Insert position

**Returns:**
- `cellId` (string) - ID of created cell

### Resources

#### notebook://list
Lists all available notebooks with metadata.

**Response:**
```json
{
  "notebooks": [
    {
      "id": "notebook-123",
      "title": "My Notebook",
      "language": "typescript",
      "lastModified": "2024-01-01T00:00:00Z",
      "cellCount": 5
    }
  ]
}
```

#### notebook://read/{id}
Returns the complete content of a specific notebook.

**Response:**
```json
{
  "id": "notebook-123",
  "title": "My Notebook",
  "language": "typescript",
  "cells": [
    {
      "id": "cell-1",
      "type": "title",
      "text": "My Notebook"
    },
    {
      "id": "cell-2",
      "type": "code",
      "source": "console.log('Hello, World!');",
      "filename": "hello.ts"
    }
  ]
}
```

## Development

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

### Linting

```bash
pnpm lint
```

### Type Checking

```bash
pnpm type-check
```

## Architecture

The MCP server is built with:

- **@modelcontextprotocol/sdk** - MCP protocol implementation
- **@srcbook/api** - Core notebook functionality
- **@srcbook/shared** - Shared types and utilities
- **zod** - Runtime type validation
- **express** - HTTP server framework

The server uses streamable HTTP transport for bidirectional communication, supporting real-time interactions between MCP clients and the notebook server.

### Project Structure

```
src/
├── index.mts          # Main entry point
├── server.mts         # MCP server setup
├── tools.mts          # Tool implementations
├── resources.mts      # Resource implementations
├── types.mts          # Type definitions
├── logger.mts         # Logging utilities
├── templates.mts      # Notebook templates
└── test/              # Test files
```

## Error Handling

The server provides comprehensive error handling with specific error types:

- `NotebookNotFoundError` - Notebook doesn't exist
- `CellNotFoundError` - Cell doesn't exist
- `ExecutionError` - Code execution failed
- `ValidationError` - Invalid input parameters
- `MCPServerError` - General server errors

## Security

- All inputs are validated using Zod schemas
- File system access is restricted to configured directories
- Code execution is sandboxed using existing Peragus security measures
- No sensitive information is logged

## Troubleshooting

### Common Issues

1. **Server won't start**
   - Check that all dependencies are installed
   - Verify the srcbooks directory exists and is writable
   - Check log output for specific errors

2. **Tools not working**
   - Ensure notebooks directory is accessible
   - Check that TypeScript server is running
   - Verify MCP client configuration

3. **Performance issues**
   - Monitor memory usage during code execution
   - Check for long-running processes
   - Consider adjusting log levels

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug pnpm start
```

## Contributing

1. Follow existing code patterns and conventions
2. Add tests for new functionality
3. Update documentation for API changes
4. Ensure all tests pass before submitting

## License

This project is licensed under the same terms as the main Peragus project.