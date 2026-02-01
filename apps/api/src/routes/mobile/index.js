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

export default router;
