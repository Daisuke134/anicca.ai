# ANICCAデスクトップアプリ実装計画

## 概要
既存のvoice:simpleを拡張し、プロキシのParent-Worker構造をローカルで実行

## ファイル構造

```
anicca-project/
├── anicca-desktop/                        # デスクトップアプリ専用
│   ├── src/
│   │   ├── main.ts                       # main-voice-simple.tsを拡張
│   │   ├── services/
│   │   │   ├── agents/                   # プロキシから完全コピー
│   │   │   │   ├── ParentAgent.ts       # プロキシのParentAgent.jsをそのままコピー
│   │   │   │   ├── BaseWorker.ts        # プロキシのBaseWorker.jsをそのままコピー
│   │   │   │   └── Worker.ts            # プロキシのWorker.jsをそのままコピー
│   │   │   ├── prompts/                  # プロキシから完全コピー
│   │   │   │   └── workerPrompts.ts     # プロキシのworkerPrompts.jsをそのままコピー
│   │   │   ├── claudeExecutorService.ts  # 既存（プロキシ経由でClaude API）
│   │   │   ├── continuousVoiceService.ts # ホットワード不要版に改修
│   │   │   ├── localParentManager.ts    # ローカルでParent-Worker起動管理
│   │   │   └── scheduleManager.ts       # 朝会・定期タスク
│   │   └── utils/
│   │       └── sessionManager.ts         # セッション管理
│   │
│   ├── assets/                           # 既存から移動
│   ├── build/                            # ビルド設定
│   │   ├── entitlements.mac.plist       # 既存から移動
│   │   └── notarize.js                  # 既存から移動
│   │
│   ├── electron-builder.yml              # 既存のelectron-builder-voice.ymlを改名
│   ├── package.json                      # 新規（必要な依存関係のみ）
│   └── README.md                         # デスクトップアプリの説明
│
├── anicca-proxy-slack/                   # 既存（変更なし）
├── anicca-web/                          # 既存（変更なし）
└── landing/                             # 既存（変更なし）
```

## 実装手順

### Phase 1: 基本構造の構築
1. **anicca-desktop/フォルダ作成**
   - 既存ファイルを整理して移動
   - electron-builder-voice.yml → electron-builder.yml

2. **Parent-Workerコードのコピー**
   - プロキシから以下を完全コピー：
     - ParentAgent.js → ParentAgent.ts
     - BaseWorker.js → BaseWorker.ts
     - Worker.js → Worker.ts
     - workerPrompts.js → workerPrompts.ts

3. **ローカル実行の調整**
   - 作業パス: ~/Desktop/anicca-agent-workspace/
   - child_processでWorker起動（プロキシと同じ）

### Phase 2: 音声インターフェース改善
1. **ホットワード廃止**
   - continuousVoiceService.tsを改修
   - 無音検出で自動録音開始

2. **音声フィードバック追加**
   - Parentの報告をTTSで音声化
   - 進捗を適切なタイミングで通知

### Phase 3: 朝会・定期タスク実装
1. **スケジュール管理**
   - node-cronで定期実行
   - 朝7時の朝会自動起動

2. **朝会フロー**
   - 全Workerが音声で報告
   - タスク割り振り

### Phase 4: 配布準備
1. **DMGビルド設定**
   - Notarization対応
   - 自動更新機能

2. **ログイン機能**
   - Supabase認証
   - 将来の課金基盤

## UX体験

### 1. 日常的な使い方
```
ユーザー：「今日のニュース要約して」
Parent：「承知しました。Worker2に調査を依頼します」
（数分後）
Worker2：「本日のニュース要約が完成しました」
Parent：「要約をお伝えします。本日の主要ニュースは...」
```

### 2. 複雑なタスクの処理
```
ユーザー：「修論の第4章書いて」
Parent：「了解しました。5人で分担して執筆します」
（タスク割り振り→並列実行→完了報告）
（自動でWordが起動し、完成文書が表示）
```

### 3. 朝会（毎朝7時）
```
Parent：「おはようございます。朝会を始めます」
Worker1-5：それぞれの進捗報告
Parent：「本日の予定です...」
```

### 4. 継続的な作業
```
ユーザー：「ブログ記事を毎日書いて」
Parent：「毎日午後2時にブログ記事を作成する定期タスクを設定しました」
（以降、自動実行）
```

## 技術的なポイント

### プロキシとの関係
- **APIキー管理**: すべてプロキシ経由（ハードコードなし）
- **実行環境**: Webアプリ→Railway、デスクトップ→ローカル
- **コードベース**: プロキシのParent-Worker実装を完全流用

### 重要な注意点
1. **プロンプトは一切変更しない**（プロキシから完全コピー）
2. **作業ディレクトリ**: ~/Desktop/anicca-agent-workspace/
3. **child_process**: プロキシと同じ仕組みでWorker管理

## 期待される成果
- **完全音声対話**: ホットワード不要で自然な会話
- **ローカル実行**: 高速処理、ファイル直接操作
- **24時間稼働**: バックグラウンドで自律的作業
- **学習機能**: CLAUDE.mdでユーザーの好みを記憶

## 将来の統合
- 共通のParent-Workerコードベース
- 実行環境フラグで切り替え（RUNTIME=local/railway）
- プロキシフォルダが完全なベースに