import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { DIRECTORIES } from '../../../config/environment.js';

/**
 * 簡易HTTPサーバー - /tmp/previewアプリの公開機能
 * 
 * URLパターン:
 * - /api/preview/app-xyz123/index.html
 * - /api/preview/app-xyz123/style.css
 * - /api/preview/app-xyz123/script.js
 */

// プレビューディレクトリのベースパス
const PREVIEW_BASE_PATH = path.join(DIRECTORIES.TEMP_BASE, 'preview');

// セキュリティ: 許可されたファイル拡張子
const ALLOWED_EXTENSIONS = [
  '.html', '.htm', '.css', '.js', '.json', 
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot',
  '.txt', '.md'
];

// キャッシュ制御
const CACHE_CONTROL = {
  '.html': 'no-cache',
  '.htm': 'no-cache',
  '.css': 'public, max-age=3600',
  '.js': 'public, max-age=3600',
  '.png': 'public, max-age=86400',
  '.jpg': 'public, max-age=86400',
  '.jpeg': 'public, max-age=86400',
  '.gif': 'public, max-age=86400',
  '.svg': 'public, max-age=86400'
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // URLからパスを取得
    const { path: pathArray } = req.query;
    if (!pathArray || pathArray.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    // パスを結合
    const requestedPath = Array.isArray(pathArray) ? pathArray.join('/') : pathArray;
    
    // セキュリティ: パストラバーサル攻撃を防ぐ
    if (requestedPath.includes('..') || requestedPath.includes('~')) {
      console.warn(`🚫 Path traversal attempt: ${requestedPath}`);
      return res.status(403).json({ error: 'Forbidden' });
    }

    // アプリIDとファイルパスを分離
    const pathParts = requestedPath.split('/');
    const appId = pathParts[0];
    const filePath = pathParts.slice(1).join('/') || 'index.html';

    // アプリIDのバリデーション（英数字とハイフンのみ）
    if (!/^[a-zA-Z0-9-]+$/.test(appId)) {
      return res.status(400).json({ error: 'Invalid app ID' });
    }

    // ファイルの拡張子チェック
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(403).json({ error: 'File type not allowed' });
    }

    // 実際のファイルパス
    const fullPath = path.join(PREVIEW_BASE_PATH, appId, filePath);

    // ファイルの存在確認
    if (!fs.existsSync(fullPath)) {
      console.log(`📁 File not found: ${fullPath}`);
      
      // index.htmlへのフォールバック（SPAサポート）
      if (!filePath.includes('.')) {
        const indexPath = path.join(PREVIEW_BASE_PATH, appId, 'index.html');
        if (fs.existsSync(indexPath)) {
          return serveFile(indexPath, res);
        }
      }
      
      return res.status(404).json({ error: 'File not found' });
    }

    // ディレクトリの場合はindex.htmlを探す
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      const indexPath = path.join(fullPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return serveFile(indexPath, res);
      }
      return res.status(403).json({ error: 'Directory listing not allowed' });
    }

    // ファイルを配信
    return serveFile(fullPath, res);

  } catch (error) {
    console.error('❌ Preview server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

/**
 * ファイルを配信
 */
function serveFile(filePath, res) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    
    // ヘッダーを設定
    res.setHeader('Content-Type', mimeType);
    
    // キャッシュ制御
    const cacheControl = CACHE_CONTROL[ext] || 'public, max-age=3600';
    res.setHeader('Cache-Control', cacheControl);
    
    // セキュリティヘッダー
    if (ext === '.html' || ext === '.htm') {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data:");
    }
    
    // ファイルの内容を読み込んで送信
    const content = fs.readFileSync(filePath);
    
    // ETagを生成（簡易版）
    const stats = fs.statSync(filePath);
    const etag = `"${stats.size}-${stats.mtime.getTime()}"`;
    res.setHeader('ETag', etag);
    
    // If-None-Matchヘッダーをチェック
    if (res.req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    
    console.log(`📄 Serving: ${filePath} (${mimeType})`);
    return res.status(200).send(content);
    
  } catch (error) {
    console.error('❌ Error serving file:', error);
    return res.status(500).json({ error: 'Error reading file' });
  }
}

/**
 * 使用例:
 * 
 * Workerがアプリを作成:
 * /tmp/preview/app-todo-123/
 *   ├── index.html
 *   ├── style.css
 *   └── script.js
 * 
 * ユーザーがアクセス:
 * https://anicca-proxy.vercel.app/api/preview/app-todo-123/
 * → index.htmlが表示される
 * 
 * アセットも自動的に配信:
 * https://anicca-proxy.vercel.app/api/preview/app-todo-123/style.css
 * https://anicca-proxy.vercel.app/api/preview/app-todo-123/script.js
 */