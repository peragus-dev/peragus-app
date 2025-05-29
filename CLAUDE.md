# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Peragus is a TypeScript notebook platform with AI assistance, forked from the open-source Srcbook project. It provides an interactive environment for writing and executing TypeScript code with AI-powered code generation and exploration capabilities.

## Development Commands

### Essential Commands
```bash
# Install dependencies
pnpm install

# Start development servers (web + API)
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format

# Database migrations
pnpm generate  # Generate new migrations
pnpm migrate   # Run migrations
```

### Running Individual Tests
```bash
# Run tests for a specific package
pnpm -F @peragus/api test
pnpm -F @peragus/web test

# Run integration tests
pnpm -F @peragus/integration-tests test
```

## Architecture Overview

### Monorepo Structure
This is a pnpm workspace monorepo using Turborepo for orchestration. Key packages:

- **`/srcbook`** - CLI application for running Peragus as a standalone app
- **`/packages/api`** - Express backend with WebSocket support, handles code execution and AI integrations
- **`/packages/web`** - React frontend built with Vite, provides the notebook interface
- **`/packages/shared`** - Shared types and utilities used across packages
- **`/packages/mcp-server`** - Model Context Protocol server for AI tool integrations
- **`/packages/components`** - Reusable React components
- **`/packages/security`** - Authentication, rate limiting, and validation middleware

### Key Architectural Patterns

1. **TypeScript Notebooks**: Core abstraction - notebooks contain cells that can be markdown or TypeScript code
2. **Real-time Communication**: WebSocket channels for live code execution updates
3. **AI Integration**: Supports multiple providers (Anthropic, OpenAI, Google) through AI SDK
4. **Local Database**: SQLite database at `~/.peragus/srcbook.db` using Drizzle ORM
5. **MCP Support**: Can function as an MCP server for integration with AI assistants

### Technology Stack
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, CodeMirror
- **Backend**: Node.js, Express, WebSocket, Drizzle ORM, SQLite3
- **Build**: Turborepo, pnpm workspaces, TypeScript 5.6.2
- **AI**: AI SDK with multiple provider support

### Important Context
- Currently on `feature/npm-publishing` branch - package names are being migrated from `@srcbook` to `@peragus`
- The application runs on ports: Web (5173), API (2150)
- Requires Node.js 18+ and pnpm 9.5+
- Uses changesets for release automation
- Analytics can be disabled with `PERAGUS_DISABLE_ANALYTICS=true`