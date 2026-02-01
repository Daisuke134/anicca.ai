import express from 'express';
import prisma from '../../lib/prisma.js';
import requireInternalAuth from '../../middleware/requireInternalAuth.js';
import baseLogger from '../../utils/logger.js';

const router = express.Router();
const logger = baseLogger.withContext('AdminXPosts');

router.use(requireInternalAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// =============================================================================
// GET /api/admin/x/pending
// Fetch today's Commander-generated xPosts from notification_schedules
// Used by: X Agent GHA to get content to post
// =============================================================================
router.get('/pending', async (req, res) => {
  try {
    // Get most recent notification_schedule with xPosts
    const schedules = await prisma.notificationSchedule.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const xPosts = [];
    for (const s of schedules) {
      const raw = s.agentRawOutput;
      if (raw && Array.isArray(raw.xPosts)) {
        for (const xp of raw.xPosts) {
          xPosts.push({
            text: xp.text,
            reasoning: xp.reasoning,
            sourceUserId: s.userId,
            scheduleId: s.id,
          });
        }
      }
    }

    // Deduplicate by text
    const seen = new Set();
    const unique = xPosts.filter((p) => {
      if (seen.has(p.text)) return false;
      seen.add(p.text);
      return true;
    });

    res.json({ xPosts: unique.slice(0, 10) });
  } catch (error) {
    logger.error('Failed to fetch pending x posts', error);
    res.status(500).json({ error: 'Failed to fetch pending x posts' });
  }
});

// =============================================================================
// POST /api/admin/x/posts
// Save a posted X/Twitter record
// Used by: X Agent GHA after posting via Blotato
// =============================================================================
router.post('/posts', async (req, res) => {
  try {
    const { hook_candidate_id, x_post_id, text, agent_reasoning, posted_at } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' });
    }
    if (text.length > 280) {
      return res.status(400).json({ error: 'text exceeds 280 characters' });
    }
    if (hook_candidate_id && !UUID_RE.test(hook_candidate_id)) {
      return res.status(400).json({ error: 'hook_candidate_id must be a valid UUID' });
    }

    // Duplicate guard: check x_post_id
    if (x_post_id) {
      const existing = await prisma.xPost.findUnique({ where: { xPostId: x_post_id } });
      if (existing) {
        return res.status(409).json({ error: 'X post already recorded', existing_id: existing.id });
      }
    }

    const post = await prisma.xPost.create({
      data: {
        hookCandidateId: hook_candidate_id || null,
        xPostId: x_post_id || null,
        text,
        agentReasoning: agent_reasoning || null,
        postedAt: posted_at ? new Date(posted_at) : new Date(),
      },
    });

    logger.info(`X post saved: ${post.id}`);
    res.json({ success: true, record_id: post.id });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicate X post (DB constraint)' });
    }
    logger.error('Failed to save x post record', error);
    res.status(500).json({ error: 'Failed to save x post record' });
  }
});

// =============================================================================
// GET /api/admin/x/recent-posts
// Fetch recent X posts with metrics
// Used by: X Agent for performance review
// =============================================================================
router.get('/recent-posts', async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 30);

    const posts = await prisma.xPost.findMany({
      where: {
        postedAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      },
      orderBy: { postedAt: 'desc' },
      include: { hookCandidate: { select: { text: true, tone: true } } },
    });

    const result = posts.map((p) => ({
      id: p.id,
      text: p.text,
      x_post_id: p.xPostId,
      posted_at: p.postedAt,
      impression_count: Number(p.impressionCount ?? 0),
      like_count: Number(p.likeCount ?? 0),
      retweet_count: Number(p.retweetCount ?? 0),
      reply_count: Number(p.replyCount ?? 0),
      engagement_rate: Number(p.engagementRate ?? 0),
      agent_reasoning: p.agentReasoning,
      hook: p.hookCandidate
        ? { text: p.hookCandidate.text, tone: p.hookCandidate.tone }
        : null,
    }));

    res.json({ posts: result });
  } catch (error) {
    logger.error('Failed to fetch recent x posts', error);
    res.status(500).json({ error: 'Failed to fetch recent x posts' });
  }
});

// =============================================================================
// PUT /api/admin/x/posts/:id/metrics
// Update X post metrics
// Used by: metrics fetcher script
// =============================================================================
router.put('/posts/:id/metrics', async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'id must be a valid UUID' });
    }

    const { impression_count, like_count, retweet_count, reply_count } = req.body;

    const MAX_METRIC = 1_000_000_000;
    const metrics = { impression_count, like_count, retweet_count, reply_count };
    for (const [key, val] of Object.entries(metrics)) {
      if (val === undefined || val === null) continue;
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > MAX_METRIC) {
        return res.status(400).json({ error: `${key} must be integer 0-${MAX_METRIC}` });
      }
    }

    const impressions = impression_count ?? 0;
    const likes = like_count ?? 0;
    const retweets = retweet_count ?? 0;
    const replies = reply_count ?? 0;
    const totalEngagements = likes + retweets + replies;
    const engagementRate = impressions > 0 ? totalEngagements / impressions : 0;

    await prisma.xPost.update({
      where: { id },
      data: {
        impressionCount: BigInt(impressions),
        likeCount: BigInt(likes),
        retweetCount: BigInt(retweets),
        replyCount: BigInt(replies),
        engagementRate,
        metricsFetchedAt: new Date(),
      },
    });

    logger.info(`X post metrics updated: ${id}`);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'X post not found' });
    }
    logger.error('Failed to update x post metrics', error);
    res.status(500).json({ error: 'Failed to update x post metrics' });
  }
});

export default router;
