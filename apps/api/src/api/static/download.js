// DMGファイルのプロキシダウンロード
export default async function handler(req, res) {
  // CORSヘッダーを設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  // OPTIONSリクエストの処理
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // GETリクエストのみ許可
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    // 環境変数からGitHub設定を取得
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Daisuke134';
    const GITHUB_REPO = process.env.GITHUB_REPO || 'anicca.ai';
    const RELEASE_TAG = process.env.RELEASE_TAG || 'latest';
    
    if (!GITHUB_TOKEN) {
      console.error('GITHUB_TOKEN is not set');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }
    
    // GitHub APIでリリース情報を取得
    const releaseUrl = RELEASE_TAG === 'latest' 
      ? `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
      : `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${RELEASE_TAG}`;
    console.log(`Fetching release info from: ${releaseUrl}`);
    
    const releaseResponse = await fetch(releaseUrl, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!releaseResponse.ok) {
      console.error(`GitHub API error: ${releaseResponse.status} ${releaseResponse.statusText}`);
      res.status(404).json({ error: 'Release not found' });
      return;
    }
    
    const releaseData = await releaseResponse.json();
    
    // クエリパラメータからアーキテクチャを取得
    const arch = req.query.arch || 'arm64';
    
    // DMGファイルを探す
    const dmgAsset = releaseData.assets.find(asset => 
      asset.name.endsWith('.dmg') && asset.name.includes(arch)
    );
    
    if (!dmgAsset) {
      console.error('DMG file not found in release assets');
      res.status(404).json({ error: 'DMG file not found' });
      return;
    }
    
    console.log(`Found DMG: ${dmgAsset.name} (${dmgAsset.size} bytes)`);
    
    // GitHub APIを使用してファイルをダウンロード
    const downloadResponse = await fetch(dmgAsset.url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/octet-stream'
      }
    });
    
    if (!downloadResponse.ok) {
      console.error(`Download error: ${downloadResponse.status} ${downloadResponse.statusText}`);
      res.status(500).json({ error: 'Failed to download file' });
      return;
    }
    
    // レスポンスヘッダーを設定
    res.setHeader('Content-Type', 'application/x-apple-diskimage');
    res.setHeader('Content-Disposition', `attachment; filename="${dmgAsset.name}"`);
    res.setHeader('Content-Length', dmgAsset.size);
    
    // ストリーミングでクライアントに転送
    const reader = downloadResponse.body.getReader();
    const writer = res;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        writer.write(value);
      }
      res.end();
    } catch (error) {
      console.error('Streaming error:', error);
      res.status(500).end();
    }
    
  } catch (error) {
    console.error('Error in download handler:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
