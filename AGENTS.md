# Repository Guidelines

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

### Proxy反映メモ（重要・数行）
- Staging 反映: `Daisuke134/anicca-proxy` の `feature/user-based-connections` ブランチへ push → Railway(Staging) が自動デプロイ。
- Production 反映: `main` ブランチへ push → Railway(Production) が自動デプロイ。
- ローカル検証時は `UPDATE_CHANNEL=beta` を付与して起動（staging を参照）。例: `UPDATE_CHANNEL=beta npm run voice:simple`

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
