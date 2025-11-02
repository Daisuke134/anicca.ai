import express from 'express';
import realtimeRouter from './realtime.js';

const router = express.Router();

router.use('/realtime', realtimeRouter);

export default router;
