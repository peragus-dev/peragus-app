<picture>
  <source media="(prefers-color-scheme: dark)" srcset="image-23.jpg">
  <source media="(prefers-color-scheme: light)" srcset="image-23.jpg">
  <img alt="Peragus banner" src="image-23.jpg">
</picture>

<p align="center">
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="Apache 2.0 license" /></a>
</p>

<p align="center">
  <a href="https://discord.gg/shDEGBSe2d">Discord</a>
</p>

## Peragus

Peragus is an AI-enhanced TypeScript notebook platform designed for productive development with AI assistance.

Peragus is open-source (apache2) and runs locally on your machine. You'll need to bring your own API key for AI usage (we strongly recommend Anthropic with `claude-3-5-sonnet-latest`).

## Features

### Notebooks

- Create, run, and share TypeScript notebooks
- Export to valid markdown format (.src.md)
- Advanced AI assistance for exploring and iterating on ideas
- Intelligent code completion and suggestions
- Integrated debugging and testing capabilities
- Diagraming with [mermaid](https://mermaid.js.org) for rich annotations
- Local execution with a web interface
- Powered by Node.js with TypeScript optimizations

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/2a4fa0f6-ef1b-4606-c9fa-b31d61b7c300/public">
  <source media="(prefers-color-scheme: light)" srcset="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/ebfa2bfe-f805-4398-a348-0f48d4f93400/public">
  <img alt="Example Srcbook" src="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/ebfa2bfe-f805-4398-a348-0f48d4f93400/public">
</picture>

## FAQ

See [FAQ](https://github.com/srcbookdev/srcbook/blob/main/FAQ.md).

## Getting Started

Peragus runs locally on your machine as a CLI application with a web interface.

### Requirements

- Node 18+, we recommend using [nvm](https://github.com/nvm-sh/nvm) to manage local node versions
- [corepack](https://nodejs.org/api/corepack.html) to manage package manager versions

### Installing

We recommend using npx to always run the latest version from npm

```bash
# Using npm
npx @peragus/peragusapp@latest start

# Using your package manager equivalent
pnpm dlx @peragus/peragusapp@latest start
```

> You can instead use a global install with `<pkg manager> i -g @peragus/peragusapp`
> and then directly call peragusapp with `peragusapp start`

### Using Docker

You can also run Srcbook using Docker:

```bash
# Build the Docker image
docker build -t peragus/peragus-app .

# Run the container
# The -p flag maps port 2150 from the container to your host machine
# First -v flag mounts your local .peragus directory to persist data
# Second -v flag shares your npm cache for better performance
docker run -p 2150:2150 -v ~/.peragus:/root/.peragus -v ~/.npm:/root/.npm peragus/peragus-app
```

Make sure to set up your API key after starting the container. You can do this through the web interface at `http://localhost:2150`.

### Current Commands

```bash
$ peragus -h
Usage: peragus [options] [command]

Peragus is an interactive programming environment for TypeScript with AI assistance

Options:
  -V, --version                 output the version number
  -h, --help                    display help for command

Commands:
  start [options]               Start the Srcbook server
  import [options] <specifier>  Import a Notebook
  help [command]                display help for command
```

### Uninstalling

You can remove Peragus by first removing the package, and then cleaning its local directory on disk:

```bash
rm -rf ~/.peragus

# if you configured a global install
npm uninstall -g @peragus/peragusapp
```

> If you used another package manager, you will need to use its specific uninstall command

## Analytics and tracking

In order to improve Peragus, we collect some behavioral analytics. We don't collect any Personal Identifiable Information (PII), our goals are simply to improve the application. The code is open source so you don't have to trust us, you can verify! You can find more information in our privacy policy.

If you want to disable tracking, you can run Peragus with `PERAGUS_DISABLE_ANALYTICS=true` set in the environment.

## Using Peragus as an MCP Server

Peragus can be configured as an MCP (Model Context Protocol) server for other applications, allowing AI models to access and manipulate TypeScript notebooks. Here's how to set up the Peragus MCP server in your application's MCP configuration:

### Method 1: Using npx (Recommended)

```json
"peragus": {
  "command": "npx",
  "args": [
    "-y",
    "@peragus/peragus-app"
  ],
  "env": {}
}
```

### Method 2: Using Node.js Directly

```json
"peragus-mcp-server": {
  "command": "node",
  "args": ["/path/to/node_modules/@peragus/peragusapp/dist/src/mcp-server/cli.js"],
  "env": {}
}
```

### Method 3: Using Docker

```json
"peragus-mcp-server": {
  "command": "docker",
  "args": [
    "run",
    "-i",
    "--rm",
    "-v", "/path/to/notebooks:/notebooks",
    "peragus/mcp-server:latest"
  ],
  "env": {}
}
```

### Environment Variables and Secrets

Peragus maintains environment variables as secrets that need to be configured through the Peragus UI. These should not be set directly in the client application's MCP config. Important environment variables include:

- `PERAGUS_API_KEY`: Your API key for AI services
- `PERAGUS_NOTEBOOK_DIR`: Directory where notebooks are stored (defaults to `~/.peragus/notebooks`)
- `PERAGUS_SERVER_PORT`: Port for the Peragus server (defaults to 2150)

### Available MCP Tools and Resources

When configured as an MCP server, Peragus provides access to the following:

**Tools:**
- `create_notebook`: Create new TypeScript notebooks
- `edit_notebook`: Add, update, or delete cells
- `execute_notebook`: Run code cells in a notebook
- `list_notebooks`: List available notebooks with filtering
- `get_notebook_content`: Retrieve notebook content
- `save_notebook`: Save changes to a notebook
- `delete_notebook`: Delete notebooks
- `import_notebook`: Import notebooks from files or URLs

**Resources:**
- Example notebooks: `notebook://examples/{id}`
- User notebooks: `notebook://user/{id}`

This allows AI models to create, edit, and execute TypeScript notebooks on behalf of users.

## Acknowledgments

Peragus is based on [Srcbook](https://github.com/srcbookdev/srcbook), an open-source TypeScript-centric app development platform. We'd like to thank the Srcbook team for their excellent work which provided the foundation for this project.

## Contributing

For development instructions, see our CONTRIBUTING.md file.
