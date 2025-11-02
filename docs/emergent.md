   【1】LiveKit.AudioPlayerRenderer 不存在によるビルド失敗
    LiveKit Swift SDK（client-sdk-swift）では AudioPlayerRenderer がトップレベル公開されているため、モジュー
    ル名を付けずに初期化し、既存の AudioPlayerRenderer.swift（Anicca側ラッパー）を利用する形に戻します。
    citeexamples/client-sdk-swift/Sources/LiveKit/Support/AudioPlayerRenderer.swift

    *** Update File: Anicca/Smart/Smart/Features/Voice/RealtimeSession.swift
    @@
    -    private var remoteRenderer: LiveKit.AudioPlayerRenderer?
    +    private var remoteRenderer: AudioPlayerRenderer?

    @@
    -            await stopRemoteRenderer()
    +            await stopRemoteRenderer()

    @@
    -    private func scheduleReconnect() {
    +    private func scheduleReconnect() {

    @@
    -    @MainActor
    -    private func attachRemoteRenderer(to track: RemoteAudioTrack) {
    -        Task {
    -            await stopRemoteRenderer()
    -            let renderer = LiveKit.AudioPlayerRenderer()
    -            do {
    -                try await renderer.start()
    -                track.add(audioRenderer: renderer)
    -                self.remoteRenderer = renderer
    -                self.currentRemoteTrack = track
    -                self.statusMessage = "音声受信中"
    -            } catch {
    -                self.lastErrorMessage = "音声再生初期化に失敗しました: \(error.localizedDescription)"
    -                self.statusMessage = "LiveKit音声の取得に失敗しました"
    -            }
    -        }
    -    }
    -
    -    @MainActor
    -    private func stopRemoteRenderer() async {
    -        guard let renderer = remoteRenderer else { return }
    -        currentRemoteTrack?.remove(audioRenderer: renderer)
    -        renderer.stop()
    -        remoteRenderer = nil
    -        currentRemoteTrack = nil
    -    }
    +    @MainActor
    +    private func attachRemoteRenderer(to track: RemoteAudioTrack) async {
    +        await stopRemoteRenderer()
    +        let renderer = AudioPlayerRenderer(track: track)
    +        AudioManager.shared.add(remoteAudioRenderer: renderer)
    +        remoteRenderer = renderer
    +        statusMessage = "音声受信中"
    +    }
    +
    +    @MainActor
    +    private func stopRemoteRenderer() async {
    +        guard let renderer = remoteRenderer else { return }
    +        AudioManager.shared.remove(remoteAudioRenderer: renderer)
    +        remoteRenderer = nil
    +        currentRemoteTrack = nil
    +    }

    @@
    -        Task { @MainActor [weak self] in
    -            guard let self else { return }
    -            self.logger.info("Subscribed remote audio track")
    -            self.attachRemoteRenderer(to: audioTrack)
    -        }
    +        Task { @MainActor [weak self] in
    +            guard let self else { return }
    +            self.logger.info("Subscribed remote audio track")
    +            await self.attachRemoteRenderer(to: audioTrack)
    +        }

    @@
    -        Task { @MainActor [weak self] in
    -            guard let self else { return }
    -            self.logger.info("Unsubscribed remote audio track")
    -            await self.stopRemoteRenderer()
    -            self.statusMessage = "音声待機中"
    -        }
    +        Task { @MainActor [weak self] in
    +            guard let self else { return }
    +            self.logger.info("Unsubscribed remote audio track")
    +            await self.stopRemoteRenderer()
    +            self.statusMessage = "音声待機中"
    +        }

    ———

    【2】Logger の生成方法
    apps/api/src/utils/logger.js のデフォルトエクスポートはシングルトンなので new Logger(...) は TypeError に
  な
    ります。withContext を呼ぶ形へ修正します。

    *** Update File: apps/api/src/routes/mobile/rtc.js
    @@
    -import Logger from '../../utils/logger.js';
    -const logger = new Logger('MobileRTC');
    +import baseLogger from '../../utils/logger.js';
    +const logger = baseLogger.withContext('MobileRTC');

    ———

    【3】Python 依存の不足
    LiveKit Agents は Python ランタイム + livekit-agents / openai パッケージを要求します。Railway の Node
  サービ
    スで spawn('python3', ...) を行う前に、ビルド時に依存を展開し PYTHONPATH を通す手順を追加します。公式ク
  イッ
    クスタートも pip 導入を前提にしています。cite/livekit/agents

    *** Add File: apps/api/requirements/mobile-agent.txt
    +livekit-agents==0.7.1
    +openai==1.51.0
    +python-dotenv==1.0.1

    *** Update File: apps/api/package.json
    @@
       "scripts": {
    -    "lint": "eslint src --ext .js",
    +    "lint": "eslint src --ext .js",
    +    "postinstall": "python3 -m pip install --upgrade pip && python3 -m pip install -r
  requirements/mobile-
    agent.txt -t ./dist/mobile-agent"
       },

    -import { spawn } from 'child_process';
    +import { spawn } from 'child_process';
    @@
    -export function startMobileVoiceAgent({ deviceId, room }) {
    -  const sessionId = `${deviceId}-${Date.now()}`;
    -
    -  const child = spawn(process.env.MOBILE_AGENT_PYTHON_PATH || 'python3', [scriptPath], {
    -    stdio: 'inherit'
    -  });
    +export function startMobileVoiceAgent({ deviceId, room }) {
    +  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    +  const scriptPath = path.resolve(scriptDir, '../agents/mobile_voice_agent.py');
    +  const sessionId = `${deviceId}-${Date.now()}`;
    +
    +  const pythonExecutable = process.env.MOBILE_AGENT_PYTHON_PATH || 'python3';
    +  const pythonSiteDir = path.resolve(scriptDir, '../../dist/mobile-agent');
    +
    +  const child = spawn(pythonExecutable, [scriptPath], {
    +    env: {
    +      ...process.env,
    +      PYTHONPATH: pythonSiteDir,
    +      LIVEKIT_AGENT_ROOM: room,
    +      LIVEKIT_AGENT_IDENTITY: `${deviceId}-assistant`,
    +    },
    +    stdio: 'inherit'
    +  });
    @@
    -    logger.info(`Voice agent exited (session=${sessionId}, code=${code})`);
    +    logger.info(`Voice agent exited (session=${sessionId}, code=${code})`);

    これにより npm install（Railway のビルドステップ）で livekit-agents / openai が dist/mobile-
    agent に展開され、spawn 時に PYTHONPATH が通って ModuleNotFoundError が解消されます。必要に応じて
    MOBILE_AGENT_PYTHON_PATH=/usr/bin/python3 を Railway 側にセットしてください（環境依存）。

    ② LiveKitトークンに専用ルーム名を付与する

    *** Update File: apps/api/src/services/livekitTokenService.js
    @@
     export async function issueEphemeralToken({ deviceId }) {
       ensureLiveKitConfiguration();

       const ttl = LIVEKIT_CONFIG.TOKEN_TTL > 0 ? LIVEKIT_CONFIG.TOKEN_TTL : DEFAULT_TTL;
    +  const roomName = `${LIVEKIT_CONFIG.DEFAULT_ROOM || 'mobile'}-${deviceId}`;

       try {
         const accessToken = new AccessToken(LIVEKIT_CONFIG.API_KEY, LIVEKIT_CONFIG.API_SECRET, {
           identity: deviceId,
           ttl
    @@
           roomJoin: true,
           canPublish: true,
           canSubscribe: true,
    -      room: LIVEKIT_CONFIG.DEFAULT_ROOM || undefined
    +      room: roomName
         });

         const token = await accessToken.toJwt();

         logger.info('Issued LiveKit token for device', deviceId, `(ttl=${ttl}s)`);

         return {
           token,
           url: LIVEKIT_CONFIG.WS_URL,
    -      ttl
    +      ttl,
    +      room: roomName
         };
       } catch (error) {
         logger.error('Failed to generate LiveKit token', error);
         throw error;
       }
     }

    ———

    ⑪ モバイルRTCルーターでセッション開始/停止APIを公開

    -import express from 'express';
    -import { issueEphemeralToken } from '../../services/livekitTokenService.js';
    -import Logger from '../../utils/logger.js';
    +import express from 'express';
    +import { issueEphemeralToken } from '../../services/livekitTokenService.js';
    +import baseLogger from '../../utils/logger.js';
    +import { startMobileVoiceAgent, stopMobileVoiceAgent } from '../../services/mobileVoiceAgent.js';

     const router = express.Router();
    -const logger = new Logger('MobileRTC');
    +const logger = baseLogger.withContext('MobileRTC');

     router.get('/ephemeral-token', async (req, res) => {
    @@
       } catch (error) {
         logger.error('Failed to issue LiveKit ephemeral token', error);
         return res.status(500).json({ error: 'failed_to_issue_livekit_token' });
       }
     });
    +
    +router.post('/session', (req, res) => {
    +  const deviceId = (req.body?.deviceId || '').toString().trim();
    +  const room = (req.body?.room || '').toString().trim();
    +
    +  if (!deviceId || !room) {
    +    logger.warn('Missing deviceId or room for voice session');
    +    return res.status(400).json({ error: 'deviceId and room are required' });
    +  }
    +  if (!process.env.OPENAI_API_KEY) {
    +    logger.error('OPENAI_API_KEY is not configured');
    +    return res.status(500).json({ error: 'OPENAI_API_KEY not configured on proxy' });
    +  }
    +
    +  const { sessionId } = startMobileVoiceAgent({ deviceId, room });
    +  return res.status(201).json({ sessionId });
    +});
    +
    +router.delete('/session/:sessionId', (req, res) => {
    +  const { sessionId } = req.params;
    +  const stopped = stopMobileVoiceAgent(sessionId);
    +  if (!stopped) {
    +    return res.status(404).json({ error: 'session not found' });
    +  }
    +  return res.status(204).send();
    +});

     export default router;
