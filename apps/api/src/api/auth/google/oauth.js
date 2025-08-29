import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Supabase client setup
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate OAuth URL for Google
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `http://localhost:8085/auth/callback`,
        skipBrowserRedirect: true,
        scopes: 'email profile'
      }
    });

    if (error) {
      console.error('OAuth URL generation error:', error);
      return res.status(500).json({ error: 'Failed to generate OAuth URL' });
    }

    console.log('✅ Generated Google OAuth URL for user:', userId);

    return res.status(200).json({
      success: true,
      url: data.url
    });

  } catch (error) {
    console.error('Google OAuth URL generation error:', error);
    res.status(500).json({
      error: 'Failed to generate OAuth URL',
      message: error.message
    });
  }
}