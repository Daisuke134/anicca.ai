import express from 'express';
import realtimeRouter from './realtime.js';
import profileRouter from './profile.js';
import entitlementRouter from './entitlement.js';
import accountRouter from './account.js';
import behaviorRouter from './behavior.js';
import feelingRouter from './feeling.js';
import nudgeRouter from './nudge.js';
import dailyMetricsRouter from './dailyMetrics.js';
import preReminderRouter from './preReminder.js';
import sensorsRouter from './sensors.js';

const router = express.Router();

router.use('/realtime', realtimeRouter);
router.use('/profile', profileRouter);
router.use('/entitlement', entitlementRouter);
router.use('/account', accountRouter);
router.use('/behavior', behaviorRouter);
router.use('/feeling', feelingRouter);
router.use('/nudge', nudgeRouter);
router.use('/nudge', preReminderRouter);  // /mobile/nudge/pre-reminder
router.use('/daily_metrics', dailyMetricsRouter);
router.use('/sensors', sensorsRouter);

export default router;
