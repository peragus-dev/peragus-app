# Peragus MCP Server

A Model Context Protocol (MCP) server that provides TypeScript notebook functionality to AI assistants and other MCP clients.

## Features

- **CRUD Operations**: Create, read, update, and delete TypeScript/JavaScript notebooks
- **Code Execution**: Execute notebook cells with timeout and error handling
- **Example Notebooks**: Access 16+ example notebooks as MCP resources for AI reference
- **File-based Storage**: Stores notebooks as JSON files in `~/.peragus-mcp/notebooks/`
- **Protocol Version 2025-03-26**: Uses the latest MCP protocol with stdio transport
- **Standalone Operation**: No database dependencies, runs independently

## Quick Setup

### For Demo/Development

The fastest way to get started:

1. **Start Peragus dev server**:
   ```bash
   cd /path/to/peragus-app
   pnpm dev
   ```

2. **Connect MCP client** using this config:
   ```json
   {
     "mcpServers": {
       "peragus-notebooks": {
         "command": "node",
         "args": ["/path/to/peragus-app/packages/mcp-server/dist/cli.mjs"],
         "env": {}
       }
     }
   }
   ```

### For Production

Use Docker for a complete deployment:

```bash
# In the peragus-app directory
docker build -t peragus-app .
docker run -d --name peragus -p 5173:5173 -p 2150:2150 -v ~/.peragus:/root/.peragus peragus-app
```

## Installation

```bash
# Install from the monorepo
pnpm -F @peragus/mcp-server build

# Or install globally (when published)
npm install -g @peragus/mcp-server
```

## Usage

### Command Line Interface

```bash
# Start with default settings
peragus-mcp-server

# Enable debug logging
peragus-mcp-server --log-level debug

# Use custom storage directory
peragus-mcp-server --storage-dir ~/my-notebooks

# Show help
peragus-mcp-server --help
```

### MCP Client Configuration

To connect an MCP client to this server, you have several deployment options:

#### Option 1: Local Development (Requires Peragus Dev Server)

First, start the Peragus development server:
```bash
cd /path/to/peragus-app
pnpm dev
```

Then configure your MCP client:

**Claude Code Configuration** (`mcp_config_claude_code.json`):
```json
{
  "mcpServers": {
    "peragus-notebooks": {
      "command": "node",
      "args": ["/path/to/peragus-app/packages/mcp-server/dist/cli.mjs", "--log-level", "info"],
      "env": {}
    }
  }
}
```

#### Option 2: Docker Deployment (Recommended for Production)

**Option 2A: Docker Compose (Easiest)**
```bash
# In the peragus-app directory
docker-compose up -d
```

**Option 2B: Manual Docker**
```bash
# Build and run manually
docker build -t peragus-app .
docker run -d \
  --name peragus \
  -p 5173:5173 \
  -p 2150:2150 \
  -v ~/.srcbook:/root/.srcbook \
  -v ~/.peragus:/root/.peragus \
  peragus-app
```

**Claude Code Configuration** for Docker:
```json
{
  "mcpServers": {
    "peragus-notebooks": {
      "command": "docker",
      "args": ["exec", "peragus", "node", "/app/packages/mcp-server/dist/cli.mjs"],
      "env": {}
    }
  }
}
```

After starting Docker, you can:
- Access Peragus Web UI: http://localhost:5173
- API runs on: http://localhost:2150
- MCP server available via: `docker exec peragus node /app/packages/mcp-server/dist/cli.mjs`

#### Option 3: Direct Binary (If Published)

```json
{
  "mcpServers": {
    "peragus-notebooks": {
      "command": "peragus-mcp-server",
      "args": ["--log-level", "info"],
      "env": {}
    }
  }
}
```

#### Generic MCP Client Configuration

For other MCP clients, use these connection details:

- **Transport**: stdio
- **Command**: See options above
- **Protocol Version**: `2025-03-26`

## Configuration

### Command Line Options

- `-l, --log-level <LEVEL>` - Log level: debug, info, warn, error (default: info)
- `-d, --storage-dir <DIR>` - Custom storage directory path
- `-h, --help` - Show help message
- `-v, --version` - Show version information

### Configuration Schema

```typescript
interface MCPServerConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  storageDir?: string;
}
```

## Available Tools

The server provides the following MCP tools:

### `create_notebook`
Create a new TypeScript/JavaScript notebook.

**Parameters:**
- `title` (string): Notebook title
- `language` (string): "typescript" or "javascript"
- `initialCells` (array, optional): Initial cells to add

### `list_notebooks`
List all available notebooks with metadata.

**Returns:** Array of notebook metadata (id, title, language, createdAt, updatedAt)

### `list_example_notebooks`
List all available example notebooks that can be used as reference when creating new notebooks.

**Returns:** Array of example notebooks with:
- `id`: Example notebook identifier
- `title`: Human-readable title
- `description`: What the example demonstrates
- `tags`: Categories (e.g., "AI", "Database", "Web Scraping")
- `resourceUri`: MCP resource URI to access the notebook
- `importCommand`: Instructions to import the example

### `get_notebook`
Retrieve a notebook by ID.

**Parameters:**
- `id` (string): Notebook ID

### `edit_notebook`
Edit a notebook using various operations.

**Parameters:**
- `id` (string): Notebook ID
- `operation` (object): Operation to perform
  - `type`: "add_cell", "edit_cell", "delete_cell", "move_cell", "execute_cell", "execute_all"
  - Additional parameters based on operation type

### `delete_notebook`
Delete a notebook by ID.

**Parameters:**
- `id` (string): Notebook ID

### `execute_notebook`
Execute all cells in a notebook.

**Parameters:**
- `id` (string): Notebook ID

### `export_notebook`
Export a notebook to various formats.

**Parameters:**
- `id` (string): Notebook ID
- `format` (string): "markdown", "json", "srcbook", or "html"

### `import_notebook`
Import a notebook from various sources.

**Parameters:**
- `source` (string): "file", "url", or "text"
- `data` (string): Source data (file path, URL, or text content)
- `title` (string, optional): Custom title for imported notebook

## Available Resources

### Notebook Listing
- **URI**: `notebook://list`
- **Description**: List of all available notebooks

### Individual Notebooks
- **URI**: `notebook://notebooks/{id}`
- **Description**: Content of a specific notebook

## Storage

Notebooks are stored as JSON files in:
- **Default**: `~/.peragus-mcp/notebooks/`
- **Custom**: Use `--storage-dir` flag to specify a different location

Each notebook file contains:
```json
{
  "id": "unique-notebook-id",
  "title": "Notebook Title",
  "language": "typescript",
  "cells": [
    {
      "id": "cell-id",
      "type": "code",
      "source": "console.log('Hello, World!');"
    }
  ],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

## Code Execution

The server executes TypeScript and JavaScript code using Node.js child processes with:
- **Timeout**: 30 seconds per execution
- **Security**: Sandboxed execution environment
- **Output Capture**: Both stdout and stderr are captured
- **Error Handling**: Compilation and runtime errors are properly reported

## Protocol Support

- **MCP Protocol Version**: 2025-03-26
- **Transport**: stdio (standard input/output)
- **Capabilities**:
  - Resources with subscription support
  - Tools with change notifications
  - Logging with configurable levels

## Development

### Building

```bash
pnpm build
```

### Testing

```bash
# Test MCP protocol communication
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}},"id":1}' | node dist/cli.mjs

# Test tool listing
echo '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}' | node dist/cli.mjs
```

### Error Handling

The server includes comprehensive error handling:
- Invalid notebook IDs return `NotebookNotFoundError`
- Invalid operations return `InvalidOperationError`
- Code execution failures return `ExecutionError`
- All errors follow MCP error response format

## License

MIT License - see the main project LICENSE file for details.