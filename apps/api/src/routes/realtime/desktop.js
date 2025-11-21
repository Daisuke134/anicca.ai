import express from 'express';
import desktopSessionHandler from '../../api/proxy/realtime/desktopSession.js';
import desktopStopHandler from '../../api/proxy/realtime/desktopStop.js';

const router = express.Router();

// GET /api/realtime/desktop
router.get('/', (req, res) => desktopSessionHandler(req, res));
// POST /api/realtime/desktop/stop
router.post('/stop', (req, res) => desktopStopHandler(req, res));

export default router;

