/**
 * POST /api/agent/content
 * 
 * Generate platform-specific content (different formats for X, TikTok, etc.)
 */

import { Router } from 'express';
import OpenAI from 'openai';

const router = Router();
const openai = new OpenAI();

router.post('/', async (req, res) => {
  try {
    const { topic, problemType, tone = 'gentle', language = 'ja' } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'topic is required',
      });
    }
    
    const systemPrompt = `You are Anicca, creating content for social media platforms.

CRITICAL RULES:
- Never use toxic positivity
- Always acknowledge pain/struggle
- Offer hope through Buddhist wisdom
- Be authentic and human

Generate content in ${language === 'ja' ? 'Japanese' : 'English'}.`;

    const userPrompt = `Create content about: ${topic}
${problemType ? `For people struggling with: ${problemType}` : ''}
Tone: ${tone}

Generate JSON with:
1. hook: Attention-grabbing opening (1 sentence)
2. content: Main content (2-3 sentences)
3. tone: The tone used
4. formats:
   - short: Twitter/X version (≤280 chars)
   - medium: Instagram/TikTok caption (≤500 chars)
   - long: Blog/longer format (≤1000 chars)
   - hashtags: Array of relevant hashtags (5-7)`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    const generated = JSON.parse(completion.choices[0].message.content);
    
    // Validate short format length
    if (generated.formats?.short && generated.formats.short.length > 280) {
      generated.formats.short = generated.formats.short.slice(0, 277) + '...';
    }
    
    res.json({
      hook: generated.hook,
      content: generated.content,
      tone: generated.tone,
      formats: generated.formats,
    });
    
  } catch (error) {
    console.error('[Agent Content] Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

export default router;
