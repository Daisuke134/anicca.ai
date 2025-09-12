Refactor 方針（最終版）

- 目的: 直書き・フルパス・マジックナンバーを排し、設定/CIで切替可能な「シンプルで確実な」構成へ統一する。
- 前提: サーバ(API)は Railway の Staging/Production、Web は Vercel、Landing は Netlify、Desktop は DMG 配布（GitHub Releases）。
- 原則: 接続先ドメインは「コードに直書きしない」。サーバ側は環境変数、Desktop は「CI埋め込み or ローカル .env」で解決する。

---

1) フルパスのハードコーディング撲滅 (/Users/… の禁止)

- 対象: リポジトリ直下の .env
  - 問題: GOOGLE_APPLICATION_CREDENTIALS=/Users/… の絶対パスが記載されていた。
  - 指示: この行を削除し、ローカルでも「GCP_SA_KEY_JSON を環境変数に入れて起動時に /tmp/gcp.json に書き出し GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp.json をexport」する方式に統一する（apps/api/railway.toml の startCommand と同一運用）。
- CI: /Users/ の出現を検知して失敗させる簡易チェック（grep）を追加（実装タスクは後述）。

---

2) ハードコーディングの排除（接続先/設定の一元化、マジックナンバーは定数化）

- API 側ベースURL（apps/api/src/config/environment.js）
  - 変更: PROXY_BASE_URL の「Railwayドメイン直書き」および NODE_ENV によるドメイン切替を削除し、process.env.PROXY_BASE_URL のみを採用する。未設定時は起動エラー（本番/開発ともに必須扱い）。
  - 備考: NODE_ENV はログ/最適化のみに使用（接続先の決定には使わない）。

- HTTP MCP サーバ（apps/api/mcp-servers/http-mcp-server.js）
  - 変更: PROXY_BASE_URL の直書きを廃止し、process.env.PROXY_BASE_URL を必須化（未設定は起動エラー）。

- Desktop の接続先解決（apps/desktop/src/config.ts）
  - 変更: 既定URL（Railway ドメイン）の直書きフォールバックを削除。
  - 解決順: 「埋め込み appConfig.proxy（CIが production/staging を埋め込む）→ 環境変数 PROXY_URL_PRODUCTION/PROXY_URL_STAGING」。これ以外は例外。localhost フォールバックは設けない。
  - UPDATE_CHANNEL(beta/stable) は従来どおり。解決先 URL は上記の解決関数のみから取得する。

- Desktop のエージェント/ツール
  - 対象: apps/desktop/src/agents/tools.ts / apps/desktop/src/agents/sessionManager.ts
  - 変更: ファイル内の「const PROXY_URL = …」などの再定義を撤廃し、../config から export される PROXY_URL または API_ENDPOINTS を import して使用する。

- Web（apps/web）
  - 方針: NEXT_PUBLIC_PROXY_URL 未設定時は例外で早期検知（現状維持）。

- Landing（apps/landing/landing/index.html / netlify.toml）
  - 変更: ダウンロードリンクは相対パス `/api/download?arch=arm64` に変更。
  - Netlify に本番 Proxy への転送を追加：
    [[redirects]]
    from = "/api/*"
    to = "https://anicca-proxy-production.up.railway.app/api/:splat"
    status = 200
  - 効果: Landing 側はリンクを固定のまま、常に最新リリースの DMG を取得可能（/api/download は GitHub Releases の latest を参照）。

- マジックナンバーの定数化
  - Desktop: `AUDIO_SAMPLE_RATE(24000)`, `WS_RECONNECT_DELAY_MS`, `CHECK_STATUS_INTERVAL_MS`, `NETWORK_TIMEOUT_MS`, `NETWORK_CACHE_MS` 等を config.ts に集約し、recorder/AudioContext/setTimeout 値を置換。
  - API: `DUPLICATE_WINDOW(30000)`, `MAX_WAIT_MS(10000)` 等を apps/api/src/config/constants.js（新設）に集約し、ParentAgent.js / message.js 等から参照。

---

3) ファイル/コードの削除・維持の方針

- ルート .env: 削除（追跡しない）。各アプリ直下の .env を使用し、OSS には .env.example を同梱。
- apps/desktop/prompts/*.txt: 維持（重要）
  - 理由: main-voice-simple.ts の `executeScheduledTask()` が `common.txt` + 各テンプレート（wake_up.txt / sleep.txt / standup.txt / mtg_pre.txt / mtg_start.txt / jihi_meditation.txt など）を読み込む。electron-builder 設定でも同梱対象。
- tmp/ 配下: Git 追跡対象を削除し、.gitignore に `tmp/` を追加（既にある場合は確認）。
- apps/api/debug-tools/check-supabase-storage.js: 本番と分離。scripts/ へ移動して README に利用手順を記載、または削除（どちらかを選択）。
- apps/api/src/server.js: 旧後方互換の大きなコメントブロック（グローバルトークン読込）を削除し、DBベース運用へ一本化。
- apps/desktop/package.json: `build` の src/ui コピー行（実体なし）を削除し、ビルド整合を取る。

---

4) セキュリティ強化

- Slack トークン暗号鍵 `SLACK_TOKEN_ENCRYPTION_KEY` を必須化。
  - 対象: apps/api/src/api/auth/slack/oauth-callback.js / check-connection.js / tools/web/slack.js
  - 変更: 未設定時にランダム生成せず明確にエラー（復号不能事故を防止）。

---

5) 環境変数・CI/配布の整理

- Railway（Staging/Production）
  - 追加(必須): `PROXY_BASE_URL`（Staging→https://anicca-proxy-staging.up.railway.app, Production→https://anicca-proxy-production.up.railway.app）
  - 維持: `SLACK_TOKEN_ENCRYPTION_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, 各種 API キー
  - 整理: `SLACK_REDIRECT_URI`（未使用）削除可

- Desktop（ローカル開発 .env の最小例）
  - ローカルでも常に Staging を使う運用のため、以下だけで良い：
    UPDATE_CHANNEL=beta
    PROXY_URL_STAGING=https://anicca-proxy-staging.up.railway.app
    USE_PROXY=true
    DESKTOP_MODE=true
  - 備考: リリース版（DMG）は CI が `appConfig.proxy` を埋め込むため、.env は不要。OSS には `.env` は含めない（`.env.example` のみ）。

- CI（GitHub Actions）
  - 既存: release-beta.yml / release-stable.yml が `-c.extraMetadata.appConfig.proxy.production/staging` を埋め込み、Notarization 用 Secrets も注入。electron-updater は production でのみ有効化。現行フロー（Beta→Stable→自動更新）は維持。

---

6) 実装順（TODO）

1. Desktop: apps/desktop/src/config.ts から Railway ドメイン直書きフォールバックを削除。解決順を「埋め込み→ENV」のみに固定。
2. Desktop: apps/desktop/src/agents/tools.ts / sessionManager.ts のローカル PROXY_URL 定義を削除し、config の PROXY_URL / API_ENDPOINTS 参照に統一。
3. Desktop: マジックナンバーを config.ts の定数へ移し、参照を置換（AUDIO_SAMPLE_RATE/NETWORK/WS/INTERVAL）。
4. API: apps/api/src/config/environment.js と apps/api/mcp-servers/http-mcp-server.js から直書き/切替ロジックを撤去し、`process.env.PROXY_BASE_URL` 必須に統一。
5. API: Slack 暗号鍵の必須化（ランダム生成を廃止）。
6. Landing: ダウンロードリンクを相対化し、netlify.toml に /api/* → 本番 Proxy のリダイレクトを追加。
7. 整理: ルート .env 削除、tmp/ の追跡削除と .gitignore 追記、debug-tools を scripts/ へ移動 or 削除、server.js の旧コメント削除、desktop の不要 build コピー行削除。
8. CI: 直書き検知の簡易ジョブ（/Users/ や .railway.app を grep で検出）を追加。

---

7) 検証項目（最短セット）

- Desktop（開発）: `npm run voice:simple` のログに `Update Channel: beta` と `Proxy URL: https://anicca-proxy-staging…` が出る。
- Desktop（DMG: dist:dev）: 起動ログでも同様に Staging を参照（CI と同様、appConfig.proxy をビルド前に埋め込む前処理を追加して確認）。
- API（Railway）: `/health=200`、`/api/slack/oauth-url → 認可 → /api/slack/check-connection` が `{connected: true}` を返す。`PROXY_BASE_URL` 未設定時は起動エラーになる。
- Landing（Netlify）: `/api/download?arch=arm64` で最新 DMG をダウンロードできる（GitHub Releases latest を参照）。

---

補足

- examples/ 配下は参照用としてローカルに残すが、配布/実装対象外（.gitignore で管理）。
- Desktop の prompts/*.txt は削除しない（Cron 発火時に使用）。
- NODE_ENV はログ/最適化/autoUpdater の gating に使用（接続先切替には使わない）。

