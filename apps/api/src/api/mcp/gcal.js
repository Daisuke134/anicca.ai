// Google Calendar MCP - credentialsのみ提供
export default async function gcalHandler(app) {
  // OAuth credentials を返すエンドポイント（デスクトップから呼ばれる）
  app.get('/api/gcal/credentials', (req, res) => {
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    try {
      // 環境変数からcredentialsを返す
      res.json({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET
      });
      
      console.log('✅ Google credentials provided to desktop app');
    } catch (error) {
      console.error('Error providing credentials:', error);
      res.status(500).json({ error: 'Failed to provide credentials' });
    }
  });
}