# Peragus Example Notebooks

This directory contains example notebooks demonstrating various capabilities of the Peragus TypeScript notebook platform. These examples serve as both learning resources for users and can be leveraged as resources when using Peragus as an MCP (Model Context Protocol) server.

## Using Examples with MCP

When Peragus is used as an MCP server, these example notebooks can be exposed as resources that models can access and reference. This allows models to:

1. **Learn from examples**: Models can study implementation patterns and techniques
2. **Adapt code snippets**: Models can modify existing examples to fit specific use cases
3. **Reference for troubleshooting**: Models can use these examples to help users debug similar issues

## Categories of Examples

### Data & API Integration

| Example | Description |
|---------|-------------|
| [Connecting to Postgres](./connecting-to-postgres.src.md) | Demonstrates database connection, queries, and data manipulation with PostgreSQL |
| [Contributions from GitHub API](./contributions-from-github-api.src.md) | Shows how to use the GitHub API to fetch contributor statistics |
| [Read/Write AWS S3](./read-write-aws-s3.src.md) | Examples of reading from and writing to AWS S3 buckets |
| [Pinata SDK 101](./pinata-sdk-101.src.md) | Introduction to using the Pinata SDK for IPFS interactions |

### Visualization & Diagramming

| Example | Description |
|---------|-------------|
| [Diagramming Srcbook Architecture](./diagramming-srcbook-architecture.src.md) | Shows how to create architecture diagrams using Mermaid |
| [HN Screenshots](./hn-screenshots.src.md) | Demonstrates taking and manipulating screenshots from Hacker News |

### Networking & System Tools

| Example | Description |
|---------|-------------|
| [Port Check](./port-check.src.md) | Utility to check if specific ports are open on a server |
| [Web Scraping with Puppeteer](./web-scraping-with-puppeteer.src.md) | Tutorial on web scraping using Puppeteer |

### AI & ML Integration

| Example | Description |
|---------|-------------|
| [OpenAI Structured Outputs](./openai-structured-outputs.src.md) | How to work with structured outputs from OpenAI models |
| [Parea AI Evals 101](./parea-ai-evals-101.src.md) | Introduction to evaluating AI models using Parea |
| [Traceloop 101](./traceloop-101.src.md) | Getting started with Traceloop for LLM observability |

### Security & Cryptography

| Example | Description |
|---------|-------------|
| [Generating Random IDs](./generating-random-ids.src.md) | Different methods for generating secure random identifiers |
| [Shamir Secret Sharing](./shamir-secret-sharing.src.md) | Implementation of Shamir's Secret Sharing scheme for secure key distribution |

## Contributing New Examples

To contribute a new example:

1. Create a new `.src.md` file in this directory
2. Follow the format of existing examples with:
   - A clear title and description
   - Code cells with well-commented TypeScript
   - Markdown explanations between code cells
   - Expected outputs where applicable
3. Add your example to the appropriate category in this README
4. Submit a pull request with your changes

## Running Examples

All examples can be run directly in the Peragus notebook environment. To run an example:

1. Open the example in Peragus
2. Execute code cells in order (some examples may require API keys or specific setup)
3. Modify the code to experiment with different parameters or approaches

## Resources and Dependencies

Some examples may require external dependencies or API keys. Each example should document its specific requirements at the beginning of the notebook.
