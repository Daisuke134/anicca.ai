import express from 'express';
import elevenLabsHandler from '../../api/mcp/elevenlabs.js';

const router = express.Router();

// POST /api/mcp/elevenlabs
router.post('/', (req, res) => elevenLabsHandler(req, res));

export default router;

