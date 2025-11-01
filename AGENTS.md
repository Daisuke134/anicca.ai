Pythonなどのコード実行を禁止します。

# Repository Guidelines
日本語で簡潔かつ丁寧に回答してください

### 意思決定の方針（曖昧さの排除）
- 選択肢が複数ある場合でも、目的と制約に即した最適解を一つに定めて提示し、理由を明記する。
- 「こうしても良い/ああしても良い」の提示は行わない。前提・仮定を明示の上で断定する。
- 外部承認やポリシー判断が必須で断定できない場合のみ、理由と最小限の分岐を明記する。

### 単一解提示の厳守（ベストパスの一本化）
- 手順/対処法は常に「最適な一つ」だけを提示（複数案は要求がある場合のみ）。
- 代替案は提示しない。必要があれば「選ばない理由」を簡潔に付記する。
- 実装・説明・運用・トラブルシュートの全場面に適用する。

### 説明の姿勢（初心者にもわかりやすく）
- 用語は平易に。概念/データフローは段階立てて説明する。
- 可能な限り手順は「コピペで再現可能」な形にする。

### 提案の形式（完全な擬似パッチ）
- 「修正箇所を示して」と依頼された場合、そのまま適用可能な差分（ファイル/行単位）で提示する。
- 変更しない箇所は示さない。方針説明のみで終えない。

### 不明点の取扱い（想像で書かない）
- API/変数名/契約は必ず実ソース・公式ドキュメントを確認。推測で書かない。
- 疑問が残る場合はその点を明記し、解消されるまで実装に入らない。

### 変更完了後の運用（必ずPush）
- 変更が完了したら、指示がなくても必ず本モノレポ（github.com/Daisuke134/anicca.ai）へ Push（作業ブランチ）する。
- CI/デプロイ（Railway/Vercel/Netlify/GitHub Releases）までを考慮し、反映を確認する。
- 配布（DMG）の「出荷」はタグ駆動（後述）。ブランチ Push では配布されない。

#### Git Push 実行手順（sandbox 環境）
1. `git status --short` で変更ファイルを確認する。
2. 取り込む変更だけを `git add <パス>` でステージする（`.git` 配下へ書き込むため必ず権限昇格を伴う実行とする）。
3. 再度 `git status --short` を実行し、想定どおりステージされていることを確認する。
4. `git commit -m "..."` でコミットする（権限昇格必須）。
5. `git push origin <ブランチ名>` でリモートへ反映する（権限昇格必須）。
6. 必要に応じて `git status` で作業ツリーが clean であることを確認する。

#### Git 操作の禁止事項
- `.git/index.lock` を含む `.git` 配下のファイルを直接参照・生成・削除しようとする操作（例：`ls .git/index.lock` や `touch .git/index.lock`）を行わない。

### ドキュメント言語ポリシー（重要）
- 新規に追加・更新する MD/MDX ドキュメントは必ず日本語で記載する。
- 多言語が必要な場合でも、日本語版を先に用意（英語は補助）。
- 適用範囲: `docs/` 配下および設計/要件定義の MD/MDX。

### 固定パスとPush先の厳守（重要・モノレポ対応）
- 実装・修正の対象パス（モノレポ直下）
  - `apps/desktop/` … Electron デスクトップ本体（例: `apps/desktop/src/**`）
  - `apps/api/` … Proxy/API（Railway 配備）（例: `apps/api/src/**`）
  - `apps/web/` … Web アプリ（Vercel 配備）
  - `apps/landing/` … ランディング（Netlify 配備）
  - `apps/workspace-mcp/` … Hosted MCP（Railway 配備）
  - `docs/`, `examples/` … ドキュメント/参考
- 一時クローン/実験は `tmp/` 配下のみ使用可。`tmp/` は永続化・コミット禁止。
  - 誤ってサブモジュール（gitlink）になった場合の除去:
    - `git rm -f --cached tmp/xxxx`
    - `rm -rf .git/modules/tmp/xxxx`
    - `git commit -m "chore: remove stale submodule tmp/xxxx"`
- Push 先: 原則 `feature/<topic>` ブランチで作業 → PR → `main` にマージ。配布（DMG 公開）はタグ push（`vX.Y.Z[-beta.N]`）のみで実行（後述）。

### ネットワーク操作・検証ポリシー（重要・必ず実行）
- オーナー許可がある場合、外部ネットワークを用いた疎通確認・API ステータス確認を自ら実行する。
- 「叩いて確認して」と言われたら拒否しない。環境変数の有無を確認してから実行し、ログ付きで共有。
- 代表例
  - Proxy エンドポイント検証:
    - 必要: `PROXY_BASE`, `USER_ID`
    - 例: `curl -sS -X POST "$PROXY_BASE/api/mcp/gcal/status" -H "Content-Type: application/json" -d '{"userId":"'"$USER_ID"'"}'`
  - Realtime クライアントシークレット発行:
    - 必要: `OPENAI_API_KEY`
    - 例: `curl -sS -X POST https://api.openai.com/v1/realtime/client_secrets -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" -d '{...}'`
- 実行前に `OPENAI_API_KEY`, `PROXY_BASE`, `WORKSPACE_MCP_URL` 等の設定を確認。不足があれば明示する。

---

## ホスティング（配置先）
- リポジトリ（モノレポ）
  - GitHub: https://github.com/Daisuke134/anicca.ai
- ホスティング/配備
  - Railway: `apps/api`（Proxy/API）, `apps/workspace-mcp`（MCP）
  - Vercel: `apps/web`（Web アプリ）
- Netlify: `apps/landing`（ランディング）。`netlify.toml`（リポジトリ直下）がソース・オブ・トゥルース
    - `[build] base = "apps/landing"`, `publish = "."`
    - `[[redirects]]` `/api/*` → Railway Production（プロキシ）など

### Railway デプロイ運用（MCP 使用手順）
- Proxy/API（`apps/api`）は Railway プロジェクト内の **API** サービスにデプロイされている（staging / production とも同一プロジェクト）。
- デプロイは必ず Railway MCP（`railway-mcp-server`）を利用し、外部 CLI を直接叩かない。
- 手順（例: staging）
  1. リポジトリ直下（`/Users/.../anicca-project`）を `workspacePath` に指定し、`environment` は `staging`、`service` は `API` を指定する。
     - 例: `railway-mcp-server.deploy({"workspacePath":"/path/to/anicca-project","environment":"staging","service":"API"})`
  2. Railway 側でルートディレクトリは `apps/api` に設定されているため、追加のパス指定は不要。
  3. デプロイ後、MCP のレスポンスに提示されるビルドログ URL で結果を確認する。
- Production に deploy する場合も同じ手順で `environment` を `production` に変更する。
- `npm run voice:simple` は staging プロキシを参照するため、staging を英語化したいときはこの手順で必ず再デプロイする。

---

## モノレポ構成（要点）
- `apps/desktop` … Electron（音声版）。配布は GitHub Releases。自動更新は electron-updater
- `apps/api` … Proxy/API。Railway にデプロイ
- `apps/web` … Web アプリ（Next.js）。Vercel にデプロイ
- `apps/landing` … LP（静的）。Netlify にデプロイ。`/api/*` は Railway にリダイレクト
- `apps/workspace-mcp` … Google Calendar などの hosted MCP
- `docs/`, `examples/` … ドキュメント/参考

---

## リリース & 配布（Tag-Driven）
- 目的: 「出荷スイッチ」をタグに一本化し、誤配布を防止。バージョンとチャネル（beta/stable）の整合を CI で保証。
- チャネル定義
  - Beta: プレリリース。タグ `vX.Y.Z-beta.N`（例: `v0.6.8-beta.1`）
  - Stable: 正式リリース。タグ `vX.Y.Z`（例: `v0.6.8`）
- トリガー（CI: `.github/workflows/`）
  - Beta: タグ push `v*.*.*-beta.*` → macOS 署名/公証 → GitHub Releases（prerelease）公開 → アップデータ用ファイル生成（自動ノート）
  - Stable: タグ push `v*.*.*` → GitHub Releases（release）公開 → アップデータ用ファイル生成（自動ノート）
- バージョン整合チェック（CI）
  - `apps/desktop/package.json` の `version` がタグ（先頭の `v` を除く）と一致しない場合は失敗
  - 例: タグ `v0.6.8-beta.1` → `"0.6.8-beta.1"`
- デスクトップ配布アセット
  - 対応: macOS arm64（Apple Silicon）
  - DMG 名: `anicca-arm64.dmg`（固定）
  - LP ダウンロードリンク（常に最新の安定版）:
    - `https://github.com/Daisuke134/anicca.ai/releases/latest/download/anicca-arm64.dmg`
    - プレリリース（Beta）は `latest` に含まれない（一般ユーザーは安定版のみ取得）
- 自動更新（electron-updater）
  - 起動時 + 4時間おきチェック（`apps/desktop/src/config.ts` の `UPDATE_CONFIG`）
  - チャネル判定: バージョンにハイフン（`-beta…`）があれば Beta、無ければ Stable
  - 既定: `allowPrerelease = false`（Stable は Stable のみ、Beta は Beta を取得）
  - 適用: ダウンロード後、アプリ終了時に自動適用（再起動で反映）
  - ログ: `~/Library/Logs/anicca-agi/main.log`
- 秘密情報/設定（配布用）
  - GitHub Actions Secrets（レポ: `Daisuke134/anicca.ai`）
    - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
    - `CSC_LINK`, `CSC_KEY_PASSWORD`
    - `PROXY_URL_PRODUCTION`, `PROXY_URL_STAGING`（CI で `package.json` に埋め込み、ハードコードはしない）

---
## デスクトップ：ローカル検証 → ベータ → 安定（Runbook）
※ すべて `apps/desktop` ディレクトリで実行する。

1. `npm run voice:simple` … ローカル開発モードで音声入出力と課金導線を最短確認
2. `npm run dist:dev` … 署名なし DMG を生成し、手元で起動確認
3. （任意）`npm run dist:staging` … ステージング値の DMG が必要な場合だけ実施
4. `git push` → `main` へマージ … リリース対象のソースを main に反映
5. `npm version X.Y.Z --no-git-tag-version` … 本番リリースするバージョン番号を反映
6. `npm run dist:production` … 署名・公証対象 DMG をローカルで検証
7. `git commit -am "chore(release): vX.Y.Z"` … バージョン反映コミットを作成
8. `git tag vX.Y.Z` … 配布トリガーとなるタグを作成
9. `git push origin HEAD --tags` … タグを push して CI に notarize／Releases を実行させる
10. GitHub Releases と Netlify のダウンロード導線が最新 DMG を配布しているか確認

※ ステージング配布が必要な場合は、上記とは別に `npm version X.Y.Z-beta.N --no-git-tag-version` → `git tag vX.Y.Z-beta.N` → `git push origin HEAD --tags` を行い、staging 接続のプレリリースを作成する。

#### dist 系コマンドと環境変数の解決順
- `npm run dist:*` は `dotenv --override -e .env.defaults -e .env.local` を経由して環境変数を読み込む。
- `.env.defaults` はテンプレート（ステージング向け既定値）として維持し、実運用時は `.env.local` で本番値を上書きする。
- `.env.local` を正しく用意した状態で `dist:production` を実行すれば、生成される DMG には本番設定（stable チャネル / 本番 Proxy / Supabase / Stripe）が焼き込まれる。
- ローカル検証用の `npm run voice:simple` も `dotenv --override -e .env.defaults -e .env.local` を内部で呼び出すため、`.env.local` に書いた値がそのまま適用される。

---

## ランディング（Netlify）とダウンロード導線
- `netlify.toml`（リポ直下）がソース・オブ・トゥルース
  - `[build] base = "apps/landing"`, `publish = "."`
  - `[[redirects]]` `/api/*` → Railway Production（プロキシ）
- ダウンロードボタン
  - Apple Silicon（arm64）: `https://github.com/Daisuke134/anicca.ai/releases/latest/download/anicca-arm64.dmg`
  - LP のバージョン表記は削除。最新版は GitHub Releases を参照
- ブランチ・デプロイ
  - Production: `main`、Branch deploy: 運用で指定したブランチ（例: `feature/...`）
  - PR を `main` に向けると Deploy Preview が出る

---

## Web（Vercel）
- `apps/web` は Vercel でビルド/配備（Next.js）。環境変数/プロジェクト設定は Vercel 側で管理

---

## Proxy/API（Railway）
- `apps/api` は Railway Deploy。`railway.toml` の `startCommand` を使用
- Secrets（GCP 連携など）は Railway 側に設定
- LP の `/api/*` は Railway 側の Production にリダイレクトされる

---

## Hosted MCP（Railway）
- `apps/workspace-mcp` は Railway Deploy（サービス分離）
- Google Workspace などの認可/資格情報は Railway 側で安全に管理
- デスクトップは hosted MCP をツールとして利用

---

## 運用 Tips（安全性・再現性）
- タグ＝出荷スイッチの原則
  - ブランチ Push では配布は走らない。出すと決めたコミットにのみタグを付与
- サブモジュール汚染の回避
  - `tmp/` はコミットしない。万一 gitlink 化したら「固定パスとPush先の厳守」の手順で除去
- リリースノート
  - CI が自動生成（generate-notes）。必要に応じて手動で追記
- ロールバック
  - 直前の安定タグにユーザーを誘導（LP は latest 安定版のため、必要なら該当版の直リンクを一時掲示）

---

## 体験の流れ（要約）
1. デスクトップ起動 → トレイ常駐、音声準備
2. ホットキー（MediaPlayPause/F8）で会話モードへ
3. 予定確認/作成、リマインド、Slack 送信などを音声で依頼
4. 外部送信は直前に明示承認、終了時は自動で待機
