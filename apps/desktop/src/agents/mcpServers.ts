import { MCPServerStdio, getAllMcpTools, withTrace } from '@openai/agents';
import type { Tool } from '@openai/agents';
import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
const log = require('electron-log/main');

function resolveFilesystemServerCli(): string {
  const pkgJsonPath = require.resolve('@modelcontextprotocol/server-filesystem/package.json');
  const pkg = require(pkgJsonPath);
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0];
  return path.join(path.dirname(pkgJsonPath), binRel);
}

function resolveTaskqueueServerCli(): string {
  const appRoot = app.getAppPath();
  const packagedPath = path.join(appRoot, 'resources', 'taskqueue-mcp', 'dist', 'src', 'server', 'index.js');

  if (fs.existsSync(packagedPath)) {
    return packagedPath;
  }

  // 開発時（ts-node 実行）などで resources ディレクトリがそのまま存在するケースをカバー
  return path.join(__dirname, '..', '..', 'resources', 'taskqueue-mcp', 'dist', 'src', 'server', 'index.js');
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

  try {
    const taskqueueDataDir = path.join(app.getPath('userData'), 'taskqueue');
    fs.mkdirSync(taskqueueDataDir, { recursive: true });

    const taskqueueServer = new MCPServerStdio({
      name: 'taskqueue-mcp',
      command: process.execPath,
      args: [resolveTaskqueueServerCli()],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        TASK_MANAGER_FILE_PATH: path.join(taskqueueDataDir, 'tasks.json'),
      },
    });

    servers.push(taskqueueServer);
  } catch (error) {
    log.error('❌ Failed to initialize taskqueue-mcp:', error);
  }

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
