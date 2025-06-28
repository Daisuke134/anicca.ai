#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const cliPath = path.join(__dirname, '..', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');

// Check if cli.js exists
if (fs.existsSync(cliPath)) {
  const content = fs.readFileSync(cliPath, 'utf8');
  
  // Check if it starts with shebang
  if (content.startsWith('#!/usr/bin/env')) {
    // Remove the first line
    const lines = content.split('\n');
    lines.shift(); // Remove first line
    
    // Write back
    fs.writeFileSync(cliPath, lines.join('\n'));
    console.log('✅ Fixed Claude SDK cli.js shebang for Electron compatibility');
  } else {
    console.log('✅ Claude SDK cli.js already fixed');
  }
} else {
  console.log('⚠️ Claude SDK cli.js not found - skipping fix');
}