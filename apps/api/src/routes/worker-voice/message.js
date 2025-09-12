import express from 'express';
import messageHandler from '../../api/worker-voice/message.js';

const router = express.Router();

// POST /api/worker-voice/message
router.all('/', (req, res) => messageHandler(req, res));

export default router;

