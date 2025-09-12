import express from 'express';
import slackToolHandler from '../../api/tools/web/slack.js';

const router = express.Router();

// POST /api/tools/slack
router.post('/', (req, res) => slackToolHandler(req, res));

export default router;

