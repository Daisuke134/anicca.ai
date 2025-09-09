import crypto from 'crypto';
import { KeyManagementServiceClient } from '@google-cloud/kms';

const { KMS_KEY_NAME } = process.env;
if (!KMS_KEY_NAME) {
  throw new Error('KMS_KEY_NAME is not set');
}

const kms = new KeyManagementServiceClient();

export async function encryptJson(obj) {
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const dek = crypto.randomBytes(32); // AES-256
  const iv = crypto.randomBytes(12);  // GCM標準の12byte
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const [encDekResp] = await kms.encrypt({ name: KMS_KEY_NAME, plaintext: dek });
  const encryptedDek = encDekResp.ciphertext;
  return {
    alg: 'AES-256-GCM',
    iv_b64: iv.toString('base64'),
    tag_b64: tag.toString('base64'),
    ciphertext_b64: ciphertext.toString('base64'),
    encrypted_dek_b64: Buffer.from(encryptedDek).toString('base64'),
  };
}

export async function decryptJson(payload) {
  const iv = Buffer.from(payload.iv_b64, 'base64');
  const tag = Buffer.from(payload.tag_b64, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext_b64, 'base64');
  const encryptedDek = Buffer.from(payload.encrypted_dek_b64, 'base64');
  const [decDekResp] = await kms.decrypt({ name: KMS_KEY_NAME, ciphertext: encryptedDek });
  const dek = decDekResp.plaintext;
  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

