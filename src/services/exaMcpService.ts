import { EncryptionService } from './encryptionService';

export interface ExaSearchResult {
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  publishedDate?: string;
  author?: string;
}

export interface ExaConnectionOptions {
  mode: 'local' | 'remote';
  remoteUrl?: string;
}

// ExaMCPService is currently disabled for performance reasons
// All MCP functionality has been removed
export class ExaMCPService {
  private encryptionService: EncryptionService;
  
  constructor(encryptionService: EncryptionService) {
    this.encryptionService = encryptionService;
  }

  // Stub methods to prevent compilation errors
  isServerConnected(): boolean {
    return false;
  }

  async connectToExa(options?: ExaConnectionOptions) {
    console.log('ℹ️ EXA MCP functionality is disabled for performance');
    throw new Error('EXA MCP functionality is disabled');
  }

  async searchWeb(query: string, options?: any): Promise<ExaSearchResult[]> {
    console.log('ℹ️ EXA search is disabled, use Claude SDK instead');
    return [];
  }

  async listTools(): Promise<any[]> {
    return [];
  }

  async disconnect(): Promise<void> {
    // No-op
  }
}