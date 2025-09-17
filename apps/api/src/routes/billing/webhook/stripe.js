import express from 'express';
import webhookHandler from '../../../api/billing/webhookStripe.js';

const router = express.Router();

router.post('/', async (req, res) => webhookHandler(req, res));

export default router;
