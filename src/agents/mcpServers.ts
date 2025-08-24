import { MCPServerStdio, getAllMcpTools, withTrace } from '@openai/agents';
import type { Tool } from '@openai/agents';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import fetch from 'node-fetch';


export async function initializeMCPServers(userId?: string | null) {
  // 型を明示的に指定
  const servers: MCPServerStdio[] = [];
  
  // Google Calendar MCP（ローカル実装）
  const aniccaDir = path.join(os.homedir(), '.anicca');
  // ユーザー別ディレクトリを使用（userIdがある場合）
  const userDir = userId ? path.join(aniccaDir, 'users', userId) : aniccaDir;
  const credentialsPath = path.join(userDir, 'google-credentials.json');
  
  // 初回起動時：credentials.jsonを自動作成（Railwayから取得）
  if (!fs.existsSync(credentialsPath)) {
    try {
      const PROXY_URL = process.env.RAILWAY_URL || 'https://anicca-proxy-staging.up.railway.app';
      const response = await fetch(`${PROXY_URL}/api/gcal/credentials`);
      
      if (response.ok) {
        const credentials = await response.json();
        
        // ユーザー別ディレクトリ作成
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }
        
        // credentials.json作成（MCPが期待する形式）
        const credentialsData = {
          installed: {
            client_id: credentials.client_id,
            client_secret: credentials.client_secret,
            redirect_uris: ["http://localhost:3000/oauth2callback"]
          }
        };
        
        fs.writeFileSync(credentialsPath, JSON.stringify(credentialsData, null, 2));
        console.log('✅ Google credentials file created automatically');
      } else {
        console.warn('⚠️ Failed to fetch Google credentials from Railway');
      }
    } catch (error) {
      console.warn('⚠️ Failed to create Google credentials:', error);
    }
  }
  
  // トークンファイルのパスを確認
  const tokenPath = userId 
    ? path.join(userDir, '.config', 'google-calendar-mcp', 'tokens.json')
    : path.join(os.homedir(), '.config', 'google-calendar-mcp', 'tokens.json');

  // Google Calendar MCP（トークンがある場合のみ自動初期化）
  if (fs.existsSync(credentialsPath) && fs.existsSync(tokenPath)) {
    // ユーザー別のトークン保存環境を準備
    const mcpEnv: Record<string, string> = {
      // MCPにcredentials.jsonのパスを教える
      GOOGLE_OAUTH_CREDENTIALS: credentialsPath
    };
    
    // userIdがある場合、専用のconfig directoryを使用
    if (userId) {
      const userConfigDir = path.join(userDir, '.config');
      mcpEnv.XDG_CONFIG_HOME = userConfigDir;
    }
    
    const gcalServer = new MCPServerStdio({
      fullCommand: 'npx -y @cocal/google-calendar-mcp',
      name: 'Google Calendar',
      env: mcpEnv,
      timeout: 30000,
    });
    servers.push(gcalServer);
    console.log('📅 Google Calendar MCP loaded (using existing token)');
  } else if (fs.existsSync(credentialsPath)) {
    console.log('⏸️ Google Calendar MCP skipped (no token yet)');
  } else {
    console.log('⚠️ Google Calendar MCP disabled (no credentials)');
  }

  // 各サーバーに接続
  for (const server of servers) {
    try {
      await server.connect();
      console.log(`✅ Connected to ${server.name}`);
    } catch (error) {
      console.error(`❌ Failed to connect to ${server.name}:`, error);
      // エラーの詳細を出力
      if (error instanceof Error) {
        console.error(`   Error message: ${error.message}`);
      }
    }
  }

  return servers;
}

// Google Calendar MCPをオンデマンドで初期化
export let googleCalendarServer: MCPServerStdio | null = null;

export async function connectGoogleCalendar(userId?: string | null): Promise<boolean> {
  // 既に接続済み
  if (googleCalendarServer) {
    console.log('📅 Google Calendar already connected');
    return true;
  }

  const aniccaDir = path.join(os.homedir(), '.anicca');
  const userDir = userId ? path.join(aniccaDir, 'users', userId) : aniccaDir;
  const credentialsPath = path.join(userDir, 'google-credentials.json');
  
  // credentials.jsonがなければRailwayから取得
  if (!fs.existsSync(credentialsPath)) {
    try {
      const PROXY_URL = process.env.RAILWAY_URL || 'https://anicca-proxy-staging.up.railway.app';
      const response = await fetch(`${PROXY_URL}/api/gcal/credentials`);
      
      if (response.ok) {
        const credentials = await response.json();
        
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }
        
        const credentialsData = {
          installed: {
            client_id: credentials.client_id,
            client_secret: credentials.client_secret,
            redirect_uris: ["http://localhost:3000/oauth2callback"]
          }
        };
        
        fs.writeFileSync(credentialsPath, JSON.stringify(credentialsData, null, 2));
        console.log('✅ Google credentials file created');
      }
    } catch (error) {
      console.warn('⚠️ Failed to create Google credentials:', error);
      return false;
    }
  }
  
  if (fs.existsSync(credentialsPath)) {
    const mcpEnv: Record<string, string> = {
      GOOGLE_OAUTH_CREDENTIALS: credentialsPath
    };
    
    if (userId) {
      const userConfigDir = path.join(userDir, '.config');
      mcpEnv.XDG_CONFIG_HOME = userConfigDir;
    }
    
    googleCalendarServer = new MCPServerStdio({
      fullCommand: 'npx -y @cocal/google-calendar-mcp',
      name: 'Google Calendar',
      env: mcpEnv,
      timeout: 30000,
    });
    
    await googleCalendarServer.connect();
    console.log('✅ Google Calendar MCP connected');
    return true;
  }
  
  return false;
}

export async function getMCPTools(userId?: string | null): Promise<Tool[]> {
  const servers = await initializeMCPServers(userId);
  
  if (servers.length === 0) {
    console.warn('No MCP servers available');
    return [];
  }

  try {
    // withTraceでラップしてMCPツールを取得
    const allMcpTools = await withTrace('getMCPTools', async () => {
      return await getAllMcpTools({
        mcpServers: servers,
        convertSchemasToStrict: true
      });
    });
    
    console.log(`📦 Loaded ${allMcpTools.length} MCP tools from ${servers.length} servers`);
    allMcpTools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.type === 'function' ? tool.description : 'No description'}`);
    });
    
    return allMcpTools;
  } catch (error) {
    console.error('Failed to get MCP tools:', error);
    return [];
  }
}