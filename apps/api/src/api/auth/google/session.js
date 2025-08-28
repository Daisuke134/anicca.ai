import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { access_token, refresh_token } = req.body;
    
    if (!access_token || !refresh_token) {
      return res.status(400).json({ error: 'Access token and refresh token are required' });
    }

    // Supabase client setup
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Set session
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token
    });

    if (error) {
      console.error('Session validation error:', error);
      return res.status(401).json({ error: 'Invalid session' });
    }

    console.log('✅ Session validated successfully');

    // Return updated session data
    return res.status(200).json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        user: {
          id: data.user.id,
          email: data.user.email,
          user_metadata: data.user.user_metadata
        }
      }
    });

  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({
      error: 'Failed to validate session',
      message: error.message
    });
  }
}