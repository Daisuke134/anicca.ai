/**
 * Agent API Routes (1.6.1)
 * 
 * Endpoints for Anicca Agent (OpenClaw/VPS):
 * - POST /api/agent/nudge - Generate nudge for external platform
 * - GET  /api/agent/wisdom - Get wisdom content
 * - POST /api/agent/feedback - Save feedback from platform
 * - POST /api/agent/content - Generate platform-specific content
 */

import { Router } from 'express';
import { requireAgentAuth } from '../../middleware/requireAgentAuth.js';
import nudgeRouter from './nudge.js';
import wisdomRouter from './wisdom.js';
import feedbackRouter from './feedback.js';
import contentRouter from './content.js';

const router = Router();

// Apply agent auth to all routes
router.use(requireAgentAuth);

// Mount sub-routers
router.use('/nudge', nudgeRouter);
router.use('/wisdom', wisdomRouter);
router.use('/feedback', feedbackRouter);
router.use('/content', contentRouter);

export default router;
