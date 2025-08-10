# Worker音声対話機能 - 完全実装計画

## 実装概要
Workerとユーザーの直接音声対話を実現するための詳細な実装計画。起動時は待機モードで、音声コマンドでAniccaまたはWorkerモードを選択する。

## ファイル修正箇所と実装内容

### 1. 待機モード実装：起動時は何も接続せず音声コマンド待ち

#### 修正ファイル: `src/main-voice-simple.ts`

**現在の問題点**: 
- 490-494行目で自動的にstartVoiceSession()を呼び出している
- 起動時にOpenAI Realtime APIに自動接続してしまう

**修正内容**:
```javascript
// 490-494行目を削除または以下に置き換え
// setTimeout(() => {
//   console.log('🎤 Waiting for voice command...');
//   startWaitingMode();  // 新規関数
// }, 2000);
```

**新規追加関数** (320行目付近に追加):
```javascript
async function startWaitingMode() {
  console.log('🎤 待機モード: "Anicca"または"Worker"と呼んでください');
  
  // 軽量な音声認識ループ
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // MediaRecorderで音声をキャプチャ
  // 定期的にWhisper APIで文字起こし
  // "Anicca"または"Worker"を検出
}
```

### 2. 自動待機機能：30秒無音で自動的に待機モードへ移行

#### 修正ファイル: `src/main-voice-simple.ts` (hiddenWindow内のJavaScript)

**追加内容** (250行目付近):
```javascript
let silenceTimer = null;
let currentMode = 'waiting'; // 'waiting' | 'anicca' | 'worker'

function resetSilenceTimer() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    console.log('⏸️ 30秒無音 - 待機モードへ');
    stopCurrentMode();
    startWaitingMode();
  }, 30000);
}

function stopCurrentMode() {
  if (currentMode === 'anicca' && pc) {
    pc.close();
    pc = null;
    dataChannel = null;
  } else if (currentMode === 'worker') {
    // Worker音声セッション停止
    stopWorkerVoice();
  }
  currentMode = 'waiting';
}
```

### 3. 音声コマンドルーター：「Anicca」「Worker」を判定して適切なモード起動

#### 修正ファイル: `src/main-voice-simple.ts`

**新規追加関数** (330行目付近):
```javascript
async function detectVoiceCommand(audioBuffer) {
  // Whisper APIで文字起こし
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }));
  formData.append('model', 'whisper-1');
  
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });
  
  const { text } = await response.json();
  
  if (text.includes('アニッチャ') || text.includes('Anicca')) {
    stopCurrentMode();
    await startVoiceSession(); // 既存のAniccaモード
    currentMode = 'anicca';
  } else if (text.includes('ワーカー') || text.includes('Worker')) {
    stopCurrentMode();
    await startWorkerVoiceSession(); // 新規関数
    currentMode = 'worker';
  }
}
```

### 4. WorkerVoiceService作成：音声録音→Whisper→テキスト化

#### 新規ファイル: `src/services/workerVoiceService.ts`

```typescript
export class WorkerVoiceService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private workerId: string = 'Worker1';
  
  async startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream);
    
    this.mediaRecorder.ondataavailable = (event) => {
      this.audioChunks.push(event.data);
    };
    
    this.mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
      await this.processAudio(audioBlob);
      this.audioChunks = [];
    };
    
    this.mediaRecorder.start();
  }
  
  async processAudio(audioBlob: Blob) {
    // Whisperでテキスト化
    const text = await this.transcribeAudio(audioBlob);
    
    // Railwayに送信
    const response = await fetch(`${PROXY_URL}/api/worker-voice/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workerId: this.workerId,
        message: text,
        userId: getCurrentUserId()
      })
    });
    
    const { audioData } = await response.json();
    
    // 音声再生
    await this.playAudio(audioData);
  }
}
```

### 5. プロキシ側：/api/worker-voice/message エンドポイント実装

#### 新規ファイル: `anicca-proxy-slack/src/api/worker-voice/message.js`

```javascript
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { ParentAgent } from '../../services/parallel-sdk/core/ParentAgent.js';

export default async function handler(req, res) {
  const { workerId, message, userId } = req.body;
  
  try {
    // 1. Worker SDKで処理
    const parentAgent = new ParentAgent();
    await parentAgent.initialize();
    
    const result = await parentAgent.executeTask({
      id: Date.now().toString(),
      originalRequest: message,
      workerId: workerId,
      userId: userId
    });
    
    // 2. Google TTSで音声生成
    const tts = new TextToSpeechClient({
      credentials: JSON.parse(process.env.GOOGLE_TTS_CREDENTIALS)
    });
    
    const [response] = await tts.synthesizeSpeech({
      input: { text: result.output },
      voice: { 
        languageCode: 'ja-JP',
        name: 'ja-JP-Wavenet-D',
        ssmlGender: 'FEMALE'
      },
      audioConfig: { 
        audioEncoding: 'MP3',
        speakingRate: 1.1
      }
    });
    
    res.json({
      text: result.output,
      audioData: response.audioContent.toString('base64'),
      metadata: result.metadata
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

### 6. プロキシ側：Google TTSで音声生成して返送

**上記のmessage.jsで実装済み**

環境変数の確認:
- `GOOGLE_TTS_CREDENTIALS`: Railwayに設定済み
- `OPENAI_API_KEY`: Railwayに設定済み

### 7. ローカル側：音声データ受信と再生機能

#### 修正ファイル: `src/main-voice-simple.ts` (hiddenWindow内)

**新規追加関数** (400行目付近):
```javascript
async function startWorkerVoiceSession() {
  console.log('🤖 Worker音声モード開始');
  
  let isRecording = false;
  let mediaRecorder = null;
  let audioChunks = [];
  
  // マイク取得
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  
  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };
  
  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    
    // Whisperでテキスト化
    const formData = new FormData();
    formData.append('file', audioBlob);
    formData.append('model', 'whisper-1');
    
    const transcribeResponse = await fetch('/tools/transcribe', {
      method: 'POST',
      body: formData
    });
    
    const { text } = await transcribeResponse.json();
    
    // Proxyに送信
    const response = await fetch('/tools/worker-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workerId: 'Worker1',
        message: text,
        userId: userId
      })
    });
    
    const { audioData } = await response.json();
    
    // 音声再生
    const audio = new Audio();
    audio.src = 'data:audio/mp3;base64,' + audioData;
    await audio.play();
    
    audioChunks = [];
  };
  
  // VADで音声検出して録音開始/停止
  // 簡易的には3秒録音して処理のループ
  setInterval(() => {
    if (!isRecording) {
      mediaRecorder.start();
      isRecording = true;
      setTimeout(() => {
        mediaRecorder.stop();
        isRecording = false;
      }, 3000);
    }
  }, 3500);
}
```

### 8. Aniccaモード制御：OpenAI Realtime APIの開始/停止

#### 修正ファイル: `src/main-voice-simple.ts`

**既存のstartVoiceSession関数を修正** (323行目):
```javascript
async function startVoiceSession() {
  if (currentMode === 'worker') {
    stopWorkerVoice();
  }
  currentMode = 'anicca';
  
  // 既存のOpenAI Realtime API接続コード
  // ...
}
```

### 9. モード切り替え：Anicca⇔Worker相互切り替え機能

#### 修正ファイル: `src/main-voice-simple.ts`

**新規追加関数** (350行目付近):
```javascript
async function switchMode(targetMode) {
  console.log(`🔄 モード切り替え: ${currentMode} → ${targetMode}`);
  
  // 現在のモードを停止
  if (currentMode === 'anicca' && pc) {
    pc.close();
    pc = null;
    dataChannel = null;
  } else if (currentMode === 'worker') {
    stopWorkerVoice();
  }
  
  // 新しいモードを開始
  if (targetMode === 'anicca') {
    await startVoiceSession();
  } else if (targetMode === 'worker') {
    await startWorkerVoiceSession();
  } else if (targetMode === 'waiting') {
    await startWaitingMode();
  }
  
  currentMode = targetMode;
}
```

## voiceServer.tsの修正

### Worker音声エンドポイント追加

#### 修正ファイル: `src/services/voiceServer.ts`

**新規エンドポイント追加** (900行目付近):
```typescript
// Worker音声メッセージ処理
this.app.post('/tools/worker-voice', async (req, res) => {
  try {
    const { workerId, message, userId } = req.body;
    
    // Railwayのプロキシに転送
    const response = await fetch(`${PROXY_URL}/api/worker-voice/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId, message, userId })
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Whisper API
this.app.post('/tools/transcribe', async (req, res) => {
  try {
    const formData = req.body;
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: formData
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## テスト手順

1. **起動テスト**
   ```bash
   npm run voice:simple
   ```
   - 待機モードで起動することを確認
   - OpenAI APIに自動接続しないことを確認

2. **モード切り替えテスト**
   - 「Anicca」と言う → Aniccaモード開始
   - 「Worker」と言う → Workerモード開始
   - 相互切り替えが正常に動作

3. **Worker音声対話テスト**
   - Workerモードで質問
   - 音声応答が返ってくる
   - 30秒無音で待機モードへ

## 必要な環境変数（Railway側）

- `GOOGLE_TTS_CREDENTIALS`: Google Cloud TTSの認証情報（設定済み）
- `OPENAI_API_KEY`: OpenAI APIキー（設定済み）

## 実装の重要ポイント

1. **モード管理**: currentMode変数で現在のモードを管理
2. **リソース管理**: モード切り替え時に前のモードのリソースを解放
3. **エラーハンドリング**: 各モードで適切なエラー処理
4. **音声品質**: Google TTSの設定（声の種類、速度）を調整可能

## 期待される動作

1. アプリ起動 → 待機モード
2. 「Worker」と発話 → Worker音声対話開始
3. 自然な会話でWorkerと対話
4. 30秒無音 → 自動的に待機モードへ
5. 「Anicca」と発話 → 通常のAniccaモード

この実装により、ユーザーは音声コマンドだけでモードを切り替え、Workerと直接音声対話が可能になります。