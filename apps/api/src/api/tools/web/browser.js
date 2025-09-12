import { playwrightMcpService } from '../../../mcp/clients/playwrightClient.js';

// MCPサービスの初期化（一度だけ）
let isInitialized = false;

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // MCPサービスを初期化（初回のみ）
    if (!isInitialized) {
      await playwrightMcpService.initialize();
      isInitialized = true;
    }
    
    // URLからツール名を取得（例: /api/tools/playwright_navigate → playwright_navigate）
    const urlParts = req.url.split('/');
    const toolName = urlParts[urlParts.length - 1];
    console.log('🛠️ Playwright tool name from URL:', toolName);
    
    // リクエストボディから引数を取得
    console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
    
    let args = {};
    
    // 両方の形式に対応
    if (req.body.arguments) {
      // デスクトップ版形式: { arguments: { ... } }
      args = typeof req.body.arguments === 'string' 
        ? JSON.parse(req.body.arguments) 
        : req.body.arguments;
    } else {
      // Web版形式: 直接パラメータ
      args = req.body;
    }
    
    console.log('🔧 Parsed arguments:', args);
    
    // Playwright MCPのツール名に変換
    const mcpToolName = toolName.replace('playwright_', '');
    
    // ツールを実行
    const result = await playwrightMcpService.callTool(mcpToolName, args);
    
    console.log('✅ Playwright tool execution completed');
    
    // 結果を返す
    return res.status(200).json({
      success: true,
      result: result
    });
    
  } catch (error) {
    console.error('❌ Playwright tool error:', {
      error: error.message,
      stack: error.stack,
      toolName: req.url
    });
    
    return res.status(500).json({
      error: 'Playwright tool execution failed',
      message: error.message
    });
  }
}
