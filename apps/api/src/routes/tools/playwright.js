import express from 'express';
import playwrightHandler from '../../api/tools/web/browser.js';

const router = express.Router();

// Keep compatibility within the new routing layer for now
// POST /api/tools/playwright
router.post('/', (req, res) => playwrightHandler(req, res));

export default router;
