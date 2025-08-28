import { MCPServerStdio, getAllMcpTools, withTrace } from '@openai/agents';
import type { Tool } from '@openai/agents';
import path from 'path';
import os from 'os';
const log = require('electron-log/main');

function resolveFilesystemServerCli(): string {
  const pkgJsonPath = require.resolve('@modelcontextprotocol/server-filesystem/package.json');
  const pkg = require(pkgJsonPath);
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0];
  return path.join(path.dirname(pkgJsonPath), binRel);
}

export async function initializeMCPServers(userId?: string | null) {
  const servers: MCPServerStdio[] = [];

  const allowedRoot = path.join(os.homedir(), '.anicca');
  const cliPath = resolveFilesystemServerCli();

  const filesystemServer = new MCPServerStdio({
    name: 'filesystem-mcp',
    command: process.execPath,
    args: [cliPath, allowedRoot],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
  });

  servers.push(filesystemServer);

  for (const server of servers) {
    try {
      await server.connect();
      log.info(`✅ Connected to ${server.name}`);
    } catch (error) {
      log.error(`❌ Failed to connect to ${server.name}:`, error);
    }
  }

  return servers;
}

export async function getMCPTools(userId?: string | null): Promise<Tool[]> {
  const servers = await initializeMCPServers(userId);

  if (servers.length === 0) {
    log.warn('No MCP servers available');
    return [];
  }

  try {
    const allMcpTools = await withTrace('getMCPTools', async () => {
      return await getAllMcpTools({
        mcpServers: servers,
        convertSchemasToStrict: true,
      });
    });

    log.info(`📦 Loaded ${allMcpTools.length} MCP tools from ${servers.length} servers`);
    return allMcpTools;
  } catch (error) {
    log.error('Failed to get MCP tools:', error);
    return [];
  }
}
