import express from 'express';
import realtimeRouter from './realtime.js';
import profileRouter from './profile.js';

const router = express.Router();

router.use('/realtime', realtimeRouter);
router.use('/profile', profileRouter);

export default router;
