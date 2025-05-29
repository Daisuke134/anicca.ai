import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config();

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('GOOGLE_API_KEY not found in environment variables');
  process.exit(1);
}

console.log('🔑 API Key loaded:', apiKey.substring(0, 10) + '...');

const ai = new GoogleGenAI({ apiKey });
const model = 'gemini-2.0-flash-live-001';
const config = { responseModalities: [Modality.TEXT] };

async function testGeminiLive() {
  console.log('🚀 Testing Gemini Live API connection...');
  
  try {
    const session = await ai.live.connect({
      model: model,
      callbacks: {
        onopen: function () {
          console.log('✅ WebSocket connection opened successfully!');
        },
        onmessage: function (message) {
          console.log('📨 Received message:', message);
          if (message.text) {
            console.log('💬 Text response:', message.text);
          }
        },
        onerror: function (e) {
          console.error('❌ WebSocket error:', e.message);
        },
        onclose: function (e) {
          console.log('🔒 WebSocket closed:', e.reason);
        },
      },
      config: config,
    });

    console.log('📤 Sending test message...');
    session.sendClientContent({ 
      turns: "Hello, can you see this message? Please respond with a simple greeting." 
    });

    // 5秒後に接続を閉じる
    setTimeout(() => {
      console.log('⏰ Closing connection...');
      session.close();
    }, 5000);

  } catch (error) {
    console.error('💥 Failed to connect to Gemini Live API:', error);
  }
}

testGeminiLive(); 