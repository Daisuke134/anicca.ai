import { safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export class EncryptionService {
  private configPath: string;
  private configFile: string;

  constructor() {
    // ~/.anicca/config に暗号化されたデータを保存
    this.configPath = path.join(os.homedir(), '.anicca', 'config');
    this.configFile = path.join(this.configPath, 'encrypted.dat');
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
    }
  }

  /**
   * APIキーを暗号化して保存
   */
  async saveApiKey(apiKey: string): Promise<void> {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption is not available on this system');
      }

      // APIキーを暗号化
      const encrypted = safeStorage.encryptString(apiKey);
      
      // 暗号化されたデータをファイルに保存
      fs.writeFileSync(this.configFile, encrypted);
      
      console.log('🔐 API key encrypted and saved successfully');
    } catch (error) {
      console.error('❌ Failed to encrypt API key:', error);
      throw error;
    }
  }

  /**
   * 暗号化されたAPIキーを復号して取得
   */
  async getApiKey(): Promise<string | null> {
    try {
      if (!fs.existsSync(this.configFile)) {
        console.log('🔍 No encrypted API key found');
        return null;
      }

      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption is not available on this system');
      }

      // 暗号化されたデータを読み込み
      const encrypted = fs.readFileSync(this.configFile);
      
      // 復号
      const decrypted = safeStorage.decryptString(encrypted);
      
      console.log('🔓 API key decrypted successfully');
      return decrypted;
    } catch (error) {
      console.error('❌ Failed to decrypt API key:', error);
      return null;
    }
  }

  /**
   * 暗号化されたAPIキーが存在するかチェック
   */
  hasApiKey(): boolean {
    return fs.existsSync(this.configFile);
  }

  /**
   * 暗号化されたAPIキーを削除
   */
  async deleteApiKey(): Promise<void> {
    try {
      if (fs.existsSync(this.configFile)) {
        fs.unlinkSync(this.configFile);
        console.log('🗑️ Encrypted API key deleted');
      }
    } catch (error) {
      console.error('❌ Failed to delete encrypted API key:', error);
      throw error;
    }
  }

  /**
   * Exa APIキーを暗号化して保存
   */
  async saveExaApiKey(apiKey: string): Promise<void> {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption is not available on this system');
      }

      const exaConfigFile = path.join(this.configPath, 'exa_encrypted.dat');
      const encrypted = safeStorage.encryptString(apiKey);
      fs.writeFileSync(exaConfigFile, encrypted);
      
      console.log('🔐 Exa API key encrypted and saved successfully');
    } catch (error) {
      console.error('❌ Failed to encrypt Exa API key:', error);
      throw error;
    }
  }

  /**
   * 暗号化されたExa APIキーを復号して取得
   */
  async getExaApiKey(): Promise<string | null> {
    try {
      const exaConfigFile = path.join(this.configPath, 'exa_encrypted.dat');
      
      if (!fs.existsSync(exaConfigFile)) {
        console.log('🔍 No encrypted Exa API key found');
        return null;
      }

      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption is not available on this system');
      }

      const encrypted = fs.readFileSync(exaConfigFile);
      const decrypted = safeStorage.decryptString(encrypted);
      
      console.log('🔓 Exa API key decrypted successfully');
      return decrypted;
    } catch (error) {
      console.error('❌ Failed to decrypt Exa API key:', error);
      return null;
    }
  }

  /**
   * 暗号化されたExa APIキーが存在するかチェック
   */
  hasExaApiKey(): boolean {
    const exaConfigFile = path.join(this.configPath, 'exa_encrypted.dat');
    return fs.existsSync(exaConfigFile);
  }
}