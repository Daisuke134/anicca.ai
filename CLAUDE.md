# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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