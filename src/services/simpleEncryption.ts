import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { safeStorage } from 'electron';

/**
 * 二重暗号化を実装するクラス
 * 1. safeStorageでマスターキーを保護
 * 2. AES-256-GCMで実際のデータを暗号化
 */
export class SimpleEncryption {
  private algorithm = 'aes-256-gcm';
  private masterKey!: Buffer;
  private masterKeyPath: string;
  private aniccaDir: string;

  constructor() {
    this.aniccaDir = path.join(os.homedir(), '.anicca');
    this.masterKeyPath = path.join(this.aniccaDir, 'master.key');
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(this.aniccaDir)) {
      fs.mkdirSync(this.aniccaDir, { recursive: true });
    }
    
    this.initializeMasterKey();
  }

  private initializeMasterKey(): void {
    try {
      if (fs.existsSync(this.masterKeyPath) && safeStorage.isEncryptionAvailable()) {
        // 既存のマスターキーを読み込む
        const encryptedKey = fs.readFileSync(this.masterKeyPath);
        const decryptedKey = safeStorage.decryptString(encryptedKey);
        this.masterKey = Buffer.from(decryptedKey, 'hex');
        console.log('🔑 Master key loaded successfully');
      } else {
        // 新しいマスターキーを生成
        this.masterKey = crypto.randomBytes(32);
        
        if (safeStorage.isEncryptionAvailable()) {
          const encryptedKey = safeStorage.encryptString(this.masterKey.toString('hex'));
          fs.writeFileSync(this.masterKeyPath, encryptedKey);
          console.log('🔑 New master key generated and saved');
        } else {
          throw new Error('SafeStorage is not available');
        }
      }
    } catch (error) {
      console.error('❌ Failed to initialize master key:', error);
      // エラー時は新しいマスターキーを生成
      this.generateNewMasterKey();
    }
  }

  private generateNewMasterKey(): void {
    this.masterKey = crypto.randomBytes(32);
    
    if (safeStorage.isEncryptionAvailable()) {
      const encryptedKey = safeStorage.encryptString(this.masterKey.toString('hex'));
      fs.writeFileSync(this.masterKeyPath, encryptedKey);
      console.log('🔑 New master key generated after error');
    }
  }

  /**
   * テキストを暗号化
   * @param text 暗号化するテキスト
   * @returns IV:authTag:暗号文 の形式
   */
  encrypt(text: string): string {
    try {
      // 毎回新しいIVを生成（ランダム性を確保）
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv) as crypto.CipherGCM;
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // 認証タグを取得（データの改ざん検知用）
      const authTag = cipher.getAuthTag();
      
      // IV + authTag + 暗号文を結合
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('❌ Encryption failed:', error);
      throw error;
    }
  }

  /**
   * 暗号文を復号
   * @param data IV:authTag:暗号文 の形式
   * @returns 復号されたテキスト
   */
  decrypt(data: string): string {
    try {
      const parts = data.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv) as crypto.DecipherGCM;
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('❌ Decryption failed:', error);
      throw error;
    }
  }

  /**
   * 古い暗号化ファイルをクリーンアップ
   */
  cleanupOldFiles(): void {
    try {
      // 古い固定キーファイルを削除
      const oldKeyPath = path.join(this.aniccaDir, 'encryption.key');
      if (fs.existsSync(oldKeyPath)) {
        fs.unlinkSync(oldKeyPath);
        console.log('🗑️ Removed old encryption.key');
      }
      
      // 古い形式の認証ファイルも削除（新形式で再作成される）
      const oldAuthPath = path.join(this.aniccaDir, 'auth.encrypted');
      if (fs.existsSync(oldAuthPath)) {
        try {
          // 古い形式かどうか確認（新形式は : で区切られている）
          const content = fs.readFileSync(oldAuthPath, 'utf8');
          if (!content.includes(':')) {
            fs.unlinkSync(oldAuthPath);
            console.log('🗑️ Removed old format auth.encrypted');
          }
        } catch (error) {
          // バイナリファイルの場合（古いsafeStorage形式）
          fs.unlinkSync(oldAuthPath);
          console.log('🗑️ Removed old binary auth.encrypted');
        }
      }
    } catch (error) {
      console.error('❌ Failed to cleanup old files:', error);
    }
  }
}