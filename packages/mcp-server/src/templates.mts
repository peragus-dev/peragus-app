/**
 * Notebook templates for creating new notebooks
 */

export interface NotebookTemplate {
  id: string;
  name: string;
  description: string;
  language: 'typescript' | 'javascript';
  cells: Array<{
    type: 'title' | 'markdown' | 'code' | 'package.json';
    text?: string;
    source?: string;
    filename?: string;
  }>;
  tags?: string[];
}

/**
 * Get all available notebook templates
 */
export async function getNotebookTemplates(): Promise<NotebookTemplate[]> {
  return [
    {
      id: 'typescript-basic',
      name: 'TypeScript Basic',
      description: 'Basic TypeScript notebook template with common setup',
      language: 'typescript',
      cells: [
        {
          type: 'title',
          text: 'TypeScript Notebook',
        },
        {
          type: 'markdown',
          source: '# TypeScript Notebook\n\nThis is a basic TypeScript notebook template. You can write and execute TypeScript code in the cells below.\n\n## Getting Started\n\n1. Write your TypeScript code in code cells\n2. Execute cells to see the output\n3. Use markdown cells for documentation',
        },
        {
          type: 'code',
          source: '// Welcome to TypeScript!\nconsole.log(\'Hello, TypeScript!\');\n\n// Define a simple function\nfunction greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n\n// Use the function\nconst message = greet(\'World\');\nconsole.log(message);',
          filename: 'hello.ts',
        },
      ],
      tags: ['typescript', 'basic', 'template'],
    },
    {
      id: 'typescript-data-analysis',
      name: 'Data Analysis',
      description: 'Template for data analysis with TypeScript',
      language: 'typescript',
      cells: [
        {
          type: 'title',
          text: 'Data Analysis Notebook',
        },
        {
          type: 'markdown',
          source: '# Data Analysis with TypeScript\n\nThis notebook template provides a starting point for data analysis using TypeScript.\n\n## Features\n\n- File system operations\n- JSON data processing\n- Basic statistical functions\n- Data visualization helpers',
        },
        {
          type: 'code',
          source: '// Import Node.js modules for data processing\nimport * as fs from \'fs\';\nimport * as path from \'path\';\n\n// Helper function to read JSON data\nfunction readJsonData(filePath: string): any {\n  try {\n    const data = fs.readFileSync(filePath, \'utf8\');\n    return JSON.parse(data);\n  } catch (error) {\n    console.error(\'Error reading JSON file:\', error);\n    return null;\n  }\n}\n\nconsole.log(\'Data analysis utilities loaded!\');',
          filename: 'data-utils.ts',
        },
        {
          type: 'code',
          source: '// Sample data processing\nconst sampleData = [\n  { name: \'Alice\', age: 30, score: 85 },\n  { name: \'Bob\', age: 25, score: 92 },\n  { name: \'Charlie\', age: 35, score: 78 },\n  { name: \'Diana\', age: 28, score: 96 }\n];\n\n// Calculate average score\nconst averageScore = sampleData.reduce((sum, person) => sum + person.score, 0) / sampleData.length;\nconsole.log(`Average score: ${averageScore}`);\n\n// Find highest scorer\nconst topScorer = sampleData.reduce((prev, current) => \n  prev.score > current.score ? prev : current\n);\nconsole.log(`Top scorer: ${topScorer.name} with ${topScorer.score} points`);',
          filename: 'analysis.ts',
        },
      ],
      tags: ['typescript', 'data-analysis', 'template'],
    },
    {
      id: 'javascript-basic',
      name: 'JavaScript Basic',
      description: 'Basic JavaScript notebook template',
      language: 'javascript',
      cells: [
        {
          type: 'title',
          text: 'JavaScript Notebook',
        },
        {
          type: 'markdown',
          source: '# JavaScript Notebook\n\nThis is a basic JavaScript notebook template. Perfect for quick prototyping and experimentation.\n\n## Features\n\n- Modern JavaScript (ES6+)\n- Node.js environment\n- Console output\n- Easy experimentation',
        },
        {
          type: 'code',
          source: '// Welcome to JavaScript!\nconsole.log(\'Hello, JavaScript!\');\n\n// Modern JavaScript features\nconst greet = (name) => `Hello, ${name}!`;\n\n// Array methods\nconst numbers = [1, 2, 3, 4, 5];\nconst doubled = numbers.map(n => n * 2);\nconst sum = numbers.reduce((acc, n) => acc + n, 0);\n\nconsole.log(\'Doubled:\', doubled);\nconsole.log(\'Sum:\', sum);',
          filename: 'hello.js',
        },
      ],
      tags: ['javascript', 'basic', 'template'],
    },
    {
      id: 'typescript-web-scraping',
      name: 'Web Scraping',
      description: 'Template for web scraping and API interactions',
      language: 'typescript',
      cells: [
        {
          type: 'title',
          text: 'Web Scraping & API Notebook',
        },
        {
          type: 'markdown',
          source: '# Web Scraping & API Integration\n\nThis notebook provides tools and examples for web scraping and API interactions using TypeScript.\n\n## What you\'ll learn\n\n- Making HTTP requests\n- Parsing HTML content\n- Working with APIs\n- Data extraction techniques',
        },
        {
          type: 'code',
          source: '// HTTP client setup\ninterface ApiResponse {\n  status: number;\n  data: any;\n}\n\n// Simple fetch wrapper\nasync function fetchData(url: string): Promise<ApiResponse> {\n  try {\n    const response = await fetch(url);\n    const data = await response.json();\n    return {\n      status: response.status,\n      data: data\n    };\n  } catch (error) {\n    console.error(\'Fetch error:\', error);\n    throw error;\n  }\n}\n\nconsole.log(\'Web scraping utilities loaded!\');',
          filename: 'web-utils.ts',
        },
      ],
      tags: ['typescript', 'web-scraping', 'api', 'template'],
    },
    {
      id: 'typescript-testing',
      name: 'Testing & TDD',
      description: 'Template for test-driven development with TypeScript',
      language: 'typescript',
      cells: [
        {
          type: 'title',
          text: 'Testing & TDD Notebook',
        },
        {
          type: 'markdown',
          source: '# Test-Driven Development with TypeScript\n\nThis notebook demonstrates test-driven development practices using TypeScript.\n\n## TDD Cycle\n\n1. **Red**: Write a failing test\n2. **Green**: Write minimal code to pass\n3. **Refactor**: Improve the code while keeping tests green',
        },
        {
          type: 'code',
          source: '// Simple testing framework\nclass TestRunner {\n  private tests: Array<{ name: string; fn: () => void }> = [];\n  \n  test(name: string, fn: () => void) {\n    this.tests.push({ name, fn });\n  }\n  \n  run() {\n    console.log(`Running ${this.tests.length} tests...\\n`);\n    \n    let passed = 0;\n    let failed = 0;\n    \n    for (const test of this.tests) {\n      try {\n        test.fn();\n        console.log(`✅ ${test.name}`);\n        passed++;\n      } catch (error) {\n        console.log(`❌ ${test.name}: ${error.message}`);\n        failed++;\n      }\n    }\n    \n    console.log(`\\nResults: ${passed} passed, ${failed} failed`);\n  }\n}\n\n// Assertion helpers\nfunction assertEquals(actual: any, expected: any, message?: string) {\n  if (actual !== expected) {\n    throw new Error(message || `Expected ${expected}, got ${actual}`);\n  }\n}\n\nfunction assertTrue(condition: boolean, message?: string) {\n  if (!condition) {\n    throw new Error(message || \'Assertion failed\');\n  }\n}\n\nconst runner = new TestRunner();\nconsole.log(\'Testing framework loaded!\');',
          filename: 'test-framework.ts',
        },
      ],
      tags: ['typescript', 'testing', 'tdd', 'template'],
    },
  ];
}

/**
 * Get a specific template by ID
 */
export async function getNotebookTemplate(templateId: string): Promise<NotebookTemplate | undefined> {
  const templates = await getNotebookTemplates();
  return templates.find(template => template.id === templateId);
}

/**
 * Create a new notebook from a template
 */
export async function createNotebookFromTemplate(
  templateId: string,
  title?: string
): Promise<NotebookTemplate | null> {
  const template = await getNotebookTemplate(templateId);
  
  if (!template) {
    return null;
  }
  
  // Clone the template and customize
  const notebook: NotebookTemplate = {
    ...template,
    id: `${template.id}-${Date.now()}`, // Generate unique ID
    name: title || template.name,
  };
  
  // Update title cell if custom title provided
  if (title && notebook.cells[0]?.type === 'title') {
    notebook.cells[0].text = title;
  }
  
  return notebook;
}