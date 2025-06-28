import express from 'express';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { SimpleEncryption } from './simpleEncryption';

interface SlackOAuthResponse {
  ok: boolean;
  access_token?: string;
  team?: {
    id: string;
    name: string;
  };
  error?: string;
}

export class SlackOAuthServer {
  private app: express.Application;
  private server: any;
  private encryptionService: SimpleEncryption;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string = 'http://localhost:3000/callback';
  private resolveAuth: ((token: string) => void) | null = null;
  private rejectAuth: ((error: Error) => void) | null = null;

  constructor(clientId: string, clientSecret: string) {
    this.app = express();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.encryptionService = new SimpleEncryption();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // OAuth callback route
    this.app.get('/callback', async (req, res) => {
      const { code, error } = req.query;

      if (error) {
        res.send(`
          <html>
            <body>
              <h2>認証エラー</h2>
              <p>${error}</p>
              <script>setTimeout(() => window.close(), 3000);</script>
            </body>
          </html>
        `);
        if (this.rejectAuth) {
          this.rejectAuth(new Error(error as string));
        }
        return;
      }

      if (!code) {
        res.send(`
          <html>
            <body>
              <h2>エラー</h2>
              <p>認証コードが見つかりません</p>
              <script>setTimeout(() => window.close(), 3000);</script>
            </body>
          </html>
        `);
        if (this.rejectAuth) {
          this.rejectAuth(new Error('No authorization code received'));
        }
        return;
      }

      try {
        // Exchange code for access token
        const tokenResponse = await this.exchangeCodeForToken(code as string);
        
        if (!tokenResponse.ok || !tokenResponse.access_token) {
          throw new Error(tokenResponse.error || 'Failed to get access token');
        }

        // Save encrypted token
        await this.saveToken(tokenResponse.access_token, tokenResponse.team);

        res.send(`
          <html>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #4a9eff;">✅ Slack連携完了！</h1>
              <p>ワークスペース: ${tokenResponse.team?.name || 'Unknown'}</p>
              <p>このウィンドウは自動的に閉じます...</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </body>
          </html>
        `);

        if (this.resolveAuth) {
          this.resolveAuth(tokenResponse.access_token);
        }

      } catch (error) {
        console.error('OAuth error:', error);
        res.send(`
          <html>
            <body>
              <h2>エラー</h2>
              <p>${error}</p>
              <script>setTimeout(() => window.close(), 3000);</script>
            </body>
          </html>
        `);
        if (this.rejectAuth) {
          this.rejectAuth(error as Error);
        }
      }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
  }

  private async exchangeCodeForToken(code: string): Promise<SlackOAuthResponse> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code,
      redirect_uri: this.redirectUri
    });

    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    return await response.json() as SlackOAuthResponse;
  }

  private async saveToken(token: string, team?: { id: string; name: string }): Promise<void> {
    // Encrypt token
    const encryptedToken = await this.encryptionService.encrypt(token);
    
    // Save to config file
    const configPath = path.join(process.env.HOME || '', '.anicca', 'slack-config.json');
    const configDir = path.dirname(configPath);
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const config = {
      token: encryptedToken,
      teamId: team?.id,
      teamName: team?.name,
      connectedAt: new Date().toISOString()
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('✅ Slack token saved securely');
  }

  async getStoredToken(): Promise<string | null> {
    const configPath = path.join(process.env.HOME || '', '.anicca', 'slack-config.json');
    
    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return await this.encryptionService.decrypt(config.token);
    } catch (error) {
      console.error('Failed to read token:', error);
      return null;
    }
  }

  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: 'chat:write,channels:read,channels:history,users:read',
      redirect_uri: this.redirectUri
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.resolveAuth = resolve;
      this.rejectAuth = reject;

      this.server = this.app.listen(3000, () => {
        console.log('🚀 OAuth server listening on http://localhost:3000');
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      console.log('🛑 OAuth server stopped');
    }
  }
}