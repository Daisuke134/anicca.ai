import express from 'express';
import { z } from 'zod';
import { verifyIdentityToken, warmAppleKeys } from '../../services/auth/appleService.js';
import baseLogger from '../../utils/logger.js';

const router = express.Router();
const logger = baseLogger.withContext('AppleAuth');

const appleAuthSchema = z.object({
  identity_token: z.string(),
  nonce: z.string(),
  user_id: z.string() // Apple's user identifier
});

/**
 * POST /auth/apple
 * Verify Apple identity token and create/update user
 */
router.post('/', async (req, res) => {
  try {
    const normalizedBody = {
      identity_token: req.body.identity_token ?? req.body.identityToken,
      nonce: req.body.nonce ?? req.body.nonceToken ?? req.body.hashedNonce,
      user_id: req.body.user_id ?? req.body.userId ?? req.body.user
    };
    const validationResult = appleAuthSchema.safeParse(normalizedBody);
    
    if (!validationResult.success) {
      logger.warn('Invalid Apple auth payload', validationResult.error);
      return res.status(400).json({ 
        error: 'invalid_request',
        details: validationResult.error.errors 
      });
    }
    
    const { identity_token, nonce, user_id } = validationResult.data;
    
    // Verify identity token
    const verifiedUser = await verifyIdentityToken(identity_token, nonce, user_id);
    
    if (!verifiedUser) {
      logger.warn('Apple token verification failed');
      return res.status(401).json({ error: 'token_verification_failed' });
    }
    
    // Return user ID (internal) and metadata
    return res.json({
      userId: verifiedUser.userId,             // 内部UUID
      appleUserId: verifiedUser.appleUserId,  // デバッグ用
      displayName: verifiedUser.displayName,
      email: verifiedUser.email
    });
  } catch (error) {
    logger.error('Apple auth error', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /auth/apple/health
 * Health check endpoint for warming up Apple auth infrastructure
 */
router.get('/health', async (req, res) => {
  try {
    await warmAppleKeys();
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error('Health check failed', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;

