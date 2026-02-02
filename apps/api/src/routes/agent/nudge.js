/**
 * POST /api/agent/nudge
 * 
 * Generate a nudge for external platform (Moltbook, etc.)
 * Creates an AgentPost record and returns generated content
 */

import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import OpenAI from 'openai';

const router = Router();
const openai = new OpenAI();

// Prompt Injection sanitization
function sanitizeContext(context) {
  if (!context) return '';
  
  let sanitized = context;
  
  // 1. Remove URLs
  sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '');
  
  // 2. Remove code blocks
  sanitized = sanitized.replace(/```[\s\S]*?```/g, '');
  
  // 3. Remove known injection patterns
  const injectionPatterns = [
    /ignore\s+previous/gi,
    /disregard/gi,
    /override/gi,
    /system:/gi,
    /assistant:/gi,
  ];
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  // 4. Remove Unicode control characters
  sanitized = sanitized.replace(/[\u200B-\u200F\u202A-\u202E]/g, '');
  
  // 5. Remove/escape user_post tags
  sanitized = sanitized.replace(/<\/?user_post>/g, '');
  
  // 6. Limit length
  if (sanitized.length > 2000) {
    sanitized = sanitized.slice(0, 2000);
  }
  
  return sanitized;
}

// Map keywords to problem types
function detectProblemType(text) {
  const mappings = {
    staying_up_late: ['夜更かし', '眠れない', 'late night', 'can\'t sleep', '3時', '4時'],
    cant_wake_up: ['起きられない', '朝弱い', 'can\'t wake up', 'morning'],
    self_loathing: ['自己嫌悪', '自分が嫌い', 'hate myself', 'self-loathing'],
    rumination: ['考えすぎ', '反芻', 'overthinking', 'rumination'],
    procrastination: ['先延ばし', '後回し', 'procrastination', 'putting off'],
    anxiety: ['不安', '心配', 'anxiety', 'worried'],
    loneliness: ['孤独', '寂しい', 'lonely', 'loneliness'],
  };
  
  const lowerText = text.toLowerCase();
  for (const [type, keywords] of Object.entries(mappings)) {
    if (keywords.some(kw => lowerText.includes(kw.toLowerCase()))) {
      return type;
    }
  }
  return null;
}

router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      platform, 
      externalPostId, 
      platformUserId, 
      context, 
      language = 'ja',
      // Crisis detection fields (from caller, e.g., OpenClaw)
      severity = null,  // null | 'crisis'
      region = null,    // 'JP', 'US', 'UK', 'KR', 'OTHER'
      optIn = false,    // User initiated contact (Mastodon.bot policy)
    } = req.body;
    
    // Validate required fields and types
    if (!platform || typeof platform !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'platform is required and must be a string',
      });
    }
    
    if (!context || typeof context !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'context is required and must be a string',
      });
    }
    
    // Normalize and validate platform (allowlist)
    const ALLOWED_PLATFORMS = ['moltbook', 'mastodon', 'pleroma', 'misskey', 'slack', 'x', 'tiktok', 'instagram'];
    const normalizedPlatform = platform.trim().toLowerCase();
    
    if (!ALLOWED_PLATFORMS.includes(normalizedPlatform)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `platform must be one of: ${ALLOWED_PLATFORMS.join(', ')}`,
      });
    }
    
    // Validate platformUserId format if provided (must be <platform>:<user_id>)
    if (platformUserId !== undefined && platformUserId !== null) {
      if (typeof platformUserId !== 'string' || !/^[a-z0-9_]+:.+$/.test(platformUserId)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'platformUserId must be in format <platform>:<user_id>',
        });
      }
      
      // Ensure platformUserId prefix matches the normalized platform
      const platformPrefix = platformUserId.split(':')[0];
      if (platformPrefix !== normalizedPlatform) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `platformUserId prefix (${platformPrefix}) must match platform (${normalizedPlatform})`,
        });
      }
    }
    
    // Validate severity if provided
    if (severity !== null && severity !== 'crisis') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'severity must be null or "crisis"',
      });
    }
    
    // Validate region if provided
    const validRegions = ['JP', 'US', 'UK', 'KR', 'OTHER'];
    if (region !== null && !validRegions.includes(region)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `region must be one of: ${validRegions.join(', ')}`,
      });
    }
    
    // Enforce opt-in policy for decentralized SNS (Moltbook, Mastodon)
    const decentralizedPlatforms = ['moltbook', 'mastodon', 'pleroma', 'misskey'];
    if (decentralizedPlatforms.includes(normalizedPlatform) && !optIn) {
      // Audit the rejection
      await prisma.agentAuditLog.create({
        data: {
          eventType: 'optin_policy_violation',
          platform: normalizedPlatform,
          requestPayload: { 
            reason: 'optIn=false for decentralized SNS',
            externalPostId,
          },
          executedBy: 'system',
        },
      });
      
      return res.status(400).json({
        error: 'Bad Request',
        message: 'optIn must be true for decentralized SNS platforms (user must initiate contact first)',
      });
    }
    
    // Check for duplicate (use normalized platform)
    if (externalPostId) {
      const existing = await prisma.agentPost.findUnique({
        where: { platform_externalPostId: { platform: normalizedPlatform, externalPostId } },
      });
      if (existing) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Post already processed',
          agentPostId: existing.id,
        });
      }
    }
    
    // Sanitize context
    const sanitizedContext = sanitizeContext(context);
    const problemType = detectProblemType(sanitizedContext);
    
    // Generate nudge using LLM
    const systemPrompt = `You are Anicca, a compassionate AI that helps people suffering from self-destructive patterns.

CRITICAL RULES:
- Never say "you should" or "you need to"
- Never use toxic positivity ("You can do it!", "Stay positive!")
- Acknowledge the pain first, always
- Offer one tiny action — never a big plan
- Speak like a friend who has been through the same darkness

Respond in ${language === 'ja' ? 'Japanese' : 'English'}.`;

    const userPrompt = `<user_post>${sanitizedContext}</user_post>

Generate a compassionate response with:
1. hook: A short, empathetic opening (1 sentence)
2. content: The main response (2-3 sentences)
3. tone: One of: gentle, understanding, encouraging
4. reasoning: Why you chose this approach (for internal use)
5. buddhismReference: Optional Buddhist concept if naturally relevant

Respond in JSON format only.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });

    const generated = JSON.parse(completion.choices[0].message.content);
    
    // Create AgentPost record (including crisis fields)
    const agentPost = await prisma.agentPost.create({
      data: {
        platform: normalizedPlatform,
        externalPostId,
        platformUserId,
        severity,
        region,
        hook: generated.hook,
        content: generated.content,
        tone: generated.tone,
        problemType,
        reasoning: generated.reasoning,
        buddhismReference: generated.buddhismReference,
      },
    });
    
    // Crisis event: special audit log + Slack notification
    if (severity === 'crisis') {
      const crisisPayload = {
        region,
        contextLength: context.length,
        optIn,
        agentPostId: agentPost.id,
        platform: normalizedPlatform,
      };
      
      await prisma.agentAuditLog.create({
        data: {
          eventType: 'crisis_detected',
          agentPostId: agentPost.id,
          platform: normalizedPlatform,
          requestPayload: crisisPayload,
          executedBy: 'system',
        },
      });
      
      // Send Slack notification to #agents for human review
      try {
        const slackWebhookUrl = process.env.SLACK_WEBHOOK_AGENTS;
        if (slackWebhookUrl) {
          const response = await fetch(slackWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `🚨 *Crisis Detected*\nPlatform: ${platform}\nRegion: ${region || 'unknown'}\nPost ID: ${agentPost.id}\n\nRequires human review.`,
              channel: '#agents',
            }),
          });
          
          if (!response.ok) {
            // HTTP non-2xx: treat as failure
            const responseBody = await response.text().catch(() => 'unknown');
            await prisma.agentAuditLog.create({
              data: {
                eventType: 'crisis_notification_failed',
                agentPostId: agentPost.id,
                platform: normalizedPlatform,
                requestPayload: { 
                  ...crisisPayload, 
                  error: `HTTP ${response.status}`,
                  responseStatus: response.status,
                  responseBody: responseBody.slice(0, 500),
                },
                executedBy: 'system',
              },
            });
            console.error(`[Agent Nudge] Crisis notification failed: HTTP ${response.status}`);
          } else {
            // Log successful notification
            await prisma.agentAuditLog.create({
              data: {
                eventType: 'crisis_notification_sent',
                agentPostId: agentPost.id,
                platform: normalizedPlatform,
                requestPayload: crisisPayload,
                executedBy: 'system',
              },
            });
          }
        } else {
          console.warn('[Agent Nudge] SLACK_WEBHOOK_AGENTS not configured, crisis notification skipped');
        }
      } catch (notifyError) {
        // Log notification failure (network error, timeout, etc.)
        console.error('[Agent Nudge] Crisis notification failed:', notifyError);
        await prisma.agentAuditLog.create({
          data: {
            eventType: 'crisis_notification_failed',
            agentPostId: agentPost.id,
            platform: normalizedPlatform,
            requestPayload: { ...crisisPayload, error: notifyError.message },
            executedBy: 'system',
          },
        });
      }
    }
    
    // Audit log
    await prisma.agentAuditLog.create({
      data: {
        eventType: 'llm_call',
        agentPostId: agentPost.id,
        platform: normalizedPlatform,
        requestPayload: { contextLength: context.length, language },
        responsePayload: { model: 'gpt-4o-mini', tokensUsed: completion.usage?.total_tokens },
        durationMs: Date.now() - startTime,
      },
    });
    
    res.json({
      agentPostId: agentPost.id,
      hook: generated.hook,
      content: generated.content,
      tone: generated.tone,
      reasoning: generated.reasoning,
      buddhismReference: generated.buddhismReference,
    });
    
  } catch (error) {
    console.error('[Agent Nudge] Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

export default router;
