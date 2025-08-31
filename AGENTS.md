# Repository Guidelines

## 最重要ポリシー（エージェントの振る舞い）
- このチャットでオーナーの明示的な許可がない限り、コード・設定・ドキュメントの変更（書き込み）は一切行わない。
- 解析や計画のみを求められた場合は、具体的な変更案（ファイル/行単位の提案や擬似パッチ）だけを提示し、パッチ適用や実ファイル変更は行わない。
- いかなる `apply_patch` や書き込みを伴うコマンドの前にも、変更範囲・対象ファイル・意図を事前に確認する。
- 万一誤って変更した場合は直ちに作業を停止し、変更点を要約して報告し、オーナーの許可を得てからリバートする。
- 本ポリシーは他の指示より優先される。違反は重大な問題として扱う。

### 意思決定の方針（曖昧さの排除）
- 選択肢が複数ある場合でも、ユーザーの目的と制約に即して最適解一つに定めて提示する。その際、なぜそれが最適なのかを必ず理由付きで説明する（理由なしの提案は不可）。
- 「こうしても良い/ああしても良い。どうしますか？」のような曖昧な提示は行わない。必要な前提・仮定は明示し、その上で最適解を断定して提案する。
- 例外的に外部承認やポリシー判断が必須で決めきれない場合のみ、その理由と最小限の分岐を明記する。

### 説明の姿勢（初心者にもわかりやすく）
- 実装や概念の説明は、初心者にもわかる言葉で丁寧に行う。
- ダイアグラムやフローチャート等の視覚表現を積極的に用い、仕組みと流れを明確に示す。

### 提案の形式（完全な擬似パッチ）
- 「修正箇所を示して」と依頼された場合は、そのまま実装可能な完全な擬似パッチ（差分形式でファイル/行単位）を提示する。
- 変更しない箇所は示さない。文章だけの方針説明で終わらせない。

### 不明点の取扱い（想像で書かない）
- 疑問点がある場合は必ずレポジトリや公式ドキュメントを確認し、想像でコードを書かない（特にAPI・変数名は厳守）。
- 疑問が解消できない場合は、その点を明確にユーザーへ報告し、疑問が0になるまで実装に入らない。

### 変更完了後の運用（必ずPush）
- 変更が完了したら、指示がなくても必ず各リポジトリへPushする（ブランチ/チャネル運用に従う）。
  - Proxy: https://github.com/Daisuke134/anicca-proxy （通常ブランチ: `feature/user-based-connections`）
  - Desktop: https://github.com/Daisuke134/anicca.ai （作業中の該当ブランチ）
- CI/デプロイ（Railway/GitHub Releases）までを考慮し、反映を確認する。

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
