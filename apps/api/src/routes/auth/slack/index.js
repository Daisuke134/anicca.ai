import express from 'express';
import oauthUrlHandler from '../../../api/auth/slack/oauth-url.js';
import oauthCallbackHandler from '../../../api/auth/slack/oauth-callback.js';
import statusHandler from '../../../api/auth/slack/check-connection.js';

const router = express.Router();

// GET /api/auth/slack/oauth/url
router.get('/oauth/url', (req, res) => oauthUrlHandler(req, res));

// GET /api/auth/slack/oauth/callback
router.get('/oauth/callback', (req, res) => oauthCallbackHandler(req, res));

// GET /api/auth/slack/status
router.get('/status', (req, res) => statusHandler(req, res));

export default router;

