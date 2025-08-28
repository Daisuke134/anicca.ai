# Repository Guidelines

## プロジェクト構成・モジュール配置
- `src/`: Electron + TypeScript のデスクトップ本体（`main-voice-simple.ts`、`services/`）。
- `src/agents/`: メインエージェント、ツール、MCP 連携。テストは `src/agents/__tests__`。
- `anicca-proxy-slack/`: Express ベースのプロキシ/MCP バックエンド（単体で開発・起動）。
- `anicca-web/`: Next.js Web アプリ（単体で開発・起動）。
- `assets/`, `scripts/`, `landing/`, `dist/`: アセット、ビルド補助、サイト、ビルド成果物。

## ビルド・テスト・開発コマンド
- 音声開発ラン: `npm run voice:simple`（ビルド後に Electron を起動）。
- デスクトップビルド: `npm run build:voice`（`tsconfig.voice.json` でコンパイル＋アセット配置）。
- Electron 開発起動: `npm run electron-dev`（`NODE_ENV=development`）。
- DMG パッケージ: `npm run dist:dev | dist:staging | dist:production`。
- テスト全体: `npm test`／ウォッチ: `npm run test:watch`。
- エージェント限定: `npm run test:agents`／カバレッジ: `npm run test:agents:coverage`。
- 品質: `npm run lint`／`npm run format`。
- サブプロジェクト起動: `cd anicca-proxy-slack && npm run dev`, `cd anicca-web && npm run dev`。

## コーディング規約・命名
- TypeScript 厳格設定。`any` は許容だが極力避け、明示的な型を優先。
- ESLint + Prettier（2 スペース）。ファイルは機能単位、テストは `.test.ts` 接尾辞。
- 依存はデスクトップ側は `src/` 内で閉じる（サブプロジェクトを直接 import しない）。

## テスト方針
- フレームワーク: Vitest（Node 環境）。v8 カバレッジ、`text/json/html` レポート。
- 配置: `src/**/__tests__/**/*.test.ts`（推奨）または `src/**/*.test.ts`。
- 新規ツールは `src/agents/tools.ts` に追加し、ユニットテストを同時に用意。
- PR 前に `npm run test:agents:coverage` を通過させる。

## コミット・PR ガイドライン
- Conventional Commits 推奨（例: `feat:`, `fix:`, `chore:`）。必要に応じてスコープ（`feat(agents): ...`）。
- ブランチ命名: `feature/...`, `fix/...`, `hotfix/...`（例: `feature/desktop-app-parent-worker`）。
- PR 必須情報: 目的/背景（Issue 連携可）、変更点、テスト手順と結果、UI/配布影響時はスクショ/ログ。

## セキュリティ・設定 Tips
- 機密値は `.env`（ルート/各サブプロジェクト）で読み込み、コミット禁止。
- macOS のパッケージ前に既存 `Anicca` ボリュームをアンマウントしてビルド失敗を防止。
