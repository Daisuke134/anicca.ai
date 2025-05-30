// プロキシサーバーを使用するクライアント
export interface ProxyConfig {
  serverUrl: string;
  clientKey: string;
  clientId: string;
}

export interface AnalyzeResponse {
  success: boolean;
  data?: {
    commentary: string;
    timestamp: string;
    usage: {
      remaining: number;
    };
  };
  error?: string;
  message?: string;
}

export class ProxyClient {
  private config: ProxyConfig;

  constructor(config: ProxyConfig) {
    this.config = config;
  }

  async analyzeFrame(
    base64Image: string, 
    language: string, 
    prompt: string,
    previousUnderstanding?: string
  ): Promise<AnalyzeResponse> {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Key': this.config.clientKey,
          'X-Client-Id': this.config.clientId
        },
        body: JSON.stringify({
          image: base64Image,
          language,
          prompt,
          previousUnderstanding
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Unknown error',
          message: data.message
        };
      }

      return data;
    } catch (error) {
      console.error('Proxy client error:', error);
      return {
        success: false,
        error: 'Network error',
        message: error instanceof Error ? error.message : 'Failed to connect to server'
      };
    }
  }
}