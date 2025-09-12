import logger from '../../utils/logger.js';

export default async function handler(req, res) {
  logger.info('Claude proxy handler called');
  logger.debug(`Method: ${req.method}`);
  logger.debug(`URL: ${req.url}`);

  try {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    
    // console.log('🔑 API Key check:');
    // console.log('  From env:', anthropicApiKey ? `${anthropicApiKey.substring(0, 10)}...` : 'NOT SET');
    // console.log('  Type:', typeof anthropicApiKey);
    // console.log('  Length:', anthropicApiKey ? anthropicApiKey.length : 0);
    
    if (!anthropicApiKey) {
      logger.error('ANTHROPIC_API_KEY not configured');
      return res.status(500).json({ error: 'Claude API key not configured on server' });
    }

    // Extract the API path from the request
    // e.g., /api/claude/v1/messages -> /v1/messages
    // Also support agent type in URL: /api/claude/worker/v1/messages
    let apiPath = req.url.replace('/api/claude', '');
    let agentType = null;
    
    // Check if agent type is in the URL path
    const pathMatch = apiPath.match(/^\/([^\/]+)(\/v\d+\/.*)$/);
    if (pathMatch && ['worker', 'executor', 'parent'].includes(pathMatch[1])) {
      agentType = pathMatch[1];
      apiPath = pathMatch[2];
      // console.log(`🏷️ Agent type from URL: ${agentType}`);
    }
    
    const anthropicUrl = `https://api.anthropic.com${apiPath}`;
    
    // console.log(`🚀 Proxying Claude API request to: ${anthropicUrl}`);
    
    // Check if this is a Worker request and force Claude 4 Sonnet
    // Support both header and URL path methods
    if ((req.headers['x-agent-type'] === 'worker' || agentType === 'worker') && req.body?.model) {
      logger.info('Worker detected - forcing Claude 4 Sonnet model');
      logger.debug(`Original model: ${req.body.model}`);
      const { MODEL_CONFIG } = await import('../../config/environment.js');
      req.body.model = MODEL_CONFIG.CLAUDE_WORKER_DEFAULT_MODEL;
      logger.debug(`Forced model: ${req.body.model}`);
    }
    

    // Forward the request to Anthropic API
    // IMPORTANT: Always use the environment variable API key, ignore any received headers
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': anthropicApiKey,  // Always use environment variable, never the received header
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
    };

    // Forward any anthropic-beta headers
    if (req.headers['anthropic-beta']) {
      headers['anthropic-beta'] = req.headers['anthropic-beta'];
    }


    let response;
    try {
      response = await fetch(anthropicUrl, {
        method: req.method,
        headers,
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
      });
    } catch (fetchError) {
      logger.error(`Fetch error: ${fetchError?.message || String(fetchError)}`);
      return res.status(502).json({ 
        error: 'Bad Gateway', 
        message: 'Failed to connect to Claude API',
        details: fetchError.message
      });
    }

    const responseText = await response.text();
    
    // console.log('📥 Response status:', response.status);
    // console.log('📥 Response preview:', responseText.substring(0, 200) + '...');

    // Error check
    if (!response.ok) {
      logger.error(`Claude API error: ${response.status}`);
      logger.debug(`Response: ${responseText}`);
    }

    // Forward response headers
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding' && 
          key.toLowerCase() !== 'content-length' &&
          key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });

    res.status(response.status).send(responseText);

  } catch (error) {
    logger.error(`Claude proxy error: ${error?.message || String(error)}`);
    logger.debug(error?.stack || '');
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
}
