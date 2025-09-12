import express from 'express';
import playwrightHandler from '../../api/tools/web/browser.js';

const router = express.Router();

// Keep compatibility within the new routing layer for now
// POST /api/tools/playwright
router.post('/', (req, res) => playwrightHandler(req, res));

// Optionally accept legacy-style suffixed actions for a transition period
router.post('/navigate', (req, res) => playwrightHandler(req, res));
router.post('/click', (req, res) => playwrightHandler(req, res));
router.post('/type', (req, res) => playwrightHandler(req, res));
router.post('/screenshot', (req, res) => playwrightHandler(req, res));

export default router;

