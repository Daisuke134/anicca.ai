import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

// レート制限用の簡易メモリストア（本番環境ではRedis等を使用）
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// 使用量制限チェック
function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitStore.get(clientId);
  
  if (!userLimit || now > userLimit.resetTime) {
    // 新しい期間を開始（1日 = 86400000ms）
    rateLimitStore.set(clientId, {
      count: 1,
      resetTime: now + 86400000
    });
    return true;
  }
  
  if (userLimit.count >= 100) { // 1日100回の制限
    return false;
  }
  
  userLimit.count++;
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORSヘッダーの設定
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Client-Key'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // クライアント認証（簡易版：クライアントキーで認証）
    const clientKey = req.headers['x-client-key'] as string;
    const expectedKey = process.env.CLIENT_SECRET_KEY;
    
    // デバッグ用ログ（本番環境では削除）
    console.log('Client key received:', clientKey);
    console.log('Expected key exists:', !!expectedKey);
    
    if (!clientKey || clientKey !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // レート制限チェック
    const clientId = req.headers['x-client-id'] as string || 'default';
    if (!checkRateLimit(clientId)) {
      return res.status(429).json({ 
        error: 'Daily limit reached',
        message: 'You have reached the daily limit of 100 requests'
      });
    }

    // リクエストボディの検証
    const { image, language, prompt } = req.body;
    if (!image || !language || !prompt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Gemini APIの初期化（サーバー側でAPIキーを保持）
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // 画像とプロンプトでコンテンツを生成
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'image/png',
          data: image
        }
      },
      prompt
    ]);

    const response = result.response;
    const text = response.text();

    // レスポンスを返す
    res.status(200).json({
      success: true,
      data: {
        commentary: text,
        timestamp: new Date().toISOString(),
        usage: {
          remaining: 100 - (rateLimitStore.get(clientId)?.count || 0)
        }
      }
    });

  } catch (error) {
    console.error('Proxy server error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to process the request'
    });
  }
}