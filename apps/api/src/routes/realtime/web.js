import express from 'express';
import webSessionHandler from '../../api/proxy/realtime/webSession.js';

const router = express.Router();

// GET /api/realtime/web
router.get('/', (req, res) => webSessionHandler(req, res));

export default router;

