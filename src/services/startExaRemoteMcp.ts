#!/usr/bin/env node

import { startExaRemoteMCPServer } from './exaRemoteMcpServer.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DEFAULT_PORT = 3456;

async function main() {
  const port = parseInt(process.env.EXA_MCP_PORT || String(DEFAULT_PORT));
  const apiKey = process.env.EXA_API_KEY;

  if (!apiKey) {
    console.error('❌ EXA_API_KEY environment variable is required');
    console.error('Please set it in your .env file or environment');
    process.exit(1);
  }

  console.log('🚀 Starting Exa Remote MCP Server...');
  console.log(`📍 Port: ${port}`);
  
  try {
    const server = await startExaRemoteMCPServer(port, apiKey);
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n⏹️  Shutting down server...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n⏹️  Shutting down server...');
      await server.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
main().catch(console.error);