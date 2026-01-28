/**
 * GET /api/mobile/user-type
 *
 * Returns user type classification based on selected ProblemTypes.
 * 4-case logic per db-schema-spec Section 4.
 */

import express from 'express';
import { getUserType } from '../../services/userTypeService.js';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileUserType');

router.get('/', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;

  try {
    const result = await getUserType(userId);

    if (result === null) {
      logger.warn(`User type not found: profile missing for ${userId}`);
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to get user type', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
