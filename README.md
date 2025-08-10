# ANICCA Project

## 🎯 プロジェクト概要

ANICCAは、音声インターフェースを中心としたAIアシスタントエコシステムです。デスクトップアプリ、Webアプリ、そしてそれらを繋ぐプロキシサーバーから構成されています。

## 📁 リポジトリ構造

```
anicca-project/
├── src/                      # デスクトップアプリ (Electron + TypeScript)
│   ├── main-voice-simple.ts  # メインエントリーポイント
│   └── services/             # 各種サービス
│       ├── voiceServer.ts    # 音声処理サーバー
│       ├── desktopAuthService.ts
│       ├── simpleEncryption.ts
│       └── interfaces.ts
│
├── anicca-proxy-slack/       # プロキシサーバー (Express + TypeScript)
│   ├── src/                  # サーバーソースコード
│   ├── mcp-servers/          # MCP関連サーバー
│   ├── supabase/             # Supabase設定
│   └── debug-tools/          # デバッグツール
│
├── anicca-web/               # Webアプリ (Next.js + TypeScript)
│   ├── app/                  # App Router
│   ├── components/           # UIコンポーネント
│   ├── hooks/                # カスタムフック
│   └── lib/                  # ユーティリティ
│
├── landing/                  # ランディングページ
├── scripts/                  # ビルドスクリプト
└── assets/                   # アセットファイル
```

## 🚀 主要コンポーネント

### 1. デスクトップアプリ (`src/`)
- **技術スタック**: Electron + TypeScript
- **主な機能**: 
  - 音声認識と応答
  - システムトレイ常駐
  - MCP (Model Context Protocol) 統合

### 2. プロキシサーバー (`anicca-proxy-slack/`)
- **技術スタック**: Express + TypeScript
- **デプロイ先**: Railway (https://anicca-proxy-staging.up.railway.app)
- **主な機能**:
  - Claude API プロキシ
  - Slack OAuth認証
  - MCPツール統合
  - DMGファイル配信

### 3. Webアプリ (`anicca-web/`)
- **技術スタック**: Next.js 14 + TypeScript
- **デプロイ先**: Vercel (https://app.aniccaai.com)
- **主な機能**:
  - ブラウザベース音声アシスタント
  - リアルタイム音声ストリーミング
  - Supabase認証

## 📦 インストール

```bash
# リポジトリのクローン
git clone <repository-url>
cd anicca-project

# 依存関係のインストール
npm install

# プロキシサーバーの依存関係
cd anicca-proxy-slack
npm install
cd ..

# Webアプリの依存関係
cd anicca-web
npm install
cd ..
```

## 🛠️ 開発

### デスクトップアプリ

```bash
# 開発モード（推奨）
npm run voice:simple

# TypeScriptコンパイル
npm run build:voice

# DMGビルド（配布用）
npm run dist:voice

# コード品質チェック
npm run lint
npm run format
```

### プロキシサーバー

```bash
cd anicca-proxy-slack
npm run dev  # ローカル開発
```

### Webアプリ

```bash
cd anicca-web
npm run dev  # ローカル開発 (http://localhost:3000)
```

## 📝 環境変数

### デスクトップアプリ
最小限の`.env`設定。APIキーはOSのキーチェーンで暗号化管理。

### プロキシサーバー
`.env.example`を参考に`.env`ファイルを作成。

### Webアプリ
Vercelの環境変数設定で管理。

## 🚢 デプロイ

### デスクトップアプリ
- GitHubリリース（プライベートリポジトリ）
- DMGファイルはプロキシサーバー経由で配信

### プロキシサーバー
- Railway自動デプロイ（mainブランチプッシュ時）
- Staging: https://anicca-proxy-staging.up.railway.app

### Webアプリ
- Vercel自動デプロイ（GitHubプッシュ時）
- Production: https://app.aniccaai.com

## 🔧 重要な開発ノート

1. **DMGビルド前の確認**
   ```bash
   # マウントされているDMGを確認
   ls /Volumes/
   # Aniccaがマウントされていたら強制アンマウント
   hdiutil detach "/Volumes/Anicca*" -force
   ```

2. **セッション永続化**: `~/.anicca/session.json`で会話コンテキストを保持

3. **プライバシー優先設計**: すべてのデータは`~/.anicca/`にローカル保存

4. **音声バージョンが主力**: UIバージョンは非推奨

## 📄 ライセンス

プロプライエタリ - 詳細は別途お問い合わせください。

## 🤝 コントリビューション

現在OSSとして運用中。

## 📧 お問い合わせ

[プロジェクトのサポートメール]