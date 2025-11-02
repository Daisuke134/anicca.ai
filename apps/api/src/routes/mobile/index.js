import express from 'express';
import rtcRouter from './rtc.js';

const router = express.Router();

router.use('/rtc', rtcRouter);

export default router;
