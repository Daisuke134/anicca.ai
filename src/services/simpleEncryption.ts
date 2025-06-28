import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * シンプルな暗号化サービス（Node.js環境用）
 */
export class SimpleEncryption {
  private algorithm = 'aes-256-cbc';
  private keyPath: string;
  private key!: Buffer;
  private iv!: Buffer;

  constructor() {
    // キーファイルのパス
    this.keyPath = path.join(process.env.HOME || '', '.anicca', 'encryption.key');
    
    // キーが存在しない場合は生成
    if (!fs.existsSync(this.keyPath)) {
      this.generateKey();
    } else {
      this.loadKey();
    }
  }

  private generateKey(): void {
    const dir = path.dirname(this.keyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.key = crypto.randomBytes(32);
    this.iv = crypto.randomBytes(16);
    
    const keyData = {
      key: this.key.toString('hex'),
      iv: this.iv.toString('hex')
    };
    
    fs.writeFileSync(this.keyPath, JSON.stringify(keyData));
    console.log('🔑 Encryption key generated');
  }

  private loadKey(): void {
    const keyData = JSON.parse(fs.readFileSync(this.keyPath, 'utf-8'));
    this.key = Buffer.from(keyData.key, 'hex');
    this.iv = Buffer.from(keyData.iv, 'hex');
  }

  encrypt(text: string): string {
    const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  decrypt(encrypted: string): string {
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, this.iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}