// Worker音声対話エンドポイント
// Whisperで文字起こし → Worker SDK実行 → Google TTSで音声生成

import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { dirname } from 'path';
import { getSlackTokensForUser } from '../../services/storage/database.js';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

// Google TTS クライアント初期化
const ttsClient = new TextToSpeechClient({
  credentials: JSON.parse(process.env.GOOGLE_TTS_CREDENTIALS || '{}')
});

// 現在のファイルのディレクトリを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, message } = req.body;
    
    if (!userId || !message) {
      return res.status(400).json({ error: 'userId and message are required' });
    }

    console.log(`🎤 Worker voice request from ${userId}: ${message}`);

    // Slackトークンを取得
    const slackTokens = await getSlackTokensForUser(userId);
    
    console.log('🚀 Starting Worker1 as independent process...');
    
    // Worker.jsを独立プロセスとして起動
    const workerPath = path.join(__dirname, '../../services/parallel-sdk/core/Worker.js');
    
    const workerProcess = fork(workerPath, [], {
      env: {
        ...process.env,
        AGENT_NAME: 'Worker1',
        AGENT_ID: 'worker-1',
        WORKER_NUMBER: '1',
        SLACK_USER_ID: userId,
        CURRENT_USER_ID: userId,
        DESKTOP_MODE: 'false',
        SLACK_BOT_TOKEN: slackTokens?.bot_token || '',
        SLACK_USER_TOKEN: slackTokens?.user_token || ''
      },
      silent: false // ログを表示
    });
    
    // エラーハンドリング
    workerProcess.on('error', (error) => {
      console.error('❌ Worker process error:', error);
    });
    
    // タスクを送信して結果を待つ
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker timeout after 30 seconds'));
        workerProcess.kill();
      }, 30000);
      
      // メッセージハンドラー
      workerProcess.on('message', (msg) => {
        console.log('📨 Message from Worker:', msg.type);
        
        if (msg.type === 'READY') {
          // Workerが準備完了したらタスクを送信
          console.log('✅ Worker ready, sending task...');
          workerProcess.send({
            type: 'EXECUTE_TASK',
            task: {
              type: 'voice_dialogue',
              originalRequest: message,
              userId: userId
            }
          });
        } else if (msg.type === 'TASK_COMPLETE') {
          clearTimeout(timeout);
          resolve(msg);
          // Workerプロセスを終了
          setTimeout(() => workerProcess.kill(), 1000);
        } else if (msg.type === 'ERROR') {
          clearTimeout(timeout);
          reject(new Error(msg.error || 'Worker error'));
          workerProcess.kill();
        }
      });
      
      // プロセス終了時
      workerProcess.on('exit', (code, signal) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });

    console.log('🤖 Worker response:', result);

    // Google TTSで音声生成
    const audioContent = await generateSpeech(result.response || result.message || 'すみません、よく聞き取れませんでした。');

    // 音声データをBase64エンコード
    const audioBase64 = audioContent.toString('base64');
    const audioUrl = `data:audio/mp3;base64,${audioBase64}`;

    return res.status(200).json({
      success: true,
      response: result.response || result.message,
      audioUrl: audioUrl,
      workerId: 'worker-1'
    });

  } catch (error) {
    console.error('❌ Worker voice error:', error);
    
    // エラー時も音声で返す
    try {
      const errorMessage = 'エラーが発生しました。もう一度お試しください。';
      const audioContent = await generateSpeech(errorMessage);
      const audioBase64 = audioContent.toString('base64');
      const audioUrl = `data:audio/mp3;base64,${audioBase64}`;
      
      return res.status(500).json({
        error: 'Worker execution failed',
        message: errorMessage,
        audioUrl: audioUrl
      });
    } catch (ttsError) {
      return res.status(500).json({
        error: 'Worker execution and TTS failed',
        details: error.message
      });
    }
  }
}

// Google TTSで音声生成
async function generateSpeech(text) {
  try {
    const request = {
      input: { text },
      voice: {
        languageCode: 'ja-JP',
        name: 'ja-JP-Neural2-B', // 男性の声
        ssmlGender: 'MALE'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0.0,
        volumeGainDb: 0.0
      }
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    
    console.log(`🔊 TTS generated: ${text.substring(0, 50)}...`);
    
    return response.audioContent;
    
  } catch (error) {
    console.error('❌ TTS generation error:', error);
    throw error;
  }
}