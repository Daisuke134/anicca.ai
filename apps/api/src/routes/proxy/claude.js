import express from 'express';
import claudeHandler from '../../api/proxy/claude.js';

const router = express.Router();

// Proxy all paths under /api/proxy/claude/*
router.all('/*', (req, res) => claudeHandler(req, res));

export default router;

