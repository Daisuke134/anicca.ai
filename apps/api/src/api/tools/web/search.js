import { exaMcpService } from '../../../services/mcp-clients/exaClient.js';

// MCPサービスの初期化（一度だけ）
let isInitialized = false;

export default async function handler(req, res) {
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // MCPサービスを初期化（初回のみ）
    if (!isInitialized) {
      await exaMcpService.initialize();
      isInitialized = true;
    }
    
    // ツール名はボディから任意指定。未指定なら自動選択。
    
    // 両方の形式に対応
    let query;
    
    console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
    
    if (req.body.arguments) {
      // デスクトップ版形式: { arguments: { query: "..." } }
      const args = typeof req.body.arguments === 'string' 
        ? JSON.parse(req.body.arguments) 
        : req.body.arguments;
      query = args.query;
      console.log('🔧 Using arguments format - query:', query);
    } else {
      // Web版形式: { query: "..." }
      query = req.body.query;
      console.log('🔧 Using direct format - query:', query);
    }
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const exaApiKey = process.env.EXA_API_KEY;
    if (!exaApiKey) {
      throw new Error('EXA_API_KEY is not configured');
    }
    
    // Exa MCPで検索（ツール名を指定）
    console.log('🔍 Using Exa MCP for search...');
    
    const searchParams = { numResults: (req.body?.numResults || 5) };
    const bodyTool = req.body?.tool;
    const chosenTool = bodyTool || exaMcpService.selectSearchTool(query);
    // 検索実行
    const mcpResult = await exaMcpService.search(query, {
      tool: chosenTool,
      numResults: searchParams.numResults
    });
    
    console.log('🌐 Exa MCP response:', JSON.stringify(mcpResult, null, 2));
    
    // MCPレスポンスを既存のフォーマットに変換
    let results = [];
    
    if (mcpResult && mcpResult.content && mcpResult.content.length > 0) {
      for (const content of mcpResult.content) {
        if (content.type === 'text') {
          // MCPのレスポンスフォーマットに従って処理
          try {
            // テキストがJSON形式の場合はパース
            const parsed = JSON.parse(content.text);
            if (Array.isArray(parsed)) {
              results = parsed;
            } else if (parsed.results) {
              results = parsed.results;
            } else {
              // 単一の結果として扱う
              results.push(parsed);
            }
          } catch (e) {
            // JSONでない場合は、改行で分割して結果として扱う
            const lines = content.text.split('\n').filter(line => line.trim());
            lines.forEach(line => {
              // URLパターンを検出
              const urlMatch = line.match(/https?:\/\/[^\s]+/);
              if (urlMatch) {
                results.push({
                  url: urlMatch[0],
                  title: line.replace(urlMatch[0], '').trim() || 'Search Result',
                  snippet: line
                });
              } else if (line.trim()) {
                results.push({
                  title: line.substring(0, 100),
                  snippet: line
                });
              }
            });
          }
        }
      }
    }
    
    // レスポンスフォーマットを維持（要約指示を追加）
    const responseData = {
      success: true,
      query: query,
      results: results.map(result => ({
        title: result.title,
        url: result.url,
        snippet: result.snippet || result.text?.substring(0, 200) + '...'
      })),
      // AIへの指示を追加
      _instruction: 'Please summarize these results concisely, highlighting the most important and relevant information. Focus on key insights rather than listing all results.'
    };
    
    console.log('✅ Returning response:', JSON.stringify(responseData, null, 2));
    res.status(200).json(responseData);
    
  } catch (error) {
    console.error('Exa MCP Error:', error);
    res.status(500).json({
      error: 'Failed to search with Exa MCP',
      message: error.message
    });
  }
}
