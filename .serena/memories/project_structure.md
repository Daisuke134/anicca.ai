# プロジェクト構造詳細

## ルートディレクトリ構造
```
anicca-project/
├── src/                        # デスクトップアプリのソースコード
│   ├── main-voice-simple.ts    # 現在のメインエントリーポイント
│   ├── config.ts               # アプリ設定
│   ├── recorder.html           # 音声録音用HTML
│   └── services/               # サービス層
│       ├── voiceServer.ts      # 音声処理サーバー
│       ├── desktopAuthService.ts # 認証サービス
│       ├── simpleEncryption.ts # 暗号化ユーティリティ
│       └── interfaces.ts       # TypeScript インターフェース
│
├── anicca-proxy-slack/         # プロキシサーバー（サブモジュール）
│   ├── src/
│   │   ├── server.js           # メインサーバーエントリー
│   │   ├── config/             # 環境設定
│   │   ├── api/                # APIエンドポイント
│   │   │   ├── proxy/          # APIプロキシ（Claude, OpenAI）
│   │   │   ├── auth/           # 認証（Slack, Google OAuth）
│   │   │   ├── tools/          # MCPツール統合
│   │   │   ├── execution/      # 並列SDK実行
│   │   │   └── static/         # 静的ファイル配信
│   │   ├── services/           # ビジネスロジック
│   │   │   ├── claude/         # Claude AI関連
│   │   │   ├── storage/        # データベース・メモリ管理
│   │   │   ├── parallel-sdk/   # 並列実行SDK
│   │   │   └── mcp-clients/    # MCPクライアント
│   │   └── utils/              # ユーティリティ
│   ├── mcp-servers/            # MCPサーバー設定
│   ├── supabase/               # Supabase設定
│   └── debug-tools/            # デバッグツール
│
├── anicca-web/                 # Webアプリ（サブモジュール）
│   ├── app/                    # Next.js App Router
│   ├── components/             # Reactコンポーネント
│   ├── hooks/                  # カスタムフック
│   ├── lib/                    # ユーティリティライブラリ
│   ├── public/                 # 静的ファイル
│   └── supabase/               # Supabase設定
│
├── landing/                    # ランディングページ
├── scripts/                    # ビルド・デプロイスクリプト
├── assets/                     # アセットファイル
├── build/                      # ビルド出力（gitignore）
├── dist/                       # TypeScriptコンパイル出力（gitignore）
│
├── .serena/                    # Serena MCP メモリ
├── .claude/                    # Claude設定
├── .github/                    # GitHub Actions設定
│
├── package.json                # メインプロジェクト設定
├── tsconfig.json               # TypeScript設定
├── tsconfig.voice.json         # 音声版用TypeScript設定
├── electron-builder-voice.yml  # Electronビルド設定
├── .eslintrc.json              # ESLint設定
├── CLAUDE.md                   # Claude用プロジェクトガイド
└── README.md                   # プロジェクトドキュメント
```

## 主要なエントリーポイント

### デスクトップアプリ
- `src/main-voice-simple.ts` - 現在使用中のメインエントリー
- `src/main-voice.ts` - オリジナル音声版（非推奨）
- `src/main-voice-rtmcp.ts` - 実験的RTMCP版

### プロキシサーバー
- `anicca-proxy-slack/src/server.js` - Expressサーバー

### Webアプリ
- `anicca-web/app/` - Next.js App Router

## 設定ファイル

### TypeScript設定
- `tsconfig.json` - メイン設定
- `tsconfig.voice.json` - 音声版専用設定

### ビルド設定
- `electron-builder-voice.yml` - DMGビルド設定
- `package.json` - npm scripts定義

### デプロイ設定
- `anicca-proxy-slack/railway.toml` - Railway設定
- `anicca-proxy-slack/vercel.json` - Vercel設定
- `anicca-web/next.config.ts` - Next.js設定

## データ保存場所
- `~/.anicca/` - ユーザーデータ（セッション、設定、ログ）
- `~/.anicca/session.json` - 会話セッション永続化
- OS暗号化ストレージ - APIキー保存

## Git管理
- メインブランチ: `main`
- 現在のブランチ: `feature/desktop-app-parent-worker`
- サブモジュール: `anicca-proxy-slack`, `anicca-web`