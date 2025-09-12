import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

let elevenLabsClient = null;

function getElevenLabsClient() {
  if (!elevenLabsClient) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY environment variable is not set');
    }
    elevenLabsClient = new ElevenLabsClient({
      apiKey: apiKey
    });
    console.log('✅ ElevenLabs client initialized with API key');
  }
  return elevenLabsClient;
}

export default async function handler(req, res) {
  console.log('🚀 ElevenLabs handler called');
  

  try {
    const { action, params } = req.body;
    console.log('📨 Received:', { action, params });

    if (action === 'text_to_speech') {
      const text = params.text;
      const voiceId = params.voice_id || 'cgSgspJ2msm6clMCkdW9';
      const modelId = params.model || 'eleven_multilingual_v2';
      
      if (!text) {
        throw new Error('Text is required');
      }
      
      console.log('🎤 Parameters:', { text, voiceId, modelId });
      
      try {
        const elevenlabs = getElevenLabsClient();
        
        // 正確なメソッド呼び出し（ドキュメント確認済み）
        const audioStream = await elevenlabs.textToSpeech.stream(voiceId, {
          text: text,
          modelId: modelId,  // 正しいパラメータ名
          outputFormat: 'mp3_44100_128'  // 必須パラメータ
        });
        
        // ストリームをBufferに変換
        const chunks = [];
        for await (const chunk of audioStream) {
          chunks.push(Buffer.from(chunk));
        }
        const audioBuffer = Buffer.concat(chunks);
        
        if (audioBuffer.length === 0) {
          throw new Error('Generated audio buffer is empty');
        }
        
        const audioBase64 = audioBuffer.toString('base64');
        console.log(`✅ Success: ${audioBuffer.length} bytes generated`);
        
        return res.status(200).json({
          success: true,
          audioBase64: audioBase64,
          message: `Audio generated: ${audioBuffer.length} bytes`
        });
        
      } catch (elevenLabsError) {
        console.error('❌ ElevenLabs API Error:', elevenLabsError);
        console.error('Details:', elevenLabsError.message);
        
        return res.status(500).json({
          success: false,
          error: elevenLabsError.message,
          details: elevenLabsError.toString()
        });
      }
    }
    
    return res.status(400).json({
      success: false,
      error: `Unknown action: ${action}`
    });
    
  } catch (error) {
    console.error('❌ Handler Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
