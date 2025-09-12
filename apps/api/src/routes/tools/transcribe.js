import express from 'express';
import transcribeHandler from '../../api/tools/transcribe.js';

const router = express.Router();

// POST /api/tools/transcribe
router.post('/', (req, res) => transcribeHandler(req, res));

export default router;

