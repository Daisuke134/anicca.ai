# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ANICCA is a multi-platform AI assistant ecosystem with voice interaction, screen analysis, and tool integration capabilities. The project consists of several components across multiple repositories.

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
npm run voice           # Run original voice version

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
vercel --prod          # Deploy to production (REQUIRED - GitHub push alone won't deploy!)
```

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

### Proxy Server (Vercel)
**URL**: https://anicca-proxy-ten.vercel.app
**Critical**: Manual deployment with `vercel --prod` required
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

### Proxy Server (Required in Vercel)
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `ELEVENLABS_API_KEY`
- `GITHUB_TOKEN`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`

## Critical Development Notes

1. **Always test before committing** - Build DMG and verify functionality
2. **Proxy deployment is manual** - `vercel --prod` required for changes
3. **Voice version is primary** - UI version is deprecated
4. **Session persistence** - Maintains context across app restarts
5. **Privacy-first design** - All data stored locally in `~/.anicca/`

## Current Focus

- Voice assistant (v0.6+) is the active product
- Slack integration via MCP for team collaboration
- Continuous voice recognition with VAD
- Tool extensibility through MCP protocol