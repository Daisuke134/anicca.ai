/**
 * GET /api/agent/posts/recent
 * 
 * Get recent agent posts for feedback-fetch skill
 */

import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';

const router = Router();

const ALLOWED_PLATFORMS = ['moltbook', 'slack', 'x', 'tiktok', 'instagram'];
const MAX_DAYS = 30;
const MAX_LIMIT = 100;

router.get('/recent', async (req, res) => {
  try {
    const { platform, days = 7, limit = 50, cursor } = req.query;
    
    // Validate platform
    if (platform !== undefined) {
      const normalizedPlatform = String(platform).trim().toLowerCase();
      if (!ALLOWED_PLATFORMS.includes(normalizedPlatform)) {
        return res.status(400).json({
          error: 'INVALID_PLATFORM',
          message: `Invalid platform: ${platform}. Must be one of: ${ALLOWED_PLATFORMS.join(', ')}`,
        });
      }
    }
    
    // Validate days
    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > MAX_DAYS) {
      return res.status(400).json({
        error: 'INVALID_DAYS',
        message: `days must be between 1 and ${MAX_DAYS}`,
      });
    }
    
    // Validate limit
    const limitNum = Math.min(parseInt(limit, 10) || 50, MAX_LIMIT);
    
    // Build where clause
    const since = new Date();
    since.setDate(since.getDate() - daysNum);
    
    const where = {
      createdAt: { gte: since },
    };
    
    if (platform) {
      where.platform = String(platform).trim().toLowerCase();
    }
    
    if (cursor) {
      where.id = { lt: cursor };
    }
    
    // Query posts
    const posts = await prisma.agentPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limitNum + 1, // +1 to check if there are more
      select: {
        id: true,
        platform: true,
        externalPostId: true,
        content: true,
        upvotes: true,
        views: true,
        likes: true,
        shares: true,
        createdAt: true,
      },
    });
    
    // Check if there are more results
    const hasMore = posts.length > limitNum;
    const results = hasMore ? posts.slice(0, limitNum) : posts;
    const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].id : null;
    
    res.json({
      posts: results,
      nextCursor,
      hasMore,
    });
    
  } catch (error) {
    console.error('[Agent Posts] Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

export default router;
