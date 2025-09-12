import crypto from 'crypto';
import axios from 'axios';
// import { saveTokens } from '../../services/tokenStorage.js'; // Removed in Phase 1
import { saveTokensToDB } from '../../../services/tokens/slackTokens.supabase.js';
import { PROXY_BASE_URL as FULL_PROXY_BASE_URL, WEB_CONFIG } from '../../../config/environment.js';

// プロキシベースURL（ホスト部分のみ）
const PROXY_BASE_URL = FULL_PROXY_BASE_URL.replace(/^https?:\/\//, '');

// 暗号化キー（本番環境では環境変数から取得）
if (!process.env.SLACK_TOKEN_ENCRYPTION_KEY) {
  throw new Error('SLACK_TOKEN_ENCRYPTION_KEY is required for Slack token encryption');
}
const ENCRYPTION_KEY = Buffer.from(process.env.SLACK_TOKEN_ENCRYPTION_KEY, 'hex');
const IV_LENGTH = 16;

// 暗号化関数
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error } = req.query;
    
    // エラーチェック
    if (error) {
      console.error('❌ Slack OAuth error:', error);
      const redirectUrl = WEB_CONFIG.ANICCA_WEB_URL;
      return res.redirect(`${redirectUrl}?error=true&service=slack&message=${encodeURIComponent(error)}`);
    }
    
    if (!code) {
      throw new Error('No authorization code received');
    }
    
    console.log('📝 Exchanging code for token...');
    
    // Slack APIを直接呼び出してトークンを取得
    const tokenResponse = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code: code,
        // 動的にリダイレクトURIを生成（リクエストから判定）
        redirect_uri: (() => {
          const host = req.headers.host || PROXY_BASE_URL;
          const protocol = req.headers['x-forwarded-proto'] || 'https';
          return `${protocol}://${host}/api/slack/oauth-callback`;
        })()
      }
    });
    
    const data = tokenResponse.data;
    
    if (!data.ok) {
      throw new Error(data.error || 'Failed to exchange code for token');
    }
    
    console.log('✅ Slack OAuth successful');
    
    // トークンを取得
    const botToken = data.access_token;
    const userToken = data.authed_user?.access_token;
    
    // auth.testを使ってSlackユーザーIDを取得
    let slackUserId = null;
    if (botToken) {
      try {
        const authTestResponse = await fetch('https://slack.com/api/auth.test', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${botToken}`
          }
        });
        
        const authTestData = await authTestResponse.json();
        if (authTestData.ok) {
          slackUserId = authTestData.user_id;
          console.log('✅ Retrieved Slack user ID:', slackUserId);
        } else {
          console.error('❌ Failed to get Slack user ID:', authTestData.error);
        }
      } catch (error) {
        console.error('❌ Error calling auth.test:', error);
      }
    }
    
    // トークンを暗号化して保存
    const teamId = data.team?.id || 'default';
    
    if (botToken) {
      global.slackBotToken = encrypt(botToken);
      process.env.SLACK_BOT_TOKEN = botToken; // MCPサーバー用に環境変数も設定
    }
    if (userToken) {
      global.slackUserToken = encrypt(userToken);
      process.env.SLACK_USER_TOKEN = userToken;
    }
    
    // stateからsessionIdとuserIdを取得
    let sessionId, userId, platform;
    try {
      // stateがJSON形式の場合（新しい形式）
      const stateData = JSON.parse(state);
      sessionId = stateData.sessionId;
      userId = stateData.userId;
      platform = stateData.platform || 'web';
    } catch (e) {
      // stateが単純な文字列の場合（後方互換性）
      sessionId = state || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      userId = null;
      platform = 'web';
    }
    
    // トークンを永続化（ファイルとDBに保存）
    const tokenData = {
      bot_token: encrypt(botToken),
      user_token: userToken ? encrypt(userToken) : null,
      team_id: teamId,
      team_name: data.team?.name,
      authed_user: data.authed_user,
      user_id: userId, // ユーザーIDを追加
      slack_user_id: slackUserId, // SlackユーザーIDを追加
      created_at: new Date().toISOString()
    };
    
    // ファイルに保存（後方互換性のため）
    // await saveTokens(teamId, tokenData); // TODO: saveTokens関数が未定義
    
    // データベースに保存
    if (userId) {
      // userIdのみを渡す（saveSlackTokensForUserが自動的にプレフィックスを追加する）
      await saveTokensToDB(userId, tokenData);
      console.log('✅ Saved tokens for user:', userId);
    } else {
      // userIdがない場合のみ一時的なセッションIDで保存
      await saveTokensToDB(sessionId, tokenData);
      console.log('⚠️ Saved tokens with temporary session ID:', sessionId);
    }
    
    // インストール情報を保存（メモリベース）
    global.slackInstallations = global.slackInstallations || {};
    global.slackInstallations[teamId] = data;
    global.currentSessionId = sessionId; // 現在のセッションIDを保存
    console.log('✅ Slack installation stored for team:', teamId);
    
    // platformに基づいてレスポンスを分岐
    if (platform === 'desktop') {
      // Desktop版用の成功ページを表示
      const successHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slack認証完了 - Anicca</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #1a1a1a;
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .checkmark {
      font-size: 64px;
      color: #4CAF50;
      margin-bottom: 1rem;
      animation: scaleIn 0.5s ease-out;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 1rem 0;
    }
    p {
      color: #888;
      margin: 0.5rem 0;
    }
    .team-info {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #2a2a2a;
      border-radius: 8px;
    }
    @keyframes scaleIn {
      from {
        transform: scale(0);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">✅</div>
    <h1>Slack認証が完了しました！</h1>
    <p>Aniccaとの連携が正常に完了しました</p>
    ${data.team?.name ? `
    <div class="team-info">
      <p>接続先: <strong>${data.team.name}</strong></p>
    </div>
    ` : ''}
    <p style="margin-top: 2rem; font-size: 14px;">このタブは自動的に閉じます...</p>
  </div>
  <script>
    // 3秒後に自動的にタブを閉じる
    setTimeout(() => {
      window.close();
      // window.close()が効かない場合のフォールバック
      document.body.innerHTML = '<div style="text-align: center; padding: 2rem;"><h2>認証が完了しました</h2><p>このタブを閉じてAniccaに戻ってください</p></div>';
    }, 3000);
  </script>
</body>
</html>
      `;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(successHtml);
      return; // Desktop版はここで処理を終了
    } else {
      // Web版用の従来のリダイレクト処理
      // デバッグログを追加
      console.log('🔍 OAuth callback redirect debug:');
      console.log('  - NODE_ENV:', process.env.NODE_ENV);
      console.log('  - ANICCA_WEB_URL:', WEB_CONFIG.ANICCA_WEB_URL);
      console.log('  - userId:', userId);
      console.log('  - state:', state);
      
      let redirectUrl = WEB_CONFIG.ANICCA_WEB_URL;
      
      // stateにredirectUrlが含まれている場合は優先的に使用
      try {
        const stateData = JSON.parse(state);
        console.log('  - stateData:', stateData);
        if (stateData.redirectUrl) {
          redirectUrl = stateData.redirectUrl;
          console.log('  - Using redirectUrl from state:', redirectUrl);
        }
      } catch (e) {
        // stateがJSON形式でない場合
        console.log('  - State is not JSON format');
      }
      
      console.log('  - Final redirectUrl:', redirectUrl);
      
      res.redirect(`${redirectUrl}?success=true&service=slack&sessionId=${sessionId}`);
    }
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    const redirectUrl = WEB_CONFIG.ANICCA_WEB_URL;
    res.redirect(`${redirectUrl}?error=true&service=slack&message=${encodeURIComponent(error.message)}`);
  }
}
