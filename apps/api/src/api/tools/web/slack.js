import { WebClient } from '@slack/web-api';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getSlackTokensForUser } from '../../../services/tokens/slackTokens.supabase.js';
import logger from '../../../utils/logger.js';

// スレッド返信用のts記憶
const recentThreadTs = new Map();

// 復号化関数
if (!process.env.SLACK_TOKEN_ENCRYPTION_KEY) {
  throw new Error('SLACK_TOKEN_ENCRYPTION_KEY is required for Slack token decryption');
}
const ENCRYPTION_KEY = Buffer.from(process.env.SLACK_TOKEN_ENCRYPTION_KEY, 'hex');

function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}


export default async function handler(req, res) {
  // CORSはグローバルで対応（server.js）。個別設定は撤去予定。

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { action, arguments: args, userId } = req.body;

    // 認可強化: JWTのsubとuserIdの一致を強制（TOOLS_AUTH_STRICT=true のとき）
    try {
      const strict = String(process.env.TOOLS_AUTH_STRICT || '').toLowerCase() === 'true';
      if (strict) {
        const authSub = auth.sub || null;
        if (!authSub) {
          return res.status(401).json({ error: 'Unauthorized: missing auth subject' });
        }
        if (!userId) {
          return res.status(400).json({ error: 'Bad Request: userId is required' });
        }
        if (authSub !== userId) {
          return res.status(403).json({ error: 'Forbidden: token.sub does not match userId' });
        }
      }
    } catch (authCheckErr) {
      logger.warn(`Slack auth check warning: ${authCheckErr?.message || String(authCheckErr)}`);
    }
    
    logger.info('Slack tool request', { 
      action, 
      args, 
      userId,
      hasUserId: !!userId,
      userIdType: typeof userId,
      requestBody: req.body 
    });
    
    
    // userIdがある場合はデータベースからトークンを取得
    let botToken, userToken, slackUserId;
    
    if (userId) {
      logger.debug(`Looking up tokens for userId: ${userId}`);
      const userTokens = await getSlackTokensForUser(userId);
      logger.debug('Token lookup result:', {
        found: !!userTokens,
        hasBotToken: !!userTokens?.bot_token,
        hasUserToken: !!userTokens?.user_token,
        hasSlackUserId: !!userTokens?.slack_user_id
      });
      if (userTokens) {
        botToken = userTokens.bot_token;
        userToken = userTokens.user_token;
        slackUserId = userTokens.slack_user_id; // Store slack_user_id here
        logger.info(`Retrieved tokens for user: ${userId}`);
      } else {
        logger.warn(`No tokens found for user: ${userId}`);
      }
    } else {
      logger.warn('No userId provided in request');
    }
    
    // フォールバック：環境変数またはグローバル変数
    if (!botToken) {
      botToken = process.env.SLACK_BOT_TOKEN || global.slackBotToken;
      userToken = process.env.SLACK_USER_TOKEN || global.slackUserToken;
    }
    
    logger.debug(`Token check - Bot: ${!!botToken} User: ${!!userToken}`);
    
    if (!botToken) {
      logger.error('No bot token available:', {
        userId: userId || 'none',
        hasEnvToken: !!process.env.SLACK_BOT_TOKEN,
        hasGlobalToken: !!global.slackBotToken
      });
      throw new Error('Slack is not connected. Please reconnect your Slack account.');
    }
    
    if (botToken && botToken.includes(':')) {
      botToken = decrypt(botToken);
      logger.debug('Bot token decrypted');
    }
    if (userToken && userToken.includes(':')) {
      userToken = decrypt(userToken);
      logger.debug('User token decrypted');
    }
    
    // Slack Web APIクライアントを作成
    // User Tokenを優先的に使用（全チャンネルアクセス可能）
    const primaryToken = userToken || botToken;
    const slack = new WebClient(primaryToken);
    const botSlack = new WebClient(botToken); // Bot専用の操作用
    
    logger.info(`Using token type: ${userToken ? 'User Token' : 'Bot Token'}`);
    
    // チャンネル名をIDに変換する関数
    // 編集距離（レーベンシュタイン距離）を計算
    function calculateEditDistance(str1, str2) {
      const m = str1.length;
      const n = str2.length;
      const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
      
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (str1[i - 1] === str2[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1];
          } else {
            dp[i][j] = Math.min(
              dp[i - 1][j] + 1,    // 削除
              dp[i][j - 1] + 1,    // 挿入
              dp[i - 1][j - 1] + 1 // 置換
            );
          }
        }
      }
      return dp[m][n];
    }
    
    async function resolveChannelId(channelNameOrId) {
      logger.debug(`resolveChannelId input: "${channelNameOrId}"`);
      
      // すでにIDの形式（C,G,Dで始まる）ならそのまま返す
      if (channelNameOrId.match(/^[CGD][A-Z0-9]+$/)) {
        logger.debug(`Already an ID: ${channelNameOrId}`);
        return channelNameOrId;
      }
      
      // ユーザーID（Uで始まる、または@付きのユーザーID）の場合、DMチャンネルIDを取得
      if (channelNameOrId.match(/^@?U[A-Z0-9]+$/)) {
        try {
          // @を削除
          const userId = channelNameOrId.replace(/^@/, '');
          logger.debug(`Opening DM channel for user: ${userId}`);
          
          // conversations.openでDMチャンネルを開く（既存の場合は既存のIDを返す）
          const result = await slack.conversations.open({
            users: userId
          });
          
          if (result.ok && result.channel) {
            logger.debug(`DM channel ID: ${result.channel.id}`);
            return result.channel.id;
          }
          
          throw new Error(`Failed to open DM channel for user: ${userId}`);
        } catch (error) {
          logger.error(`Failed to open DM channel: ${error?.message || String(error)}`);
          throw error;
        }
      }
      
      // #を削除
      const channelName = channelNameOrId.replace(/^#/, '').trim();
      
      // チャンネル一覧を取得して名前で検索
      try {
        const channelsList = await slack.conversations.list({
          types: 'public_channel,private_channel',
          limit: 1000
        });
        
        const channel = channelsList.channels?.find(ch => ch.name === channelName);
        logger.debug(`Channel search result: ${channel ? `Found: ${channel.id}` : 'Not found'}`);
        if (channel) {
          logger.debug(`Resolved channel name "${channelName}" to ID: ${channel.id}`);
          return channel.id;
        }
        
        // 完全一致が見つからない場合、類似チャンネルを探す
        logger.debug(`Exact match not found for "${channelName}". Searching for similar channels...`);

        // すべてのチャンネルに対して編集距離を計算
        const channelScores = channelsList.channels?.map(ch => ({
          channel: ch,
          distance: calculateEditDistance(channelName.toLowerCase(), ch.name.toLowerCase())
        })).sort((a, b) => a.distance - b.distance) || [];

        // 編集距離が最小のチャンネルを選択（最大2文字まで）
        const bestMatch = channelScores[0];
        if (bestMatch && bestMatch.distance <= 2) {
          logger.debug(`Found similar channel: ${bestMatch.channel.name} (edit distance: ${bestMatch.distance})`);
          return bestMatch.channel.id;
        }

        // それでも見つからない場合、従来の部分一致も試す
        const partialMatch = channelsList.channels?.find(ch => 
          ch.name.includes(channelName) || channelName.includes(ch.name)
        );

        if (partialMatch) {
          logger.debug(`Using partial match: ${partialMatch.name}`);
          return partialMatch.id;
        }

        throw new Error(`Channel "${channelName}" not found and no similar channels found`);
      } catch (error) {
        logger.error(`Failed to resolve channel name: ${error?.message || String(error)}`);
        throw error;
      }
    }
    
    let result;
    
    // アクションに応じて処理
    switch (action) {
      case 'getTokens':
        logger.info(`Processing getTokens request for userId: ${userId}`);
        if (!userId) {
          throw new Error('User ID required for getTokens action');
        }
        
        const tokens = await getSlackTokensForUser(userId);
        if (tokens) {
          // 暗号化を解除して返す
          let decryptedBotToken = tokens.bot_token;
          let decryptedUserToken = tokens.user_token;
          
          if (tokens.bot_token && tokens.bot_token.includes(':')) {
            decryptedBotToken = decrypt(tokens.bot_token);
          }
          if (tokens.user_token && tokens.user_token.includes(':')) {
            decryptedUserToken = decrypt(tokens.user_token);
          }
          
          logger.info('Tokens found and decrypted');
          return res.json({
            bot_token: decryptedBotToken,
            user_token: decryptedUserToken,
            team_name: tokens.team_name || null
          });
        }
        logger.warn('No tokens found for getTokens request');
        return res.status(404).json({ error: 'No tokens found' });
        
      case 'reply_to_thread':
        // thread_tsが必須であることを確認
        if (!args.thread_ts) {
          // ファイルから正しいtsを読み取り
          const targetFile = path.join(os.homedir(), '.anicca', 'reply_target.json');
          if (fs.existsSync(targetFile)) {
            try {
              const target = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
              if (target.channel === args.channel && target.ts) {
                args.thread_ts = target.ts;
                logger.debug(`Using saved target ts: ${target.ts} for message: "${target.message}"`);
              } else {
                throw new Error(`Saved target is for different channel: ${target.channel} vs ${args.channel}`);
              }
            } catch (e) {
              logger.error(`Failed to read reply target: ${e?.message || String(e)}`);
              throw new Error('Failed to read reply target file');
            }
          } else {
            throw new Error('No reply target saved. Please specify target message first.');
          }
        }
        // send_messageと同じ処理を実行（thread_ts付き）
        // フォールスルーで処理
        // fallthrough
        
      case 'send_message':
        const sendChannelId = await resolveChannelId(args.channel);
        
        
        // Bot Tokenの場合のみチャンネル参加を試みる
        if (!userToken) {
          try {
            await botSlack.conversations.join({
              channel: sendChannelId
            });
          } catch (joinError) {
            // 既に参加している場合やプライベートチャンネルの場合はエラーを無視
          }
        }
        
        try {
          result = await slack.chat.postMessage({
            channel: sendChannelId,
            text: args.message || args.text,
            thread_ts: args.thread_ts,
            as_user: userToken ? true : false
          });
          
          // thread返信成功後、ファイルを空にする（ローカル環境のみ）
          if (args.thread_ts && result.ok) {
            // プロキシサーバーでなくローカル環境でのみ実行
            if (process.platform !== 'linux') { // Railwayはlinux
              try {
                const targetFile = path.join(os.homedir(), '.anicca', 'reply_target.json');
                fs.writeFileSync(targetFile, '{}', 'utf8');
                logger.debug('Reply target file cleared');
              } catch (e) {
                // エラーは無視
                logger.warn(`Could not clear reply target file: ${e.message}`);
              }
            }
          }
        } catch (sendError) {
          // thread_not_foundの場合は通常メッセージとして再送信
          if (sendError.data?.error === 'thread_not_found' && args.thread_ts) {
            logger.warn('Thread not found, retrying as new message');
            result = await slack.chat.postMessage({
              channel: sendChannelId,
              text: args.message || args.text,
              as_user: userToken ? true : false
            });
          } else {
            throw sendError;
          }
        }
        break;
        
      case 'get_channel_history':
        // チャンネル名をIDに変換
        const historyChannelId = await resolveChannelId(args.channel);
        
        result = await slack.conversations.history({
          channel: historyChannelId,
          limit: args.limit || 10
        });
        
        // デバッグログ追加
        logger.info(`Retrieved ${result.messages?.length || 0} messages from #${args.channel}`);
        if (result.messages && result.messages.length > 0) {
          const oldest = new Date(result.messages[result.messages.length - 1].ts * 1000);
          const newest = new Date(result.messages[0].ts * 1000);
          logger.debug(`Date range: ${oldest.toLocaleString('ja-JP')} ~ ${newest.toLocaleString('ja-JP')}`);
          
          // @hereを含むメッセージをログ出力
          const atHereMessages = result.messages.filter(m => 
            m.text && (m.text.includes('@here') || m.text.includes('@channel') || m.text.includes('日付'))
          );
          if (atHereMessages.length > 0) {
            logger.debug(`Found ${atHereMessages.length} messages with @here/@channel/日付:`);
            atHereMessages.forEach(m => {
              const date = new Date(m.ts * 1000);
              logger.debug(`  - ${date.toLocaleString('ja-JP')}: ${m.text.substring(0, 50)}...`);
            });
          }
        }
        
        break;
        
      case 'list_users':
        result = await slack.users.list({
          limit: args.limit || 100
        });
        break;
        
      case 'list_channels':
        logger.info('Getting channel list');
        result = await slack.conversations.list({
          types: 'public_channel,private_channel',
          limit: args.limit || 1000,
          exclude_archived: args.exclude_archived !== false
        });
        logger.info(`Retrieved ${result.channels?.length || 0} channels`);
        break;
        case 'get_user_info':
        result = await slack.users.info({
          user: args.user
        });
        break;
        
      case 'post_as_user':
        if (!userToken) {
          throw new Error('User token not available. This action requires user authentication.');
        }
        // チャンネル名をIDに変換
        const userChannelId = await resolveChannelId(args.channel);
        
        result = await slack.chat.postMessage({
          channel: userChannelId,
          text: args.message || args.text,
          as_user: true
        });
        break;
        
      case 'add_reaction':
        const reactionChannelId = await resolveChannelId(args.channel);
        

        
        logger.info(`Adding reaction: ${args.name} to ${args.timestamp}`);
        
        try {
          result = await slack.reactions.add({
            channel: reactionChannelId,
            timestamp: args.timestamp,
            name: args.name
          });
          logger.info('Reaction added successfully');
        } catch (reactionError) {
          // エラーでも成功として扱う
          const errorCode = reactionError.data?.error;
          logger.warn(`Reaction error (${errorCode}) but treating as success`);
          
          if (errorCode === 'already_reacted') {
            result = { ok: true, warning: 'Already reacted' };
          } else if (errorCode === 'message_not_found') {
            result = { ok: true, warning: 'Message not found (deleted?)' };
          } else {
            result = { ok: true, warning: reactionError.message };
          }
        }
        break;
        
      case 'upload_file':
        result = await slack.files.upload({
          channels: args.channels,
          content: args.content,
          filename: args.filename,
          title: args.title
        });
        break;
        
      case 'create_channel':
        try {
          result = await slack.conversations.create({
            name: args.name || 'anicca_report',
            is_private: args.is_private || false
          });
          logger.info(`Channel created successfully: ${result.channel?.name}`);
        } catch (createError) {
          // チャンネルが既に存在する場合はそのまま使う
          if (createError.data?.error === 'name_taken') {
            logger.warn('Channel already exists, fetching existing channel...');
            const listResult = await slack.conversations.list({
              types: 'public_channel,private_channel',
              limit: 1000
            });
            const existingChannel = listResult.channels?.find(ch => ch.name === (args.name || 'anicca_report'));
            if (existingChannel) {
              result = { ok: true, channel: existingChannel };
            } else {
              throw createError;
            }
          } else {
            throw createError;
          }
        }
        break;
        
      case 'send_dm_to_user':
        // ユーザーのSlack IDを使用（上部で既に取得済み）
        let userSlackIdForDM = slackUserId; // 上部で保存した値を使用
        
        // slackUserIdが無い場合のフォールバック
        if (!userSlackIdForDM) {
          userSlackIdForDM = process.env.SLACK_USER_ID;
          if (!userSlackIdForDM) {
            throw new Error('Slack user ID not found. Please reconnect your Slack account or set SLACK_USER_ID environment variable.');
          }
        }
        
        logger.info(`Sending DM to user: ${userSlackIdForDM}`);
        
        try {
          // DMチャンネルを開く/取得
          const dmResult = await slack.conversations.open({
            users: userSlackIdForDM
          });
          
          if (!dmResult.ok || !dmResult.channel) {
            throw new Error('Failed to open DM channel');
          }
          
          const dmChannelId = dmResult.channel.id;
          logger.debug(`DM channel opened: ${dmChannelId}`);
          
          // メッセージ送信
          result = await slack.chat.postMessage({
            channel: dmChannelId,
            text: args.message || args.text
          });
          
          logger.info('DM sent successfully');
        } catch (dmError) {
          logger.error(`DM error: ${dmError?.message || String(dmError)}`);
          throw new Error(`Failed to send DM: ${dmError.message}`);
        }
        break;
        
      case 'get_thread_replies':
        const repliesChannelId = await resolveChannelId(args.channel);
        const threadTs = args.thread_ts;
        
        
        logger.info(`Getting thread replies for ${threadTs} in ${repliesChannelId}`);
        
        try {
          result = await slack.conversations.replies({
            channel: repliesChannelId,
            ts: threadTs,
            limit: args.limit || 100
          });
          logger.info(`Retrieved ${result.messages?.length || 0} thread replies`);
        } catch (repliesError) {
          // エラーの場合も空の結果を返して処理継続
          if (repliesError.data?.error === 'thread_not_found' || 
              repliesError.data?.error === 'message_not_found') {
            logger.warn('Thread/Message not found, returning empty');
            result = { messages: [], ok: true };
          } else {
            logger.warn(`Thread error but continuing: ${repliesError.message}`);
            result = { messages: [], ok: true, warning: repliesError.message };
          }
        }
        break;
        
      default:
        throw new Error(`Unknown Slack action: ${action}`);
    }
    
    logger.info('Slack tool execution completed');
    return res.status(200).json({
      success: true,
      result: result
    });
    
  } catch (error) {
    logger.error(`Slack tool execution error: ${error?.message || String(error)}`);
    
    // 処理を継続すべきエラーは警告として扱う
    const continuableErrors = [
      'thread_not_found',
      'message_not_found',
      'already_reacted',
      'not_in_channel',
      'invalid_ts_latest',
      'channel_not_found',
      'invalid_ts_oldest'
    ];
    
    if (error.data?.error && continuableErrors.includes(error.data.error)) {
      logger.warn(`Treating ${error.data.error} as warning, continuing`);
      return res.status(200).json({
        success: true,
        warning: error.data.error,
        result: { 
          ok: true, 
          warning: `Non-critical: ${error.data.error}` 
        }
      });
    }
    
    // その他のエラーは通常通り
    let errorMessage = error.message;
    if (error.data?.error) {
      errorMessage = `Slack API error: ${error.data.error}`;
    }
    
    res.status(500).json({
      error: 'Slack tool execution failed',
      message: errorMessage,
      details: error.stack
    });
  }
}
