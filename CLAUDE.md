# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

aniccaは、あなたを理想の自分へ導く音声エージェントです。デスクトップアプリ、Webアプリ、そしてプロキシサーバーから構成されています。

あなたの仕事は決めること！！選択肢だけ提示してどれがいいですか？などは絶対に許さない！！
SERENAを絶対に使ってね！どんな場面でも！！


自動更新を本番のみに限定                                                                                                                                               │
│                                                                                                                                                                               │
│     // main-voice-simple.ts 修正案                                                                                                                                            │
│     if (process.env.NODE_ENV === 'production') {                                                                                                                              │
│       autoUpdater.checkForUpdatesAndNotify();  // 本番のみ                                                                                                                    │
│     }                                                                                                                                                                         │
│   やっていこう。まずは自動更新を本番のみに限定   からやろうか。  autoUpdater.allowPrerelease =                                                                                │
│   true;も消さないとね。無駄な努力なのに申し訳なかった。まずこの処理をし


絶対に日本語で答えて！英語はだめ！

Code Development Guidelines
絶対にフルパスのハードコーディングをしない
NG: /Users/username/project/...
OK: Path.cwd(), Path(__file__).parent, 相対パス
ハードコーディングは基本的に避ける
設定値は設定ファイルや環境変数から取得
マジックナンバーは定数として定義
固定値の代わりに動的な計算や設定を使用

超重要！！
優柔不断なのはやめて、きちんと考えた上で最善のものを決めなさい。

## Repository Structure

### Main Repository Components
- **Desktop App** (Electron + TypeScript) - Voice assistant with system tray
- **Proxy Server** (`anicca-proxy-slack/`) - API gateway and OAuth handler
- **Web App** (`anicca-web/`) - Browser-based voice assistant
- **Landing Page** (`landing/`) - Product showcase site

### Key Entry Points
- `src/main-voice-simple.ts` - Current main entry (simplified voice version)
- `src/main-voice.ts` - Original voice version
- `src/main-voice-rtmcp.ts` - Experimental RTMCP version

## Essential Commands

### Voice Assistant Development
```bash
# Development (Recommended)
npm run voice:simple     # Run simplified voice version

# Building
npm run build:voice     # TypeScript compilation
npm run dist:voice      # Build DMG for distribution

# Code Quality
npm run lint            # ESLint check
npm run format          # Prettier formatting
```

### Proxy Server Deployment (CRITICAL)
```bash
cd anicca-proxy-slack
npm run dev             # Local development
```

### DMGビルド前の確認事項（重要！）
dist系コマンドを実行する前に必ず：
1. マウントされているDMGを確認: `ls /Volumes/`
2. Aniccaがマウントされていたら強制アンマウント: `hdiutil detach "/Volumes/Anicca*" -force`
3. その後でdistコマンドを実行

### DMG Build Error Recovery
```bash
# If DMG build fails with "resource temporarily unavailable"
hdiutil detach /Volumes/Anicca* -force
rm -rf /private/var/folders/*/T/t-*
```

## Architecture & Key Components

### Voice Assistant Architecture
- **Session Management**: `claudeSession.ts` - Persists conversation context in `~/.anicca/session.json`
- **Voice Processing**: `simpleContinuousVoiceService.ts` - Continuous listening with "Hey Anicca" activation
- **MCP Integration**: `slackMCPManager.ts` - Dynamic tool loading via Model Context Protocol
- **Encryption**: `simpleEncryption.ts` - Uses Electron's safeStorage for API keys
- **OAuth Server**: `slackOAuthServer.ts` - Local server for Slack authentication

### Service Communication
- Express server on port 3838 for browser-electron IPC
- WebSocket for real-time voice data streaming
- All external API calls route through Vercel proxy

### Key Dependencies
- `@anthropic-ai/claude-code` - Claude AI integration
- `@modelcontextprotocol/sdk` - MCP protocol
- `@ricky0123/vad-web` - Voice activity detection
- `@slack/web-api` - Slack integration
- `sqlite3` - Local database

## Deployment Architecture

### Desktop App
- GitHub releases (private repo)
- DMG distribution via proxy server's `/api/download` endpoint
- Code signing and notarization configured

### Proxy Server 
**URL**: anicca-proxy-staging.up.railway.app
**Key endpoints**:
- `/api/claude` - Claude API proxy
- `/api/slack/*` - OAuth flow
- `/api/tools/*` - MCP tools (Exa search, Playwright)
- `/api/download` - DMG distribution

### Web App (Vercel)
**URL**: https://app.aniccaai.com
Auto-deploys on GitHub push

### Landing Page (Netlify)
**URL**: https://aniccaai.com
Deploy: `netlify deploy --prod --dir=landing`

## Environment Variables

### Desktop App
- Minimal `.env` configuration
- API keys encrypted in OS keychain

## Critical Development Notes

1. **Always test before committing** - Build DMG and verify functionality
2. **絶対にゴミロジックを書かない**
   - ❌ NG: `if (task.description.includes('起床'))` のような条件分岐
   - ❌ NG: `${task.description.includes('起床') ? 'A' : 'B'}` のような三項演算子
   - ✅ OK: 自然言語でAniccaに指示を出す
   - **Aniccaは賢い。自然言語で理解できる。余計な制御ロジックは不要**
   - **プロンプトで解決する。金輪際ゴミロジックでAniccaを汚したら許さない**
3. **Voice version is primary** - UI version is deprecated
4. **Session persistence** - Maintains context across app restarts
5. **Privacy-first design** - All data stored locally in `~/.anicca/`

## Current Focus

- Voice assistant (v0.6+) is the active product
- Slack integration via MCP for team collaboration
- Continuous voice recognition with VAD
- Tool extensibility through MCP protocol

## 理想的なモノレポ構成（今後実施予定）

### 構成
```
anicca.ai/ (メインリポジトリ)
├── packages/
│   ├── desktop/    # Electronデスクトップアプリ
│   ├── proxy/      # APIプロキシサーバー
│   └── web/        # Webアプリケーション
├── landing/        # ランディングページ
├── shared/         # 共通ユーティリティ
└── docs/           # ドキュメント
```

### デプロイ設定
- **Vercel（Web）**: Root Directory = `packages/web`
- **Railway（Proxy）**: 
  - Staging: Root Directory = `packages/proxy`
  - Production: Root Directory = `packages/proxy`
- **GitHub Actions**: パス別トリガーでデプロイ自動化

### 環境変数管理
```env
# .env.example
ANICCA_PROXY_URL=https://anicca-proxy-staging.up.railway.app
```

### メリット
- 統一されたバージョン管理
- コード共有の容易性
- 一元的なCI/CD管理
- 依存関係の最適化
- 開発効率の向上
