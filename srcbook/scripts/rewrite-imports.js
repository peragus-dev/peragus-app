#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

/**
 * Rewrites import statements in compiled JavaScript files to use relative paths 
 * instead of package imports for workspace dependencies
 */
function rewriteImports(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Replace package imports with relative paths
    let newContent = content;
    
    // Replace @peragus/api imports with relative paths
    newContent = newContent.replace(
      /from ['"]@peragus\/api['"]/g,
      'from \'../packages/api/dist/index.mjs\''
    );
    
    // Replace @peragus/shared imports with relative paths
    newContent = newContent.replace(
      /from ['"]@peragus\/shared['"]/g,
      'from \'../packages/shared/dist/index.mjs\''
    );
    
    // Replace other @peragus/* imports if needed
    
    // Write the modified content back to the file
    if (content !== newContent) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`Rewritten imports in ${path.relative(rootDir, filePath)}`);
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

/**
 * Recursively processes all JavaScript files in a directory
 */
function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      processDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      rewriteImports(fullPath);
    }
  }
}

// Main execution
console.log('Rewriting package imports to relative paths...');
processDirectory(distDir);
console.log('Import rewriting complete.');
