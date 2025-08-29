# Repository Guidelines

絶対に日本語で回答してください！

## プロジェクト構成・モジュール配置
- `src/`: Electron + TypeScript のデスクトップ本体（`main-voice-simple.ts`、`services/`）。
- `src/agents/`: メインエージェント、ツール、MCP 連携。テストは `src/agents/__tests__`。
- `anicca-proxy-slack/`: Express ベースのプロキシ/MCP バックエンド（単体で開発・起動）。
- `anicca-web/`: Next.js Web アプリ（単体で開発・起動）。
- `assets/`, `scripts/`, `landing/`, `dist/`: アセット、ビルド補助、サイト、ビルド成果物。

## ローカル開発・DMG確認（推奨フロー）
- ローカル起動（最速）: `npm run voice:simple`
  - dist/main-voice-simple.js を起動。ログは `~/Library/Logs/anicca-agi/main.log`。
- ローカルDMG作成（最速確認）: `npm run dist:dev`
  - 開いたDMGから `Anicca.app` を必ず `/Applications` へコピーし、DMGを取り出してから起動（read-only回避）。
- 配布（CI）: ローカル確認後、Beta/Stable のブランチに push してCIで配布する。

## ビルド・テスト・開発コマンド（現行運用）
- 開発ラン（推奨）: `npm run voice:simple`
- ビルドのみ: `npm run build:voice`
- ローカルDMG: `npm run dist:dev`（最速検証用・配布はCI）
- テスト（必要時）: `npm test`、エージェント系: `npm run test:agents`

## Release & Ops Overview

- リポジトリ構成:
  - Desktop: `Daisuke134/anicca.ai`（本レポ）
  - Web: `Daisuke134/anicca-web`（Vercel にデプロイ）
  - Proxy: `Daisuke134/anicca-proxy`（Railway にデプロイ）

- 配布チャネルとブランチ:
  - Beta: `beta` ブランチに push → CI（Release Beta）が prerelease を公開（feed=latest, allowPrerelease=true, proxy=staging）
  - Stable: `main` ブランチに push → CI（Release Stable）が正式リリースを公開（feed=latest, allowPrerelease=false, proxy=production）

- GitHub Secrets（`Daisuke134/anicca.ai`）:
  - 署名/配布: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`, `CSC_KEY_PASSWORD`
  - プロキシURL: `PROXY_URL_PRODUCTION`, `PROXY_URL_STAGING`
  - 備考: これらは CI 内でのみ使用。アプリ本体には秘匿情報は含まれない（公開可能なドメインのみ埋め込み）。

- Proxy（Railway）環境:
  - Staging / Production の 2 環境。`NODE_ENV` はサーバー挙動向け（ログ/最適化）で、Desktop の接続先切替は配布チャネルで制御（beta→staging, stable→production）。

-- Desktop の設定解決（現実装）:
  - プロキシURL: 埋め込み `appConfig.proxy` → 環境変数（`PROXY_URL_PRODUCTION/STAGING`）→ 既定URL の順で解決。
  - チャンネル決定: 本番は runtime の `UPDATE_CHANNEL` を無視。アプリのバージョンに `-` が含まれれば beta、無ければ stable。
  - フィード: 安定/ベータともに GitHub Releases の `latest-mac.yml` を参照（feed=latest）。
  - 分離: Beta は `allowPrerelease=true`、Stable は `false`（これで1フィードでも厳密に振る舞い分岐）。

- 自動更新の動作:
  - 初回は DMG でインストール。以降は `electron-updater` が GitHub Releases を定期チェック（起動時＋4時間ごと）、ZIP をサイレントDL。
  - `autoInstallOnAppQuit=true` で終了時適用。ベータ検証時は `update-downloaded` でダイアログ（今すぐ再起動/後で）。
  - ログ確認例（`~/Library/Logs/anicca-agi/main.log`）:
    - 初期化: `Auto-updater initialized (channel=stable|beta, feed=latest, allowPrerelease=...)`
    - 検出: `Found version X.Y.Z ...`
    - DL完了: `Update downloaded: X.Y.Z`
    - 再起動後: `App Version: X.Y.Z`
  - 参考コマンド:
    - `grep -n "App Version\|Update Channel\|Proxy URL\|feed=latest" ~/Library/Logs/anicca-agi/main.log`
    - `grep -n "Found version\|Update downloaded" ~/Library/Logs/anicca-agi/main.log`

- 検証フロー（運用）:
  1. 現ブランチで修正 → まず同ブランチに push（必須）
  2. `beta` に push → CI が prerelease を公開 → インストールして起動/ログで確認
  3. 版本を上げて再度 `beta` に push → 旧 beta が自動更新されるか確認
  4. 問題なければ `main` に push → 本番リリースで最終確認

## Release Strategy (Trunk + Tags)

- 方針: トランクベース（`main` を単一の真実）+ タグ駆動で `beta`/`stable` を配布
- 流れ:
  - 開発: 短命 `feature/<topic>` → PR → `main` にマージ（小さく速く）
  - Beta配布: 対象コミットにプレリリースタグ `vX.Y.Z-beta.N` を付与 → CI が prerelease 公開（channel=beta, proxy=staging）
  - Stable配布: 検証OKの同コミット（または軽微修正コミット）に安定タグ `vX.Y.Z` を付与 → CI が正式リリース（channel=stable, proxy=production）
- 理由:
  - ドリフト防止（`main` 1本で履歴が明快）
  - リリース粒度や履歴の可視性が高く、ロールバック容易
  - `beta`/`stable` 切替がタグで一意に決まり、CIも単純

### 具体例（新機能「クイック返信」）

1) 実装～`main`取り込み
```
git switch -c feature/quick-reply
# 実装・テスト
git add -A && git commit -m "feat(quick-reply): support inline reply"
git push -u origin HEAD
# → GitHubでPR作成 → CI/レビュー → mainへマージ
```

2) Beta配布（検証用）
```
git switch main && git pull --ff-only
# バージョンをプレリリースへ（npm versionでもOK）
git tag v0.6.4-beta.1
git push origin v0.6.4-beta.1
# → CI: Release Beta が走り、prerelease を公開
```

3) 検証後にStable配布
```
# 不具合なければ同コミット、修正あればそのコミットに対して
git tag v0.6.4
git push origin v0.6.4
# → CI: Release Stable が走り、正式リリースを公開
```

4) 運用Tips
- ブランチ保護: `main` はPR必須・レビュー必須に。`beta` ブランチは不要（タグ運用のため）
- バージョン: npm/package.json の version も `0.6.4-beta.1` → `0.6.4` の順で整合
- ログ確認: `~/Library/Logs/anicca-agi/main.log` でチャネル・更新適用を確認

### 自動更新の検証手順（最短）
- ベータ公開後、1–2分ほど待つ（Releasesのフィード反映ラグ）
- アプリを終了→再起動（起動時に即チェック）
- ログで以下を確認:
  - `Auto-updater initialized (channel=beta, allowPrerelease=true)`
  - `Found version X.Y.Z-beta.N` → `Downloading update ...` → `Update downloaded: X.Y.Z-beta.N`
  - ダイアログ「今すぐ再起動/後で」→ 今すぐ再起動で即適用（終了時でも適用）

## 運用: Vercel/Railway のログ取得（CLI）

以下は、Web(=Vercel) と Proxy(=Railway) のログを私（エージェント）が直接取得・解析するための標準手順です。

**前提**
- 権限は最小限: Vercel はパーソナルアクセストークン（読み取りのみ）、Railway はプロジェクトトークン（環境スコープ）。
- トークンはこのセッションのみで使用し、ディスク保存しない。

**Vercel: アクセストークン発行（UI操作）**
- 右上アバター → `Account Settings`（チームなら `Team Settings`）→ 左メニュー `Security`/`Access Tokens`（`Tokens`）→ `Create`。
- 入力: `Name`（例: `anicca-cli-local-YYYYMMDD`）、`Scope`（個人 or 対象チーム）、有効期限（必要に応じて）。
- 作成後に表示される値を安全にコピー（再表示不可）。

**Vercel: CLI でのログ取得**
- インストール: `npm i -g vercel`
- 認証確認: `vercel whoami --token "$VERCEL_TOKEN"`
- ビルドログ（特定デプロイ/URL）: `vercel inspect <deployment-url-or-id> --logs --wait --token "$VERCEL_TOKEN"`
- ランタイムログ（Functions/Middleware）: `vercel logs <deployment-url-or-id|url> --since 24h --token "$VERCEL_TOKEN"`
  - 例: `vercel inspect https://app.aniccaai.com --logs --wait ...`
  - 例: `vercel logs https://app.aniccaai.com --since 1h ...`

**Railway: プロジェクトトークン発行（UI操作）**
- 対象プロジェクトを開く → `Settings` → `Tokens` → `Create Token`。
- `Environment` を選択（`Staging` or `Production`）。必要なら `Name`、期限を設定 → 作成 → 表示値を安全にコピー（再表示不可）。

**Railway: CLI でのログ取得**
- インストール: `npm i -g @railway/cli`（macOS は `brew install railway` も可）
- ステージング環境の例: `export RAILWAY_TOKEN=<staging-token>` → `railway logs --deployment`（実行ログ）、`railway logs --build`（ビルドログ）
- 本番環境の例: `export RAILWAY_TOKEN=<production-token>` → 同上
  - 必要に応じて `railway link` でプロジェクト紐付け（トークンが環境スコープなら省略可）。

**運用メモ**
- トークンは最小権限・短期限で発行し、不要になったら破棄/ローテーション。
- ログ量が多い場合は `--since 1h` や `--tail` を活用し、`jq`/フィルタで解析。
