#!/usr/bin/env node

import { spawn } from 'child_process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

class MCPTestClient {
  constructor() {
    this.requestId = 1;
    this.process = null;
    this.buffer = '';
  }

  async start() {
    console.log('🚀 Starting MCP server with stdio transport...\n');
    this.process = spawn('node', ['dist/cli.mjs'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr.on('data', (data) => {
      const msg = data.toString();
      if (!msg.includes('[INFO]')) {
        console.error('Server error:', msg);
      }
    });

    // Wait for server to start
    await sleep(1000);
  }

  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim() && line.startsWith('{')) {
        try {
          const response = JSON.parse(line);
          this.handleResponse(response);
        } catch (e) {
          // Not JSON, ignore
        }
      }
    }
  }

  handleResponse(response) {
    if (response.result) {
      this.pendingResolve?.(response.result);
    } else if (response.error) {
      this.pendingReject?.(response.error);
    }
  }

  async sendRequest(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++
    };

    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      
      this.process.stdin.write(JSON.stringify(request) + '\n');
      
      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Request timeout')), 5000);
    });
  }

  async stop() {
    if (this.process) {
      this.process.kill();
      await sleep(100);
    }
  }
}

async function runFunctionalTests() {
  const client = new MCPTestClient();
  let notebookId = null;

  try {
    await client.start();

    // 1. Initialize
    console.log('1️⃣  Initializing MCP connection...');
    const initResult = await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    console.log('✅ Initialized:', initResult.serverInfo);
    console.log();

    // 2. List available tools
    console.log('2️⃣  Listing available tools...');
    const toolsResult = await client.sendRequest('tools/list');
    console.log(`✅ Found ${toolsResult.tools.length} tools:`);
    toolsResult.tools.forEach(t => console.log(`   - ${t.name}`));
    console.log();

    // 3. Create a notebook
    console.log('3️⃣  Creating a TypeScript notebook...');
    const createResult = await client.sendRequest('tools/call', {
      name: 'create_notebook',
      arguments: {
        title: 'MCP Functional Test Notebook',
        language: 'typescript'
      }
    });
    const createData = JSON.parse(createResult.content[0].text);
    notebookId = createData.data.notebookId;
    console.log('✅ Created notebook:', notebookId);
    console.log();

    // 4. Add cells to notebook
    console.log('4️⃣  Adding cells to notebook...');
    
    // First, get the current notebook structure to understand existing cells
    const initialNb = await client.sendRequest('tools/call', {
      name: 'get_notebook',
      arguments: { notebookId }
    });
    const initialData = JSON.parse(initialNb.content[0].text);
    const initialCellCount = initialData.data.cells.length;
    console.log(`📋 Initial notebook has ${initialCellCount} cells`);
    
    // Add markdown cell at the end
    await client.sendRequest('tools/call', {
      name: 'update_notebook',
      arguments: {
        notebookId,
        operation: 'add_cell',
        cellType: 'markdown',
        content: '## Functional Test\n\nThis notebook tests MCP functionality.',
        cellIndex: initialCellCount  // Add at the end
      }
    });
    console.log('✅ Added markdown cell');

    // Add code cell at the end
    await client.sendRequest('tools/call', {
      name: 'update_notebook',
      arguments: {
        notebookId,
        operation: 'add_cell',
        cellType: 'code',
        content: 'const greeting = "Hello from MCP!";\nconsole.log(greeting);\ngreeting;',
        cellIndex: initialCellCount + 1  // Add after the markdown cell
      }
    });
    console.log('✅ Added code cell');
    console.log();

    // 5. First get notebook to see cell structure
    console.log('5️⃣  Getting notebook structure...');
    const nbResult = await client.sendRequest('tools/call', {
      name: 'get_notebook',
      arguments: { notebookId }
    });
    const nbData = JSON.parse(nbResult.content[0].text);
    console.log('📋 Notebook cells:');
    nbData.data.cells.forEach((cell, idx) => {
      console.log(`   [${idx}] ${cell.type}: ${cell.filename || 'no filename'}`);
    });
    
    // Find the code cell index - look for code cells that aren't package.json
    const codeCellIndex = nbData.data.cells.findIndex(c => 
      c.type === 'code' && 
      (!c.filename || (c.filename !== 'package.json' && !c.filename.endsWith('.json')))
    );
    console.log(`📍 Code cell is at index: ${codeCellIndex}`);
    
    // Execute the code cell
    console.log('⚡ Executing code cell...');
    const execResult = await client.sendRequest('tools/call', {
      name: 'execute_notebook_cell',
      arguments: {
        notebookId,
        cellIndex: codeCellIndex
      }
    });
    const execData = JSON.parse(execResult.content[0].text);
    console.log('✅ Execution result:', execData);
    console.log();

    // 6. Search notebooks
    console.log('6️⃣  Searching notebooks...');
    const searchResult = await client.sendRequest('tools/call', {
      name: 'search_notebooks',
      arguments: {
        query: 'functional test',
        includeContent: true
      }
    });
    const searchData = JSON.parse(searchResult.content[0].text);
    console.log('✅ Search found:', searchData.data.results.length, 'notebooks');
    console.log();

    // 7. Get notebook content
    console.log('7️⃣  Getting notebook content...');
    const getResult = await client.sendRequest('tools/call', {
      name: 'get_notebook',
      arguments: { notebookId }
    });
    const notebookData = JSON.parse(getResult.content[0].text);
    console.log('✅ Notebook has', notebookData.data.cells.length, 'cells');
    console.log();

    // 8. List resources
    console.log('8️⃣  Listing resources...');
    const resourcesResult = await client.sendRequest('resources/list');
    console.log(`✅ Found ${resourcesResult.resources.length} resources`);
    console.log();

    // 9. Delete the test notebook
    console.log('9️⃣  Cleaning up - deleting test notebook...');
    const deleteResult = await client.sendRequest('tools/call', {
      name: 'delete_notebook',
      arguments: {
        notebookId,
        confirm: true
      }
    });
    console.log('✅ Deleted notebook');
    console.log();

    console.log('🎉 All functional tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await client.stop();
  }
}

// Run the tests
runFunctionalTests().catch(console.error);