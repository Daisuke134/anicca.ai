# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト構成

ANICCAプロジェクトは複数のコンポーネントで構成されています：

### リポジトリ構成

1. **メインリポジトリ** (このリポジトリ)
   - パス: `/Users/cbns03/Downloads/anicca-project`
   - 内容: デスクトップ版、ランディングページ、プロキシサーバー

2. **プロキシサーバー** 
   - パス: `/Users/cbns03/Downloads/anicca-project/anicca-proxy-slack`
   - デプロイ: Railway (https://anicca-proxy-ten.vercel.app)
   - 役割: APIキー管理、Slack OAuth、ダウンロード配信

3. **Web版**
   - パス: `/Users/cbns03/Downloads/anicca-project/anicca-web`
   - デプロイ: Vercel (https://app.aniccaai.com)
   - 役割: ブラウザベースの音声アシスタント

4. **ランディングページ**
   - パス: `/Users/cbns03/Downloads/anicca-project/landing`
   - デプロイ: Netlify (https://aniccaai.com)
   - 役割: 製品紹介とダウンロードリンク

### デプロイ方法

#### プロキシサーバー (Railway)
```bash
cd anicca-proxy-slack
git push  # Railwayが自動デプロイ
```

#### Web版 (Vercel)
```bash
cd anicca-web
git push  # Vercelが自動デプロイ（GitHub連携済み）
```

#### ランディングページ (Netlify)
```bash
netlify deploy --prod --dir=landing
```

### アーキテクチャの違い

#### デスクトップ版
- Electronベース
- ローカルでAPIキーを暗号化保存
- 直接API呼び出し（将来的にプロキシ統一予定）

#### Web版
- Next.jsベース
- すべてのAPI呼び出しをプロキシ経由
- APIキーはサーバー側で管理

### 環境変数

#### プロキシサーバー (Railway)
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `ELEVENLABS_API_KEY`
- `GITHUB_TOKEN`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `ANICCA_WEB_URL`

#### Web版 (Vercel)
- `NEXT_PUBLIC_API_URL` (プロキシのURL)

### 今後の方針
- デスクトップ版もプロキシ経由に統一
- APIキー管理の一元化
- コードベースの共通化

## Build and Development Commands

```bash
# Development
npm run electron-dev    # Build and run in development mode with hot reload
npm run build          # TypeScript compilation + copy HTML/JS files to dist
npm run clean-build    # Clean dist directory and rebuild

# Testing and Code Quality
npm run test           # Run Jest tests
npm run lint           # ESLint for TypeScript files
npm run format         # Prettier formatting for src/**/*.ts

# Distribution
npm run dist:mac       # Build DMG for macOS (both Intel and Apple Silicon)
npm run release        # Build without publishing
```

## Architecture Overview

ANICCA is an Electron desktop app that uses AI to analyze and narrate screen content in real-time.

### Core Components

1. **Main Process (`src/main.ts`)**
   - Manages Electron lifecycle and window creation
   - Handles IPC communication between main and renderer processes
   - Initializes all services (database, screen capture, AI, encryption)
   - Manages the 8-second screen capture loop

2. **Services Architecture**
   - `EncryptionService`: Uses Electron's safeStorage to encrypt API keys in OS keychain
   - `ScreenCaptureService`: EventEmitter-based service for periodic screen captures
   - `GeminiRestService`: Handles AI analysis with Gemini 2.0 Flash API, maintains conversation context
   - `SQLiteDatabase`: Local storage for observations, settings, and usage tracking
   - `HighlightsManager`: Generates daily/weekly/monthly activity summaries

3. **IPC Communication Pattern**
   Main process exposes handlers via `ipcMain.handle()` for:
   - Language switching (`set-language`)
   - Narration control (`start-narration`, `stop-narration`)
   - Data retrieval (`get-observations`, `get-daily-data`)
   - Settings management (`get-setting`, `set-setting`)

4. **Security Model**
   - API key is encrypted on first use using OS-level encryption (Keychain on macOS)
   - No proxy server needed - direct API calls with encrypted credentials
   - Daily usage limits enforced (100 requests/day by default)

### Key Implementation Details

- **Language Support**: Japanese (default) and English, persisted in SQLite
- **Understanding Evolution**: AI maintains and updates understanding of user behavior across sessions
- **Privacy**: All data stored locally in `~/.anicca/`

### Environment Configuration

The app uses minimal `.env` configuration:
- `USE_SQLITE=true` (always true, Supabase support deprecated)
- Optional `GOOGLE_API_KEY` (auto-encrypted on first run)
- `CAPTURE_INTERVAL_MS=8000` (8-second intervals)

### Build Output

TypeScript compiles to `dist/` with CommonJS modules. The UI files (HTML/JS) are copied from `src/ui/` to `dist/ui/`.

## プロジェクト構成とデプロイ（重要）

### リポジトリ構成

このプロジェクトは**2つの別々のリポジトリ**で管理されています：

1. **メインアプリケーション**
   - リポジトリ: https://github.com/Daisuke134/anicca.ai
   - デプロイ: Netlify（mainブランチへのプッシュで自動デプロイ）
   - 公開URL: https://aniccaai.com

2. **プロキシサーバー（別リポジトリ）**
   - リポジトリ: https://github.com/Daisuke134/anicca-proxy
   - ローカルパス: `/Users/cbns03/Downloads/anicca-project/anicca-proxy-slack`
   - デプロイ: Vercel
   - 公開URL: https://anicca-proxy-ten.vercel.app
   - **重要**: GitHubへのプッシュだけでは反映されません

### Vercelデプロイの重要な注意点

**プロキシの変更を本番環境に反映するには、必ず手動デプロイが必要です：**

```bash
cd /Users/cbns03/Downloads/anicca-project/anicca-proxy-slack
vercel --prod
```

GitHubにプッシュしただけでは変更が反映されないので注意してください。

### プロキシサーバーの役割

プロキシサーバーは以下の重要な機能を提供しています：
- Claude APIへのプロキシ（APIキーを隠蔽）
- GitHubプライベートリポジトリからのDMGダウンロード（GITHUB_TOKEN使用）
- Slack OAuth認証のプロキシ

### ダウンロードの仕組み

ユーザーがaniccaai.comでダウンロードボタンをクリックすると：
1. Vercelプロキシにリクエスト
2. プロキシがGITHUB_TOKENを使ってプライベートリポジトリにアクセス
3. 最新リリース（latest）のDMGファイルを取得
4. ユーザーにストリーミング配信

これにより、GitHubリポジトリがプライベートでもユーザーはダウンロード可能です。

## 音声版（v0.5）の開発

### ビルドコマンド
```bash
# 開発・テスト
npm run voice           # 音声版を開発モードで実行
npm run build:voice     # TypeScript のビルド（音声版）

# リリースビルド  
npm run dist:voice      # 音声版専用のDMGビルド（electron-builder-voice.yml使用）
```

### 重要なファイル
- `src/main-voice.ts`: 音声版のエントリーポイント（UIなし、システムトレイのみ）
- `tsconfig.voice.json`: 音声版専用のTypeScript設定
- `electron-builder-voice.yml`: 音声版専用のビルド設定

### 音声版の特徴
- UIなし、システムトレイのみで動作
- "Hey Anicca"で音声認識起動
- Slack MCP統合（プロキシ経由）
- セッション永続化（~/.anicca/session.json）
- VADとEnterキーのハイブリッド録音

## DMGビルドエラーの対処法

DMGビルド時に「リソースが一時的に使用できません」エラーが発生した場合：

```bash
# マウントされているDMGボリュームを取り出す
hdiutil detach /Volumes/Anicca* -force

# 一時ファイルをクリーンアップ
rm -rf /private/var/folders/*/T/t-*
```

## 重要な開発ルール

### 動作確認前にコミット・プッシュしない
- コード変更後は必ず動作確認を行う
- DMGビルドして実際にテスト
- 問題がないことを確認してからコミット

### ビルド手順
```bash
npm run build:voice    # TypeScriptコンパイル
npm run dist:voice     # DMGビルド
```