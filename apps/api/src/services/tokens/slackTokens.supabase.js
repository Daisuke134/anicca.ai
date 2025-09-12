// Slack tokens storage via Supabase (moved from services/storage/database.js)

import { createClient } from '@supabase/supabase-js';

// Supabase client setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

export async function getSlackTokensForUser(userId) {
  try {
    if (!supabase) return null;
    const sessionId = `user_${userId}_slack`;
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    if (error) return null;
    if (!data) return null;
    return {
      bot_token: data.bot_token,
      user_token: data.user_token || null,
      slack_user_id: data.slack_user_id || null,
      userId
    };
  } catch {
    return null;
  }
}

export async function saveSlackTokensForUser(userId, tokens) {
  try {
    if (!supabase) return false;
    const sessionId = `user_${userId}_slack`;
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
    if (error) return false;
    return true;
  } catch {
    return false;
  }
}

export async function saveTokensToDB(userId, tokens) {
  await saveSlackTokensForUser(userId, tokens);
}

export async function loadTokensFromDB(sessionId) {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function loadLatestTokensFromDB() {
  if (global.slackBotToken) {
    return {
      bot_token: global.slackBotToken,
      user_token: global.slackUserToken || null
    };
  }
  return null;
}

export async function initDatabase() {
  console.log('🔧 Database initialized (using tokenStorage)');
  return Promise.resolve();
}

