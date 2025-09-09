export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured on proxy' });
    }

    // Web用のinstructionsが必要な場合のみここへ追加
    const sessionBody = {
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        tools: []
        // instructions: 'Web専用のプロンプトを必要に応じて配置'
      }
    };

    const createResp = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sessionBody)
    });
    if (!createResp.ok) {
      let detail = '';
      try { detail = JSON.stringify(await createResp.json()); } catch { detail = await createResp.text(); }
      return res.status(502).json({ error: 'Failed to create client secret', status: createResp.status, detail });
    }
    const clientSecret = await createResp.json();

    return res.json({
      object: 'realtime.session',
      client_secret: { value: clientSecret.value, expires_at: clientSecret.expires_at || 0 },
      model: 'gpt-realtime',
      voice: 'alloy'
    });
  } catch (err) {
    console.error('web-session error:', err);
    return res.status(500).json({ error: 'web-session internal error', message: err?.message || String(err) });
  }
}

