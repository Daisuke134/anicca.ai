import { app, safeStorage } from 'electron';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const TOKEN_FILE = 'bridge-token.bin';
const MIN_LENGTH = 32;

function canUseSafeStorage(): boolean {
  try {
    return !!safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function ensureDir(dirPath: string) {
  try {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  } catch {
    /* noop */
  }
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch {
    /* noop */
  }
}

function getStoragePath(): string {
  const base = app.getPath('userData');
  ensureDir(base);
  return path.join(base, TOKEN_FILE);
}

function readStoredToken(filePath: string): string | null {
  try {
    const data = fs.readFileSync(filePath);
    if (!data || data.length === 0) return null;
    if (canUseSafeStorage()) {
      try {
        return safeStorage.decryptString(data);
      } catch {
        return null;
      }
    }
    return data.toString('utf8');
  } catch {
    return null;
  }
}

function writeStoredToken(filePath: string, token: string) {
  const options = { mode: 0o600 } as fs.WriteFileOptions;
  if (canUseSafeStorage()) {
    const encrypted = safeStorage.encryptString(token);
    fs.writeFileSync(filePath, encrypted, options);
    return;
  }
  fs.writeFileSync(filePath, token, options);
}

function generateToken(): string {
  return randomBytes(48).toString('base64url');
}

export function resolveBridgeAuthToken(): string {
  const override = process.env.BRIDGE_AUTH_TOKEN_OVERRIDE;
  if (override && override.length >= MIN_LENGTH) return override;

  const envToken = process.env.BRIDGE_AUTH_TOKEN;
  if (envToken && envToken.length >= MIN_LENGTH) return envToken;

  const storagePath = getStoragePath();
  const stored = readStoredToken(storagePath);
  if (stored && stored.length >= MIN_LENGTH) return stored;

  const token = generateToken();
  if (token.length < MIN_LENGTH) {
    throw new Error('Failed to generate bridge auth token');
  }
  writeStoredToken(storagePath, token);
  return token;
}
