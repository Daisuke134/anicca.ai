import express from 'express';
import entitlementHandler from '../../api/auth/entitlement.js';

const router = express.Router();

// POST /api/auth/entitlement
router.post('/', (req, res) => entitlementHandler(req, res));

export default router;

