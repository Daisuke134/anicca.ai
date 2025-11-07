import express from 'express';
import { z } from 'zod';
import { getProfile, upsertProfile } from '../../services/mobile/profileService.js';
import baseLogger from '../../utils/logger.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileProfile');

// Validation schema
const profileSchema = z.object({
  displayName: z.string().optional(),
  preferredLanguage: z.enum(['ja', 'en']).optional(),
  sleepLocation: z.string().optional(),
  trainingFocus: z.array(z.string()).optional()
});

/**
 * GET /mobile/profile
 * Get user profile by device ID
 */
router.get('/', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = (req.get('user-id') || '').toString().trim();
  
  if (!deviceId) {
    logger.warn('Missing device-id header');
    return res.status(400).json({ error: 'device-id is required' });
  }
  
  if (!userId) {
    logger.warn('Missing user-id header');
    return res.status(401).json({ error: 'user-id is required' });
  }
  
  try {
    const profileData = await getProfile(deviceId);
    
    if (!profileData) {
      // Return default empty profile
      return res.json({
        displayName: '',
        preferredLanguage: 'en',
        sleepLocation: '',
        trainingFocus: []
      });
    }
    
    // Merge profile JSONB with defaults
    // Priority: profile.preferredLanguage > mobile_profiles.language > user_settings.language > 'en'
    const profile = profileData.profile || {};
    const preferredLanguage = profile.preferredLanguage || 
                              profileData.language || 
                              profileData.userSettingsLanguage || 
                              'en';
    
    return res.json({
      displayName: profile.displayName || '',
      preferredLanguage: preferredLanguage,
      sleepLocation: profile.sleepLocation || '',
      trainingFocus: profile.trainingFocus || []
    });
  } catch (error) {
    logger.error('Failed to get profile', error);
    return res.status(500).json({ error: 'failed_to_get_profile' });
  }
});

/**
 * PUT /mobile/profile
 * Upsert user profile
 */
router.put('/', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = (req.get('user-id') || '').toString().trim();
  
  if (!deviceId) {
    logger.warn('Missing device-id header');
    return res.status(400).json({ error: 'device-id is required' });
  }
  
  if (!userId) {
    logger.warn('Missing user-id header');
    return res.status(401).json({ error: 'user-id is required' });
  }
  
  try {
    const validationResult = profileSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      logger.warn('Invalid profile data', validationResult.error);
      return res.status(400).json({ 
        error: 'invalid_profile_data',
        details: validationResult.error.errors 
      });
    }
    
    const profileData = validationResult.data;
    const language = profileData.preferredLanguage || 'en';
    
    await upsertProfile({
      deviceId,
      userId,
      profile: profileData,
      language
    });
    
    return res.json({ success: true });
  } catch (error) {
    logger.error('Failed to upsert profile', error);
    return res.status(500).json({ error: 'failed_to_upsert_profile' });
  }
});

export default router;

