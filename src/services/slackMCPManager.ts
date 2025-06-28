import * as fs from 'fs';
import * as path from 'path';
import { SlackOAuthServer } from './slackOAuthServer';
import { spawn } from 'child_process';

export class SlackMCPManager {
  private configPath: string;
  private oauthServer: SlackOAuthServer;

  constructor() {
    // Validate environment variables
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      throw new Error('Cannot determine home directory: HOME or USERPROFILE environment variable not set');
    }
    
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Missing required environment variables: SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be set');
    }
    
    this.configPath = path.join(homeDir, '.anicca', 'mcp-config.json');
    this.oauthServer = new SlackOAuthServer(clientId, clientSecret);
  }

  /**
   * Slack MCPサーバーが設定されているか確認
   */
  async isConfigured(): Promise<boolean> {
    const token = await this.oauthServer.getStoredToken();
    return token !== null;
  }

  /**
   * MCP設定ファイルを更新
   */
  async updateMCPConfig(): Promise<void> {
    const token = await this.oauthServer.getStoredToken();
    if (!token) {
      throw new Error('No Slack token found');
    }

    // MCP設定を作成
    const mcpConfig = {
      mcpServers: {
        slack: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-slack"],
          env: {
            SLACK_BOT_TOKEN: token
          }
        }
      }
    };

    // 設定ディレクトリを作成
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 設定ファイルに書き込み
    fs.writeFileSync(this.configPath, JSON.stringify(mcpConfig, null, 2));
    console.log('✅ MCP configuration updated');
  }

  /**
   * Slack MCPサーバーをテスト
   */
  async testSlackMCP(): Promise<boolean> {
    try {
      console.log('🧪 Testing Slack MCP...');
      
      // MCPサーバーを起動してチャンネル一覧を取得
      const child = spawn('npx', [
        '-y',
        '@modelcontextprotocol/server-slack',
        'list-channels'
      ], {
        env: {
          ...process.env,
          SLACK_BOT_TOKEN: await this.oauthServer.getStoredToken() || ''
        }
      });

      return new Promise((resolve) => {
        let output = '';
        
        child.stdout.on('data', (data) => {
          output += data.toString();
        });

        child.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Slack MCP is working!');
            resolve(true);
          } else {
            console.error('❌ Slack MCP test failed');
            resolve(false);
          }
        });

        // タイムアウト
        setTimeout(() => {
          child.kill();
          resolve(false);
        }, 10000);
      });
    } catch (error) {
      console.error('❌ Slack MCP test error:', error);
      return false;
    }
  }

  /**
   * Claude SDKがSlack MCPを使えるようにする
   */
  async enableForClaudeSDK(): Promise<void> {
    await this.updateMCPConfig();
    
    // Claude SDKのMCP設定パスを取得
    let claudeMCPPath: string;
    
    if (process.platform === 'darwin') {
      // macOS
      claudeMCPPath = path.join(
        process.env.HOME || '',
        'Library',
        'Application Support',
        'Claude',
        'claude_desktop_config.json'
      );
    } else if (process.platform === 'win32') {
      // Windows
      claudeMCPPath = path.join(
        process.env.APPDATA || '',
        'Claude',
        'claude_desktop_config.json'
      );
    } else {
      // Linux
      claudeMCPPath = path.join(
        process.env.HOME || '',
        '.config',
        'Claude',
        'claude_desktop_config.json'
      );
    }

    if (fs.existsSync(claudeMCPPath)) {
      // 既存の設定を読み込み
      const claudeConfig = JSON.parse(fs.readFileSync(claudeMCPPath, 'utf-8'));
      
      // Slack MCPを追加
      if (!claudeConfig.mcpServers) {
        claudeConfig.mcpServers = {};
      }

      const token = await this.oauthServer.getStoredToken();
      claudeConfig.mcpServers.slack = {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-slack"],
        env: {
          SLACK_BOT_TOKEN: token
        }
      };

      // 設定を保存
      fs.writeFileSync(claudeMCPPath, JSON.stringify(claudeConfig, null, 2));
      console.log('✅ Claude SDK MCP configuration updated');
    }
  }
}