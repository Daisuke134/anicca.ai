# 技術スタック

## デスクトップアプリ
### フレームワーク・言語
- **Electron** v36.3.2 - デスクトップアプリフレームワーク
- **TypeScript** v5.3.3 - 型安全な開発
- **Node.js** - ランタイム環境

### 主要ライブラリ
- **@anthropic-ai/claude-code** v1.0.24 - Claude AI統合
- **@modelcontextprotocol/sdk** v1.12.1 - MCPプロトコル
- **@ricky0123/vad-web** v0.0.24 - 音声活動検出
- **@slack/web-api** v7.9.3 - Slack統合
- **@supabase/supabase-js** v2.52.0 - データベース・認証
- **sqlite3** v5.1.7 - ローカルデータベース
- **express** v5.1.0 - HTTPサーバー
- **ws** v8.18.2 - WebSocketサーバー

### ビルドツール
- **electron-builder** v25.1.8 - DMGビルド
- **ts-node** v10.9.2 - TypeScript実行

## プロキシサーバー (anicca-proxy-slack)
### フレームワーク
- **Express** v4.18.2 - Webフレームワーク
- **Node.js** (ESモジュール形式)
- **Vercel** - デプロイプラットフォーム（開発環境）
- **Railway** - 本番デプロイプラットフォーム

### 主要ライブラリ
- **@anthropic-ai/claude-code** v1.0.35
- **@modelcontextprotocol/sdk** v1.13.0
- **@vercel/mcp-adapter** v0.11.1
- **@supabase/supabase-js** v2.50.2
- **pg** v8.16.3 - PostgreSQL接続
- **exa-mcp-server** v0.3.10 - Exa検索統合
- **node-cron** v3.0.3 - スケジューリング

## Webアプリ (anicca-web)
### フレームワーク
- **Next.js** v15.3.4 - Reactフレームワーク
- **React** v19.0.0 - UIライブラリ
- **TypeScript** v5.x

### スタイリング・UI
- **Tailwind CSS** v4 - CSSフレームワーク
- **PostCSS** - CSS処理

### データ・認証
- **@supabase/supabase-js** v2.50.2
- **@supabase/ssr** v0.6.1 - SSR対応

## 共通の開発ツール
- **ESLint** - コードリンティング
- **Prettier** - コードフォーマット
- **Jest** - テストフレームワーク（デスクトップアプリ）

## デプロイメント
- **Vercel** - Webアプリのホスティング
- **Railway** - プロキシサーバーのホスティング
- **Netlify** - ランディングページのホスティング
- **GitHub Actions** - CI/CD