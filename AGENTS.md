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

## Release & Ops Overview

- リポジトリ構成:
  - Desktop: `Daisuke134/anicca.ai`（本レポ）
  - Web: `Daisuke134/anicca-web`
  - Proxy: `Daisuke134/anicca-proxy`（Railway にデプロイ）

- 配布チャネルとブランチ:
  - Beta: `beta` ブランチに push すると CI（Release Beta）が prerelease を公開（channel=beta, proxy=staging）
  - Stable: `main` ブランチに push すると CI（Release Stable）が正式リリースを公開（channel=stable, proxy=production）

- GitHub Secrets（`Daisuke134/anicca.ai`）:
  - 署名/配布: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`, `CSC_KEY_PASSWORD`
  - プロキシURL: `PROXY_URL_PRODUCTION`, `PROXY_URL_STAGING`
  - 備考: これらは CI 内でのみ使用。アプリ本体には秘匿情報は含まれない（公開可能なドメインのみ埋め込み）。

- Proxy（Railway）環境:
  - Staging / Production の 2 環境。`NODE_ENV` はサーバー挙動向け（ログ/最適化）で、Desktop の接続先切替は配布チャネルで制御（beta→staging, stable→production）。

- Desktop の設定解決（今回の方針）:
  - プロキシURLは、埋め込み `appConfig.proxy` → 環境変数（`PROXY_URL_PRODUCTION/STAGING`）→ 既定URL の順で解決。
  - 更新チャネルは `UPDATE_CHANNEL` を最優先（なければ `NODE_ENV` で推定）。
  - Beta は `allowPrerelease=true`、Stable は `false`。

- 自動更新の動作:
  - 初回は DMG でインストール。以降は `electron-updater` が GitHub Releases を定期チェックし、ZIP をサイレントDL。
  - `autoInstallOnAppQuit=true` のためアプリ終了時に自動適用（ログ: `~/Library/Logs/anicca-agi/main.log`）。

- 検証フロー（運用）:
  1. 現ブランチで修正 → まず同ブランチに push（必須）
  2. `beta` に push → CI が prerelease を公開 → インストールして起動/ログで確認
  3. 版本を上げて再度 `beta` に push → 旧 beta が自動更新されるか確認
  4. 問題なければ `main` に push → 本番リリースで最終確認
