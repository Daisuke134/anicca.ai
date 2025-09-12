import express from 'express';
import claudeCodeHandler from '../../api/tools/sdk/claude-code.js';

const router = express.Router();

// POST /api/tools/claude_code
router.post('/', (req, res) => claudeCodeHandler(req, res));

export default router;

