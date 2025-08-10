# ANICCAプロジェクト概要

## プロジェクトの目的
ANICCAは、音声インターフェースを中心としたマルチプラットフォームAIアシスタントエコシステムです。主に音声による対話、画面分析、各種ツール統合機能を提供します。

## 主要コンポーネント

### 1. デスクトップアプリ (Electron + TypeScript)
- **場所**: `src/` ディレクトリ
- **エントリーポイント**: `src/main-voice-simple.ts`
- **主な機能**:
  - システムトレイ常駐
  - MCP (Model Context Protocol) 統合
  - セッション永続化（`~/.anicca/session.json`）

### 2. プロキシサーバー (Express + TypeScript)
- **場所**: `anicca-proxy-slack/` ディレクトリ
- **本番URL**: https://anicca-proxy-staging.up.railway.app
- **主な機能**:
  - Claude/OpenAI APIプロキシ
  - Slack OAuth認証
  - MCPツール統合（Exa検索、Playwright）
  - DMGファイル配信

### 3. Webアプリ (Next.js 14 + TypeScript)
- **場所**: `anicca-web/` ディレクトリ
- **本番URL**: https://app.aniccaai.com
- **主な機能**:
  - ブラウザベース音声アシスタント
  - リアルタイム音声ストリーミング
  - Supabase認証

### 4. ランディングページ
- **場所**: `landing/` ディレクトリ
- **本番URL**: https://aniccaai.com
- **デプロイ**: Netlify

## アーキテクチャの特徴
- プライバシー優先設計（データはローカル保存）
- モジュール式アーキテクチャ
- MCP Protocol対応で拡張可能
- 音声バージョンが主力製品（v0.6+）

## 現在の開発フォーカス
- 音声アシスタント機能の強化
- Slack統合によるチーム協業
- VADを使用した継続的音声認識
- MCPプロトコルによるツール拡張性