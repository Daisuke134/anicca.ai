import express from 'express';
import oauthUrlHandler from '../../../api/auth/google/oauth.js';
import callbackHandler from '../../../api/auth/google/callback.js';
import refreshHandler from '../../../api/auth/google/refresh.js';

const router = express.Router();

// GET /api/auth/google/oauth/url
router.get('/oauth/url', (req, res) => oauthUrlHandler(req, res));

// POST /api/auth/google/oauth/callback
router.post('/oauth/callback', (req, res) => callbackHandler(req, res));

// POST /api/auth/google/refresh
router.post('/refresh', (req, res) => refreshHandler(req, res));

export default router;

