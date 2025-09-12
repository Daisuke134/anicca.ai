import express from 'express';
import oauthUrlHandler from '../../../api/mcp/gcal/oauth-url.js';
import callbackHandler from '../../../api/mcp/gcal/callback.js';
import statusHandler from '../../../api/mcp/gcal/status.js';
import disconnectHandler from '../../../api/mcp/gcal/disconnect.js';

const router = express.Router();

// GET /api/mcp/gcal/oauth/url
router.get('/oauth/url', (req, res) => oauthUrlHandler(req, res));

// GET /api/mcp/gcal/oauth/callback
router.get('/oauth/callback', (req, res) => callbackHandler(req, res));

// POST /api/mcp/gcal/status
router.post('/status', (req, res) => statusHandler(req, res));

// POST /api/mcp/gcal/disconnect
router.post('/disconnect', (req, res) => disconnectHandler(req, res));

export default router;

