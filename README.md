<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/2d5c9dda-044b-49e2-5255-4a0be1085d00/public">
  <source media="(prefers-color-scheme: light)" srcset="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/064ebb1f-5153-4581-badd-42b42272fc00/public">
  <img alt="Srcbook banner" src="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/064ebb1f-5153-4581-badd-42b42272fc00/public">
</picture>

<p align="center">
  <a href="https://badge.fury.io/js/srcbook"><img src="https://badge.fury.io/js/srcbook.svg" alt="npm version" /></a>
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="Apache 2.0 license" /></a>
</p>

<p align="center">
  <a href="https://srcbook.com">Online app builder</a> ·
  <a href="https://discord.gg/shDEGBSe2d">Discord</a> ·
  <a href="https://www.youtube.com/@srcbook">Youtube</a> ·
  <a href="https://hub.srcbook.com">Hub</a> 
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
npx peragus@latest start

# Using your pm equivalent
pnpm dlx peragus@latest start
```

> You can instead use a global install with `<pkg manager> i -g peragus`
> and then directly call peragus with `peragus start`

### Using Docker

You can also run Srcbook using Docker:

```bash
# Build the Docker image
docker build -t peragus .

# Run the container
# The -p flag maps port 2150 from the container to your host machine
# First -v flag mounts your local .peragus directory to persist data
# Second -v flag shares your npm cache for better performance
docker run -p 2150:2150 -v ~/.peragus:/root/.peragus -v ~/.npm:/root/.npm peragus
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
npm uninstall -g peragus
```

> if you used another pm you will need to use it's specific uninstall command

## Analytics and tracking

In order to improve Peragus, we collect some behavioral analytics. We don't collect any Personal Identifiable Information (PII), our goals are simply to improve the application. The code is open source so you don't have to trust us, you can verify! You can find more information in our privacy policy.

If you want to disable tracking, you can run Peragus with `PERAGUS_DISABLE_ANALYTICS=true` set in the environment.

## Contributing

For development instructions, see [CONTRIBUTING.md](https://github.com/srcbookdev/srcbook/blob/main/CONTRIBUTING.md).
