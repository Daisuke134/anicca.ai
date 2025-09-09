// Database service for managing user data and Slack tokens

import { createClient } from '@supabase/supabase-js';

// Supabase client setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/**
 * Get Slack tokens for a specific user
 * @param {string} userId - The user ID
 * @returns {Promise<{bot_token: string, user_token: string, userId: string} | null>}
 */
export async function getSlackTokensForUser(userId) {
  try {
    console.log('🔍 Getting Slack tokens for user:', userId);
    
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return null;
    }
    
    // Try to get from Supabase
    const sessionId = `user_${userId}_slack`;
    
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    
    if (error) {
      console.log('❌ Error fetching from Supabase:', error.message);
      return null;
    }
    
    if (data && data.bot_token) {
      console.log('✅ Found Slack tokens in Supabase');
      return {
        bot_token: data.bot_token,
        user_token: data.user_token || null,
        slack_user_id: data.slack_user_id || null,
        userId: userId
      };
    }
    
    console.log('❌ No Slack tokens found for user');
    return null;
  } catch (error) {
    console.error('❌ Error getting Slack tokens:', error);
    return null;
  }
}

/**
 * Save Slack tokens for a specific user
 * @param {string} userId - The user ID
 * @param {object} tokens - The tokens object
 * @returns {Promise<boolean>}
 */
export async function saveSlackTokensForUser(userId, tokens) {
  try {
    console.log('💾 Saving Slack tokens for user:', userId);
    
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return false;
    }
    
    const sessionId = `user_${userId}_slack`;
    
    // Upsert (insert or update) tokens
    const { error } = await supabase
      .from('tokens')
      .upsert({
        id: sessionId,
        session_id: sessionId,
        bot_token: tokens.bot_token,
        user_token: tokens.user_token || null,
        slack_user_id: tokens.slack_user_id || null,
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('❌ Error saving to Supabase:', error);
      return false;
    }
    
    console.log('✅ Slack tokens saved to Supabase');
    return true;
  } catch (error) {
    console.error('❌ Error saving Slack tokens:', error);
    return false;
  }
}

/**
 * Save tokens to database (alias for saveSlackTokensForUser)
 * @param {string} userId - The user ID
 * @param {object} tokens - The tokens object
 * @returns {Promise<void>}
 */
export async function saveTokensToDB(userId, tokens) {
  await saveSlackTokensForUser(userId, tokens);
}

/**
 * Load tokens from database by sessionId
 * @param {string} sessionId - The session ID
 * @returns {Promise<object|null>}
 */
export async function loadTokensFromDB(sessionId) {
  try {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return null;
    }
    
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    
    if (error) {
      console.log('❌ Error loading from Supabase:', error.message);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('❌ Error loading tokens:', error);
    return null;
  }
}

/**
 * Load latest tokens from database (for backward compatibility)
 * @returns {Promise<object|null>}
 */
export async function loadLatestTokensFromDB() {
  try {
    // For backward compatibility, return global tokens if available
    if (global.slackBotToken) {
      return {
        bot_token: global.slackBotToken,
        user_token: global.slackUserToken || null
      };
    }
    return null;
  } catch (error) {
    console.error('❌ Error loading latest tokens:', error);
    return null;
  }
}

/**
 * Initialize database (no-op for this implementation)
 * @returns {Promise<void>}
 */
export async function initDatabase() {
  console.log('🔧 Database initialized (using tokenStorage)');
  return Promise.resolve();
}