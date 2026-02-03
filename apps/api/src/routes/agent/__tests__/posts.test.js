/**
 * Posts API Tests (1.6.1)
 * 
 * Tests for GET /api/agent/posts/recent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Set env before importing router
process.env.ANICCA_AGENT_TOKEN = 'test-token-12345';

// Mock auth middleware
vi.mock('../../../middleware/requireAgentAuth.js', () => ({
  requireAgentAuth: (req, res, next) => {
    req.agentAuth = { tokenType: 'current' };
    next();
  },
}));

// Mock Prisma
vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    agentPost: {
      findMany: vi.fn(),
    },
  },
}));

import postsRouter from '../posts.js';
import { prisma } from '../../../lib/prisma.js';

// Create test app
const app = express();
app.use(express.json());
app.use('/posts', postsRouter);

describe('GET /posts/recent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return recent posts with default parameters', async () => {
    const mockPosts = [
      {
        id: 'uuid-1',
        platform: 'moltbook',
        externalPostId: 'ext-1',
        content: 'Test content',
        upvotes: 5,
        views: null,
        likes: 0,
        shares: 0,
        createdAt: new Date(),
      },
    ];
    prisma.agentPost.findMany.mockResolvedValue(mockPosts);

    const res = await request(app).get('/posts/recent');

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.nextCursor).toBe(null);
  });

  it('should filter by platform', async () => {
    prisma.agentPost.findMany.mockResolvedValue([]);

    const res = await request(app).get('/posts/recent?platform=moltbook');

    expect(res.status).toBe(200);
    expect(prisma.agentPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          platform: 'moltbook',
        }),
      })
    );
  });

  it('should reject invalid platform', async () => {
    const res = await request(app).get('/posts/recent?platform=invalid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_PLATFORM');
  });

  it('should reject invalid days (too high)', async () => {
    const res = await request(app).get('/posts/recent?days=31');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_DAYS');
  });

  it('should reject invalid days (too low)', async () => {
    const res = await request(app).get('/posts/recent?days=0');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_DAYS');
  });

  it('should handle pagination with cursor', async () => {
    const mockPosts = [
      { id: 'uuid-2', platform: 'moltbook', createdAt: new Date() },
      { id: 'uuid-3', platform: 'moltbook', createdAt: new Date() },
    ];
    prisma.agentPost.findMany.mockResolvedValue(mockPosts);

    const res = await request(app).get('/posts/recent?cursor=uuid-1');

    expect(res.status).toBe(200);
    expect(prisma.agentPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { lt: 'uuid-1' },
        }),
      })
    );
  });

  it('should indicate hasMore when more results exist', async () => {
    // Return 51 posts (limit is 50 by default)
    const mockPosts = Array(51).fill(null).map((_, i) => ({
      id: `uuid-${i}`,
      platform: 'moltbook',
      createdAt: new Date(),
    }));
    prisma.agentPost.findMany.mockResolvedValue(mockPosts);

    const res = await request(app).get('/posts/recent');

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(50);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.nextCursor).toBe('uuid-49');
  });

  it('should respect custom limit', async () => {
    prisma.agentPost.findMany.mockResolvedValue([]);

    await request(app).get('/posts/recent?limit=10');

    expect(prisma.agentPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 11, // +1 for hasMore check
      })
    );
  });

  it('should cap limit at 100', async () => {
    prisma.agentPost.findMany.mockResolvedValue([]);

    await request(app).get('/posts/recent?limit=200');

    expect(prisma.agentPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 101, // 100 + 1
      })
    );
  });
});
