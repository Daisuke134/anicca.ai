import { playwrightMcpService } from '../../../mcp/clients/playwrightClient.js';
import logger from '../../../utils/logger.js';

// MCPサービスの初期化（一度だけ）
let isInitialized = false;

export default async function handler(req, res) {
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // MCPサービスを初期化（初回のみ）
    if (!isInitialized) {
      await playwrightMcpService.initialize();
      isInitialized = true;
    }
    
    // アクションは body.action を最優先。未指定時のみURL末尾から推測（移行期フォールバック）。
    const urlParts = req.url.split('/');
    const urlTail = urlParts[urlParts.length - 1];
    const bodyAction = typeof req.body?.action === 'string' ? req.body.action.trim() : '';
    const chosenAction = bodyAction || urlTail.replace('playwright_', '');
    logger.debug(`Playwright chosen action: ${chosenAction}`);
    
    // リクエストボディから引数を取得
    logger.debug('Playwright request body:', req.body);
    
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
    
    logger.debug('Playwright parsed arguments:', args);
    
    // Playwright MCPのツール名
    const mcpToolName = chosenAction;
    
    // ツールを実行
    const result = await playwrightMcpService.callTool(mcpToolName, args);
    
    logger.info('Playwright tool execution completed');
    
    // 結果を返す
    return res.status(200).json({
      success: true,
      result: result
    });
    
  } catch (error) {
    logger.error(`Playwright tool error: ${error?.message || String(error)}`);
    
    return res.status(500).json({
      error: 'Playwright tool execution failed',
      message: error.message
    });
  }
}
