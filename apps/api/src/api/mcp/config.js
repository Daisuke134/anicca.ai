export default async function handler(req, res) {

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 環境変数からAPIキーを取得（Railwayで管理）
    const config = {
      elevenLabsKey: process.env.ELEVENLABS_API_KEY || null,
      // 将来的に他のMCPサーバーのキーも追加可能
    };

    return res.status(200).json(config);
  } catch (error) {
    console.error('Error fetching MCP config:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
