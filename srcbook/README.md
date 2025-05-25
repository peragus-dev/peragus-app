![Peragus banner](image-23.jpg)

<p align="center">
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="Apache 2.0 license" /></a>
</p>

<p align="center">
  <a href="https://hub.srcbook.com">Examples</a> ·
  <a href="https://discord.gg/shDEGBSe2d">Discord</a> ·
  <a href="https://www.youtube.com/@srcbook">Youtube</a>
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

![example notebook](image-23.jpg)

## FAQ

See our [GitHub repository](https://github.com/peragus-dev/peragus-app) for frequently asked questions.

## Getting Started

Peragus runs locally on your machine as a CLI application with a web interface.

### Requirements

- Node 18+, we recommend using [nvm](https://github.com/nvm-sh/nvm) to manage local node versions
- [corepack](https://nodejs.org/api/corepack.html) to manage package manager versions

### Installation

We recommend using npx to always run the latest version from npm:

```bash
# Using npm
npx @peragus/peragus-app@latest start

# Using your package manager equivalent
pnpm dlx @peragus/peragus-app@latest start
```

You can also install Peragus globally:

```bash
# Using npm
npm install -g @peragus/peragus-app

# Then run it using
peragus-app start
```

### MCP Server Integration

Peragus can also be used as an MCP (Model Context Protocol) server, allowing AI models to access and manipulate TypeScript notebooks.

#### Using npx (Recommended)

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

#### Using Node.js Directly (if installed locally)

```json
"peragus-mcp-server": {
  "command": "node",
  "args": ["/path/to/node_modules/@peragus/peragus-app/dist/src/mcp-server/cli.js"],
  "env": {}
}
```

For more details, check our [GitHub repository](https://github.com/peragus-dev/peragus-app).

### Docker Support

You can also run Peragus using Docker:

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

### Commands

```bash
$ peragus -h
Usage: peragus [options] [command]

Peragus is an interactive programming environment for TypeScript with AI assistance

Options:
  -V, --version                 output the version number
  -h, --help                    display help for command

Commands:
  start [options]               Start the Peragus server
  import [options] <specifier>  Import a Notebook
  help [command]                display help for command
```

### Uninstalling

You can remove Peragus by first removing the package, and then cleaning its local directory on disk:

```bash
rm -rf ~/.peragus

# if you configured a global install
npm uninstall -g @peragus/peragus-app
```

## Analytics and tracking

In order to improve Peragus, we collect some behavioral analytics. We don't collect any Personal Identifiable Information (PII), our goals are simply to improve the application. The code is open source so you don't have to trust us, you can verify!

If you want to disable tracking, you can run Peragus with `PERAGUS_DISABLE_ANALYTICS=true` set in the environment.

## Contributing

For development instructions, see our [GitHub repository](https://github.com/peragus-dev/peragus-app). We welcome contributions!

## Acknowledgments

Peragus is based on [Srcbook](https://github.com/srcbookdev/srcbook), an open-source TypeScript-centric app development platform. We'd like to thank the Srcbook team for their excellent work which provided the foundation for this project.
