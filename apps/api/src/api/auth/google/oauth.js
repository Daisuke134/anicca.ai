/**
 * Supabase SDK — 補助サービスとして使用（メインDBではない）
 * メインDB: Railway PostgreSQL（Prisma経由）
 * 用途: Supabase Auth（Google OAuth開始）
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, redirect_uri } = req.query;
    
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

    // Strict redirect_uri validation from Desktop (prevents open redirect)
    let redirectTo = 'http://localhost:8085/auth/callback'; // default fallback
    if (redirect_uri && typeof redirect_uri === 'string') {
      try {
        const u = new URL(redirect_uri);
        const isSchemeOk = (u.protocol === 'http:' || u.protocol === 'https:');
        const isHostOk = (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
        const isPathOk = (u.pathname === '/auth/callback');
        const isPortOk = !u.port || (Number(u.port) > 0 && Number(u.port) < 65536);
        if (isSchemeOk && isHostOk && isPathOk && isPortOk) {
          redirectTo = u.toString();
        } else {
          return res.status(400).json({ error: 'Invalid redirect_uri' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid redirect_uri' });
      }
    }

    // Generate OAuth URL for Google (PKCE Code Flow)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        scopes: 'email profile',
        flowType: 'pkce',
        // 強制的にAuthorization Codeを要求
        queryParams: { access_type: 'offline', prompt: 'consent', response_type: 'code' }
      }
    });

    if (error) {
      console.error('OAuth URL generation error:', error);
      return res.status(500).json({ error: 'Failed to generate OAuth URL' });
    }

    console.log('✅ Generated Google OAuth URL for user:', userId, '→', redirectTo);

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
