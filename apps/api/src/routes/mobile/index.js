import express from 'express';
import realtimeRouter from './realtime.js';
import profileRouter from './profile.js';
import entitlementRouter from './entitlement.js';
import accountRouter from './account.js';
import behaviorRouter from './behavior.js';
import nudgeRouter from './nudge.js';
import preReminderRouter from './preReminder.js';
import userTypeRouter from './userType.js';

const router = express.Router();

router.use('/realtime', realtimeRouter);
router.use('/profile', profileRouter);
router.use('/user-type', userTypeRouter);
router.use('/entitlement', entitlementRouter);
router.use('/account', accountRouter);
router.use('/behavior', behaviorRouter);
router.use('/nudge', nudgeRouter);
router.use('/nudge', preReminderRouter);  // /mobile/nudge/pre-reminder

// Backward-compat: removed endpoints kept as 410 for old clients
router.post('/feeling/start', (_req, res) => res.status(410).json({ error: { code: 'GONE', message: 'Feeling endpoints removed in v1.5.0' } }));
router.post('/feeling/end', (_req, res) => res.status(410).json({ error: { code: 'GONE', message: 'Feeling endpoints removed in v1.5.0' } }));
router.use('/sensors', (_req, res) => res.status(410).json({ error: { code: 'GONE', message: 'Sensor endpoints removed in v1.5.0' } }));
router.use('/daily-metrics', (_req, res) => res.status(410).json({ error: { code: 'GONE', message: 'Daily metrics endpoints removed in v1.5.0' } }));
router.use('/daily_metrics', (_req, res) => res.status(410).json({ error: { code: 'GONE', message: 'Daily metrics endpoints removed in v1.5.0' } }));

export default router;
