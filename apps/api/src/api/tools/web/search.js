import { exaMcpService } from '../../../mcp/clients/exaClient.js';
import logger from '../../../utils/logger.js';

// MCPサービスの初期化（一度だけ）
let isInitialized = false;

export default async function handler(req, res) {
  // CORSはグローバルミドルウェアで処理
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // MCPサービスを初期化（初回のみ）
    if (!isInitialized) {
      await exaMcpService.initialize();
      isInitialized = true;
    }
    
    // ツール名はボディから（無ければクエリで自動選択）
    let toolName = req.body?.tool;
    
    // 両方の形式に対応
    let query;
    
    logger.debug('Exa search request body:', req.body);
    
    if (req.body.arguments) {
      // デスクトップ版形式: { arguments: { query: "..." } }
      const args = typeof req.body.arguments === 'string' 
        ? JSON.parse(req.body.arguments) 
        : req.body.arguments;
      query = args.query;
      logger.debug(`Using arguments format - query: ${query}`);
    } else {
      // Web版形式: { query: "..." }
      query = req.body.query;
      logger.debug(`Using direct format - query: ${query}`);
    }
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const exaApiKey = process.env.EXA_API_KEY;
    if (!exaApiKey) {
      throw new Error('EXA_API_KEY is not configured');
    }
    
    // ツール名の最終決定
    if (!toolName) {
      toolName = exaMcpService.selectSearchTool(query);
      logger.info(`Exa auto-selected tool: ${toolName}`);
    }

    logger.info('Using Exa MCP for search');
    let searchParams = { numResults: 5 };

    // crawlingツールは特別な処理が必要
    if (toolName === 'crawling') {
      // crawlingはurlパラメータを期待
      const result = await exaMcpService.client.callTool({
        name: 'crawling',
        arguments: {
          url: query  // queryをurlとして渡す
        }
      });
      logger.debug('Exa MCP crawling response:', result);
      
      // 結果を標準フォーマットに変換
      let results = [];
      if (result && result.content) {
        results = [{
          title: 'Crawled Content',
          url: query,
          snippet: result.content[0]?.text?.substring(0, 500) + '...'
        }];
      }
      
      return res.status(200).json({
        success: true,
        tool: toolName,
        exaTool: 'crawling',
        query: query,
        results: results,
        _instruction: 'Please summarize the crawled content.'
      });
    }
    
    // 通常の検索処理
    const mcpResult = await exaMcpService.search(query, { tool: toolName, numResults: searchParams.numResults });
    
    logger.debug('Exa MCP response:', mcpResult);
    
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
    
    logger.debug('Exa response data:', responseData);
    res.status(200).json(responseData);
    
  } catch (error) {
    logger.error(`Exa MCP Error: ${error?.message || String(error)}`);
    res.status(500).json({
      error: 'Failed to search with Exa MCP',
      message: error.message
    });
  }
}
