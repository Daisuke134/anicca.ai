# ANICCA Desktop App - 実装TODO

## Phase 1: 基盤構築
- [ ] anicca-desktopフォルダ構造を作成
  - src/services/agents/
  - src/services/prompts/
  - src/utils/
  - assets/
  - build/
- [ ] 既存ファイルを移動
  - main-voice.ts → main.ts（main-voice-simpleではなく）
  - simpleContinuousVoiceService.ts
  - claudeExecutorService.ts
  - claudeSession.ts
  - アセットファイル
  - ビルド設定
- [ ] プロキシからコードをコピー（そのまま）
  - ParentAgent.js → ParentAgent.ts
  - BaseWorker.js → BaseWorker.ts
  - Worker.js → Worker.ts
  - workerPrompts.js → workerPrompts.ts
  - IPCProtocol.js → IPCProtocol.ts
  - IPCHandler.js → IPCHandler.ts
  - workerMemory.js → workerMemory.ts
  - mockDatabase.js → mockDatabase.ts

## Phase 2: 最小限の編集
- [ ] main.tsの編集
  - ClaudeExecutorServiceの代わりにlocalParentManager使用
  - claudeSessionをParent経由に変更
- [ ] simpleContinuousVoiceService.tsの編集
  - ホットワード機能は後で削除（まず動作確認）
  - hotword-detectedイベントでParentに渡す
- [ ] Worker.tsの編集（1行のみ）
  - 作業パス: /tmp/ → ~/Desktop/anicca-agent-workspace/
- [ ] claudeExecutorService.tsの編集
  - プロキシURL: vercel → railway
- [ ] プロンプトの編集
  - workerPrompts.tsに朝会セクション追加（既に追加済み）
  - ParentAgent内のプロンプトに朝会司会追加（既に追加済み）

## Phase 3: 新機能実装
- [ ] localParentManager.ts作成
  - ClaudeExecutorServiceの代替として動作
  - Parent/Worker起動管理（child_process.fork）
  - 音声入力をParentに転送
  - VOICE_REQUESTメッセージ→TTS呼び出し
- [ ] scheduleManager.ts作成
  - node-cronで朝会（7時）
  - RITUAL_STARTメッセージ送信

## Phase 4: 環境設定とテスト
- [ ] .env設定
  - PROXY_URL=https://anicca-proxy-staging.up.railway.app
  - USE_PROXY=true
- [ ] package.json作成（既存から必要な依存関係を抽出）
- [ ] 統合テスト
  - まずParent単体で音声応答確認
  - 次にWorker1つ追加
  - 最後に5人全員で並列実行
- [ ] DMGビルド設定更新