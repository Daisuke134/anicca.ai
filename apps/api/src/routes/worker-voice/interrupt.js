import express from 'express';
import interruptHandler from '../../api/worker-voice/interrupt.js';

const router = express.Router();

// POST /api/worker-voice/interrupt
router.all('/', (req, res) => interruptHandler(req, res));

export default router;

