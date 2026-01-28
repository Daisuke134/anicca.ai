# Backend クリーンアップ & DB明確化 Spec

**バージョン**: 1.5.x
**日付**: 2026-01-28
**ステータス**: Phase 1 完了 / Phase 2 実装中

---

## 開発環境

| 項目 | 値 |
|------|-----|
| **ワークツリーパス** | `/Users/cbns03/Downloads/anicca-backend-cleanup` |
| **ブランチ** | `feature/backend-cleanup` |
| **ベースブランチ** | `dev` |
| **作業状態** | Phase 2 実装中 |

---

## 1. 概要（What & Why）

### What

コードベースから Dead Code・Desktop 残骸・誤解を招く Supabase 参照を整理し、「Railway PostgreSQL がメイン DB」であることをコードを読むだけで明確に分かるようにする。さらに、プロジェクトルートに散乱するジャンクファイル・冗長ディレクトリを整理し、モノレポ構造を明確にする。

### Why

| 問題 | 影響 |
|------|------|
| AI が「Supabase 使ってる」と誤認する | 毎セッションで誤った前提の回答が生成される |
| Desktop 残骸（4.7GB）がリポジトリに残存 | git clone が重い、コードベースが混乱する |
| Dead Prisma モデルが schema にある | スキーマの正確性が損なわれる |
| `examples/`（8.3GB）、`plantuml/`（48MB）が放置 | ノイズ、ディスク浪費 |
| ルートに PNG/CSV/JSON/動画がばら撒かれている | プロジェクト構造が不明確、新規参加者が混乱 |
| `.agents/` と `.claude/skills/` が重複 | シンボリックリンクで循環参照、メンテ困難 |

### DB アーキテクチャの真実

```
現在（変更しない）:
  Railway Container (Node.js Express API)
       ↓
  Railway PostgreSQL（メインDB — Prisma ORM経由）
       ↓
  Supabase SDK（補助のみ — Slackトークン、Worker Memory等）
```

### 将来の Supabase 移行について

Railway PostgreSQL → Supabase PostgreSQL への移行は**将来のオプション**として検討中。今回は実施しない。

| メリット | 詳細 |
|---------|------|
| コスト削減 | Railway $92.50/月 → Supabase Pro $25/月（約70%減） |
| 統合サービス | Auth, Storage, Edge Functions がビルトイン |
| Solo Dev 最適化 | DevOps 作業の削減 |

| 今やらない理由 | 詳細 |
|---------------|------|
| 動いてるものを触るリスク | 本番 DB の移行は慎重に |
| Realtime 不要 | Phase 8「察する」はバッチ分析であり、リアルタイム通信ではない |
| 緊急性がない | 現状のコストとアーキテクチャで問題ない |

移行を検討する場合のリサーチは完了済み:
- `.cursor/plans/ios/1.5.0/20260128_api-audit-and-supabase-migration.md`
- `.cursor/plans/ios/1.5.0/20260128_000727_railway-to-supabase_research.md`

---

## 2. 受け入れ条件

### Phase 1: Backend クリーンアップ & DB 明確化（✅ 完了）

| # | 条件 | テスト可能な形式 | 状態 |
|---|------|----------------|------|
| AC1 | Dead Prisma モデル（HabitLog, MobileAlarmSchedule）が schema.prisma から削除 | `grep -c "model HabitLog" schema.prisma` → 0 | ✅ |
| AC2 | `apps/desktop/` ディレクトリが削除 | `ls apps/desktop/` → not found | ✅ |
| AC3 | Desktop API ルート登録が routes/index.js から除去 | `grep -c "desktop" apps/api/src/routes/index.js` → 0 | ✅ |
| AC4 | Desktop 関連ドキュメント（3ファイル）が削除 | 該当ファイルが存在しない | ✅ |
| AC5 | `release/` ディレクトリが削除 | `ls release/` → not found | ✅ |
| AC6 | `examples/` ディレクトリが削除 | `ls examples/` → not found | ✅ |
| AC7 | `plantuml/` ディレクトリが削除 | `ls plantuml/` → not found | ✅ |
| AC8 | CLAUDE.md の DB 記述が正確（Railway PostgreSQL が明記） | CLAUDE.md に「Railway PostgreSQL」の記述がある | ✅ |
| AC9 | Supabase SDK の用途がコード内コメントで明確（全9ファイル） | 各ファイル冒頭に用途コメントがある | ✅ |
| AC10 | 全既存 API テストが PASS | `cd apps/api && npm test` → 41/41 pass | ✅ |
| AC11 | Desktop API ハンドラファイル（3ファイル）が削除 | 該当ファイルが存在しない | ✅ |
| AC12 | Web Realtime ルート・ハンドラが削除 | `apps/api/src/routes/realtime/` ディレクトリが存在しない | ✅ |
| AC13 | `@google-cloud/text-to-speech` が package.json から削除 | `grep -c "text-to-speech" package.json` → 0 | ✅ |
| AC14 | package.json の description が正確 | description に "Anicca" が含まれている | ✅ |
| AC15 | `apps/web/` ディレクトリが削除 | `ls apps/web/` → not found | ✅ |
| AC16 | `apps/workspace-mcp/` ディレクトリが削除 | `ls apps/workspace-mcp/` → not found | ✅ |
| AC17 | `apps/api/src/routes/realtime/` と `apps/api/src/api/proxy/realtime/` が空ならディレクトリ削除 | 該当ディレクトリが存在しない | ✅ |

### Phase 2: プロジェクトルート整理

| # | 条件 | テスト可能な形式 |
|---|------|----------------|
| AC18 | `.agents/` ディレクトリが削除されている | `test ! -d .agents/` |
| AC19 | `.claude/skills/supabase-postgres-best-practices` がシンボリックリンクでなく実体ディレクトリ | `test ! -L .claude/skills/supabase-postgres-best-practices && test -d .claude/skills/supabase-postgres-best-practices` |
| AC20 | ルートのゴミファイル（空ファイル、.p12、.pen）が削除 | `npm`, `anicca-agi@0.6.2`, `Untitled.p12`, `pencil-new.pen` が存在しない |
| AC21 | `assets/` ディレクトリが存在し、ルートの画像・動画がそこに移動 | `test -d assets/screenshots && test -d assets/videos && test -d assets/app-store-badges` |
| AC22 | ルートに散乱する PNG/MOV ファイルがない | `ls *.png *.PNG *.MOV 2>/dev/null` → 空 |
| AC23 | `data/` ディレクトリが存在し、ルートの CSV/JSON がそこに移動 | `test -d data/` |
| AC24 | ルートに散乱する CSV/JSON ファイルがない | `ls *.csv *.json 2>/dev/null` → 空（package*.json, .eslintrc.json, playwright-config.json 除く） |
| AC25 | `naistQmd/` が `research/` にリネーム | `test -d research/ && test ! -d naistQmd/` |
| AC26 | ルートの散乱 MD（Notify.md, Toggle.md）が `docs/notes/` に移動 | `test ! -f Notify.md && test ! -f Toggle.md` |
| AC27 | `maestro-phase6-results.xml` が `maestro/results/` に移動 | `test -f maestro/results/maestro-phase6-results.xml` |
| AC28 | `images/` ディレクトリが `assets/screenshots/` に統合 | `test ! -d images/` |
| AC29 | `Download-on-the-App-Store/` が `assets/app-store-badges/` にリネーム | `test ! -d Download-on-the-App-Store/` |
| AC30 | `aniccaios-PrivacyReport*.pdf` が `docs/reports/` に移動 | ルートに PDF がない |
| AC31 | 全既存 API テストが PASS | `cd apps/api && npm test` → all pass |

---

## 3. As-Is / To-Be

### Phase 1（✅ 完了）

#### 3.1 Prisma Schema

**As-Is**: 25 モデル（うち 2 つ Dead）

```
model HabitLog { ... }           ← DEAD（ProblemType ベースに置換済み）
model MobileAlarmSchedule { ... } ← DEAD（ルールベース Nudge に置換済み）
```

**To-Be**: 23 モデル（Dead モデル削除） ✅

#### 3.2 Desktop 残骸

**As-Is**:

| 項目 | パス | サイズ |
|------|------|--------|
| Desktop アプリ | `apps/desktop/` | 4.7GB |
| Desktop API ルートファイル | `apps/api/src/routes/realtime/desktop.js` | — |
| Desktop セッションハンドラ | `apps/api/src/api/proxy/realtime/desktopSession.js` | — |
| Desktop 停止ハンドラ | `apps/api/src/api/proxy/realtime/desktopStop.js` | — |
| Web Realtime ルートファイル | `apps/api/src/routes/realtime/web.js` | — |
| Web Realtime ハンドラ | `apps/api/src/api/proxy/realtime/webSession.js` | — |
| ルーター登録（desktop + web） | `apps/api/src/routes/index.js` | — |
| Desktop ドキュメント | `docs/electron.md` | — |
| Desktop 認証設計 | `docs/desktop-auth-and-mcp-token-architecture.md` | — |
| Desktop 課金設計 | `docs/desktop-billing-subscription-plan.md` | — |
| Desktop バイナリ | `release/` | 805MB |
| 空ディレクトリ（削除後残存） | `apps/api/src/routes/realtime/` | — |
| 空ディレクトリ（削除後残存） | `apps/api/src/api/proxy/realtime/` | — |

**To-Be**: 全て削除 ✅

#### 3.3 Dead ディレクトリ

**As-Is**:

| ディレクトリ | サイズ | 状態 |
|-------------|--------|------|
| `examples/` | 8.3GB | DEAD — サンプルプロジェクト45個 |
| `plantuml/` | 48MB | DEAD — ツールクローン |
| `apps/web/` | 120KB | DORMANT — 2021年以降停止 |
| `apps/workspace-mcp/` | — | DEAD — 実験的ワークスペースMCP |

**To-Be**: 全て削除 ✅

#### 3.4 DB 明確化

**As-Is**: CLAUDE.md に「Supabase」への曖昧な言及あり

**To-Be**: CLAUDE.md の技術スタックセクションに以下を明記: ✅

```markdown
- **メインDB**: Railway PostgreSQL（Prisma ORM経由）
- **Supabase SDK**: 補助サービスのみ（Slackトークン保存、Worker Memory、Storage、一部OAuth）。DBとしては使用していない
```

#### 3.5 Supabase コードの明確化

**As-Is**: Supabase import ファイルの用途が不明確で「Supabase = メイン DB」と誤解させる

**To-Be**: 全9ファイルの冒頭にJSDocコメント追加 ✅

| # | ファイル | 用途コメント |
|---|---------|-------------|
| 1 | `apps/api/src/lib/slackTokens.supabase.js` | Slackトークンのkey-value保存 |
| 2 | `apps/api/src/lib/workerMemory.js` | Worker Memory Storage |
| 3 | `apps/api/src/lib/PreviewManager.js` | Worker プレビューファイル管理 |
| 4 | `apps/api/src/lib/ParentAgent.js` | Worker Memory（via workerMemory.js） |
| 5 | `apps/api/src/api/auth/entitlement.js` | Supabase Auth（エンタイトルメント確認） |
| 6 | `apps/api/src/api/auth/google/oauth.js` | Supabase Auth（Google OAuth開始） |
| 7 | `apps/api/src/api/auth/google/callback.js` | Supabase Auth（Google OAuthコールバック） |
| 8 | `apps/api/src/api/auth/google/refresh.js` | Supabase Auth（セッションリフレッシュ） |
| 9 | `apps/api/src/api/static/preview-app.js` | Supabase Storage（プレビューファイル配信） |

### Phase 2: プロジェクトルート整理

#### 3.6 `.agents/` と `.claude/skills/` の重複

**As-Is**:
```
.agents/skills/supabase-postgres-best-practices/  ← 実体
.claude/skills/supabase-postgres-best-practices   ← ../../.agents/skills/... へのシンボリックリンク
```

**To-Be**:
- `.agents/` ディレクトリを完全削除
- `.claude/skills/supabase-postgres-best-practices` のシンボリックリンクを解消し、実体コピーに置換

#### 3.7 ルートのゴミファイル

**As-Is**: ルートに以下のゴミファイルが存在

| ファイル | 状態 |
|---------|------|
| `npm` | 空ファイル（0 bytes） |
| `anicca-agi@0.6.2` | 空ファイル（0 bytes） |
| `Untitled.p12` | 不要な証明書ファイル |
| `pencil-new.pen` | 不要な Pencil ファイル |

**To-Be**: 全て削除

#### 3.8 ルートの散乱画像・動画

**As-Is**: ルートに以下のメディアファイルが散乱

| ファイル | 移動先 |
|---------|--------|
| `anicca-icon-1024x1024.png` | `assets/icon/` |
| `IMG_3433 2.PNG` | `assets/screenshots/` |
| `IMG_3544.PNG` | `assets/screenshots/` |
| `IMG_3550.PNG` | `assets/screenshots/` |
| `feedback-submitted.png` | `assets/screenshots/` |
| `image.png` | `assets/screenshots/` |
| `image copy.png` | `assets/screenshots/` |
| `image2.png` | `assets/screenshots/` |
| `llm-nudge-display.png` | `assets/screenshots/` |
| `スクリーンショット 2026-01-25 18.00.10.png` | `assets/screenshots/` |
| `1:19-en.MOV` | `assets/videos/` |
| `images/` (6ファイル) | `assets/screenshots/` へ統合後、ディレクトリ削除 |
| `Download-on-the-App-Store/` (45言語) | `assets/app-store-badges/` にリネーム |

**To-Be**: `assets/` 以下に整理

```
assets/
├── icon/
│   └── anicca-icon-1024x1024.png
├── screenshots/
│   ├── IMG_3433 2.PNG
│   ├── IMG_3544.PNG
│   ├── IMG_3550.PNG
│   ├── feedback-submitted.png
│   ├── image.png
│   ├── image copy.png
│   ├── image2.png
│   ├── llm-nudge-display.png
│   ├── スクリーンショット 2026-01-25 18.00.10.png
│   ├── en-cards.PNG           (← images/ から)
│   ├── en-notificaiton.PNG    (← images/ から)
│   ├── en-problems.PNG        (← images/ から)
│   ├── jp-notification.PNG    (← images/ から)
│   ├── jp-probelms.PNG        (← images/ から)
│   └── jp:public:screenshots:nudge-card.png (← images/ から)
├── videos/
│   └── 1:19-en.MOV
└── app-store-badges/          (← Download-on-the-App-Store/ リネーム)
    ├── AR/
    ├── US/
    └── ... (45言語)
```

#### 3.9 ルートの散乱 CSV/JSON

**As-Is**: ルートに以下のデータファイルが散乱

| ファイル | 移動先 |
|---------|--------|
| `Apple Ads Campaign 2143222383 Keywords.csv` | `data/apple-ads/` |
| `Apple Ads Campaigns.csv` | `data/apple-ads/` |
| `SDK Audit 2026-01-12__11_58_39.csv` | `data/audits/` |
| `anicca.csv` | `data/` |
| `keywords_template.csv` | `data/apple-ads/` |
| `targetedKeywords (1).csv` | `data/apple-ads/` |
| `targetedKeywords (2).csv` | `data/apple-ads/` |
| `viralfal (2).json` | `data/` |

**To-Be**: `data/` 以下に整理

```
data/
├── apple-ads/
│   ├── Apple Ads Campaign 2143222383 Keywords.csv
│   ├── Apple Ads Campaigns.csv
│   ├── keywords_template.csv
│   ├── targetedKeywords (1).csv
│   └── targetedKeywords (2).csv
├── audits/
│   └── SDK Audit 2026-01-12__11_58_39.csv
├── anicca.csv
└── viralfal (2).json
```

#### 3.10 naistQmd → research リネーム

**As-Is**: `naistQmd/` — 不明瞭な名前の研究論文ディレクトリ

**To-Be**: `research/` にリネーム（git mv で履歴保持）

#### 3.11 散乱 MD・テスト結果・PDF

**As-Is**:

| ファイル | 移動先 |
|---------|--------|
| `Notify.md` | `docs/notes/` |
| `Toggle.md` | `docs/notes/` |
| `maestro-phase6-results.xml` | `maestro/results/` |
| `aniccaios-PrivacyReport 2025-11-12 19-27-30.pdf` | `docs/reports/` |

**To-Be**: 各ディレクトリに整理

---

## 4. テストマトリックス

### Phase 1（✅ 完了）

| # | To-Be | テスト方法 | カバー |
|---|-------|-----------|--------|
| 1 | Dead Prisma モデル削除 | `grep "model HabitLog" schema.prisma` → 0件 | ✅ |
| 2 | Desktop ディレクトリ削除 | `test ! -d apps/desktop/` | ✅ |
| 3 | Desktop + Web Realtime ルート除去 | `grep "desktop\|realtime/web" routes/index.js` → 0件 | ✅ |
| 4 | Desktop ハンドラファイル削除 | `desktopSession.js`, `desktopStop.js`, `desktop.js` が存在しない | ✅ |
| 5 | Web Realtime ハンドラファイル削除 | `webSession.js`, `web.js` が存在しない | ✅ |
| 6 | Desktop ドキュメント削除 | 3ファイルが存在しない | ✅ |
| 7 | `release/` 削除 | `test ! -d release/` | ✅ |
| 8 | `examples/` 削除 | `test ! -d examples/` | ✅ |
| 9 | `plantuml/` 削除 | `test ! -d plantuml/` | ✅ |
| 10 | `apps/web/` 削除 | `test ! -d apps/web/` | ✅ |
| 10b | `apps/workspace-mcp/` 削除 | `test ! -d apps/workspace-mcp/` | ✅ |
| 10c | `apps/api/src/routes/realtime/` 空ディレクトリ削除 | `test ! -d apps/api/src/routes/realtime/` | ✅ |
| 10d | `apps/api/src/api/proxy/realtime/` 空ディレクトリ削除 | `test ! -d apps/api/src/api/proxy/realtime/` | ✅ |
| 11 | Dead パッケージ削除 | `grep "text-to-speech" package.json` → 0件 | ✅ |
| 12 | package.json description 更新 | description に "Anicca" が含まれる | ✅ |
| 13 | CLAUDE.md DB 記述正確 | テキスト確認 | ✅ |
| 14 | Supabase 全9ファイルにコメント追加 | ファイル冒頭確認 | ✅ |
| 15 | 既存 API テスト PASS | `npm test` → 41/41 pass | ✅ |

### Phase 2

| # | To-Be | テスト方法 | カバー |
|---|-------|-----------|--------|
| 16 | `.agents/` 削除 | `test ! -d .agents/` | ✅ |
| 17 | シンボリックリンク解消 | `test ! -L .claude/skills/supabase-postgres-best-practices` | ✅ |
| 18 | ゴミファイル削除 | `npm`, `anicca-agi@0.6.2`, `Untitled.p12`, `pencil-new.pen` が存在しない | ✅ |
| 19 | `assets/` 構造正確 | `test -d assets/icon && test -d assets/screenshots && test -d assets/videos && test -d assets/app-store-badges` | ✅ |
| 20 | ルートに PNG/MOV なし | `ls *.png *.PNG *.MOV 2>/dev/null` → 空 | ✅ |
| 21 | `images/` ディレクトリ削除 | `test ! -d images/` | ✅ |
| 22 | `Download-on-the-App-Store/` リネーム済み | `test ! -d Download-on-the-App-Store/` | ✅ |
| 23 | `data/` 構造正確 | `test -d data/apple-ads && test -d data/audits` | ✅ |
| 24 | ルートに CSV なし | `ls *.csv 2>/dev/null` → 空 | ✅ |
| 25 | `naistQmd/` → `research/` リネーム | `test -d research/ && test ! -d naistQmd/` | ✅ |
| 26 | ルートに散乱 MD なし | `test ! -f Notify.md && test ! -f Toggle.md` | ✅ |
| 27 | `maestro/results/` にテスト結果移動 | `test -f maestro/results/maestro-phase6-results.xml` | ✅ |
| 28 | PDF が `docs/reports/` に移動 | ルートに PDF がない | ✅ |
| 29 | 既存 API テスト PASS | `cd apps/api && npm test` → all pass | ✅ |

---

## 5. 境界

### やること

**Phase 1**（✅ 完了）:
- Dead Code / Dead ディレクトリの削除
- Desktop 残骸の完全削除
- CLAUDE.md の DB 記述修正
- Supabase SDK ファイルへのコメント追加

**Phase 2**:
- `.agents/` 削除 + シンボリックリンク解消
- ルートのゴミファイル削除
- 画像・動画・バッジを `assets/` に整理
- CSV/JSON を `data/` に整理
- `naistQmd/` → `research/` リネーム
- 散乱 MD/XML/PDF の適切なディレクトリへの移動

### やらないこと

| 項目 | 理由 |
|------|------|
| Supabase DB 移行 | 今回のスコープ外。将来のオプション |
| Supabase SDK の削除・置換 | 動いているコードを壊さない |
| API ロジックの変更 | クリーンアップのみ、機能変更なし |
| `SensorAccessState` モデル削除 | DORMANT だが将来使う可能性あり、判断保留 |
| Stripe 課金コード削除 | Desktop 課金の残骸だが、影響範囲が大きい。別 Spec で対応 |
| Desktop 用 Prisma モデル削除（RealtimeUsageDaily 等） | mobile realtime も参照している可能性あり。別 Spec で分析 |
| `docs/` 全体のクリーンアップ | 今回は Desktop 関連 3 ファイル + 散乱ファイル移動のみ |
| `.cursor/plans/` 内の CSV 整理 | ASO 作業データとして正しい場所にある |
| `.kombai/`, `.playwright-mcp/` 内の画像 | ツール固有データ。触らない |
| `docs/12/`, `docs/ScreenBreak/`, `docs/naistQmd/` | 既存ドキュメント。別 Spec で整理 |

### 触るファイル

**Phase 1**（✅ 完了）:

| ファイル | 変更内容 |
|---------|---------|
| `apps/api/prisma/schema.prisma` | HabitLog, MobileAlarmSchedule モデル削除 |
| `apps/api/src/routes/index.js` | Desktop + Web Realtime ルート登録削除 |
| `CLAUDE.md` | DB 記述修正 |
| Supabase import ファイル（9ファイル） | 冒頭コメント追加 |

**Phase 2**:

| ファイル/ディレクトリ | 変更内容 |
|---------------------|---------|
| `.agents/` | 完全削除 |
| `.claude/skills/supabase-postgres-best-practices` | シンボリックリンク → 実体コピー |
| `npm`, `anicca-agi@0.6.2`, `Untitled.p12`, `pencil-new.pen` | 削除 |
| ルートの PNG/MOV ファイル（10個 + images/6個） | `assets/` に移動 |
| `Download-on-the-App-Store/` | `assets/app-store-badges/` にリネーム |
| ルートの CSV/JSON ファイル（8個） | `data/` に移動 |
| `naistQmd/` | `research/` にリネーム |
| `Notify.md`, `Toggle.md` | `docs/notes/` に移動 |
| `maestro-phase6-results.xml` | `maestro/results/` に移動 |
| `aniccaios-PrivacyReport*.pdf` | `docs/reports/` に移動 |

### 削除するディレクトリ/ファイル

**Phase 1**（✅ 完了）:

| 対象 | サイズ |
|------|--------|
| `apps/desktop/` | 4.7GB |
| `apps/web/` | 120KB |
| `apps/workspace-mcp/` | — |
| `plantuml/` | 48MB |
| `release/` | 805MB |
| `docs/electron.md` | — |
| `docs/desktop-auth-and-mcp-token-architecture.md` | — |
| `docs/desktop-billing-subscription-plan.md` | — |

**Phase 2**:

| 対象 | 理由 |
|------|------|
| `.agents/` | `.claude/skills/` に統合 |
| `npm` | 空ファイル |
| `anicca-agi@0.6.2` | 空ファイル |
| `Untitled.p12` | 不要な証明書 |
| `pencil-new.pen` | 不要な Pencil ファイル |
| `images/` | `assets/screenshots/` に統合後に削除 |

---

## 6. 実行手順

### Phase 1（✅ 完了 — 6コミット済み）

```bash
# Commit 1: Dead Prisma モデル削除
git add apps/api/prisma/schema.prisma
git commit -m "refactor: remove dead Prisma models (HabitLog, MobileAlarmSchedule)"

# Commit 2: Desktop/Web Realtime 残骸削除
git add apps/desktop/ apps/api/src/routes/realtime/ apps/api/src/api/proxy/realtime/ apps/api/src/routes/index.js docs/electron.md docs/desktop-auth-and-mcp-token-architecture.md docs/desktop-billing-subscription-plan.md
git commit -m "refactor: remove Desktop/Web Realtime remnants (91 files, 40,641 lines)"

# Commit 3: Dead ディレクトリ削除
git add plantuml/ apps/web/ apps/workspace-mcp/
git commit -m "refactor: remove dead directories (plantuml, apps/web, apps/workspace-mcp)"

# Commit 4: Dead パッケージ削除 + description 修正
git add apps/api/package.json apps/api/package-lock.json
git commit -m "chore: remove unused @google-cloud/text-to-speech, update package description"

# Commit 5: CLAUDE.md DB 明確化
git add CLAUDE.md
git commit -m "docs: clarify DB architecture in CLAUDE.md (Railway PostgreSQL = main DB)"

# Commit 6: Supabase SDK コメント追加
git add apps/api/src/lib/slackTokens.supabase.js apps/api/src/lib/workerMemory.js apps/api/src/lib/PreviewManager.js apps/api/src/lib/ParentAgent.js apps/api/src/api/auth/entitlement.js apps/api/src/api/auth/google/oauth.js apps/api/src/api/auth/google/callback.js apps/api/src/api/auth/google/refresh.js apps/api/src/api/static/preview-app.js
git commit -m "docs: add Supabase SDK usage comments to all 9 files for AI clarity"
```

### Phase 2

```bash
# Commit 7: .agents/ 削除、シンボリックリンク解消
# 1. シンボリックリンク先の実体をコピー
cp -r .agents/skills/supabase-postgres-best-practices /tmp/sbp-backup
# 2. シンボリックリンクを削除
rm .claude/skills/supabase-postgres-best-practices
# 3. 実体をコピー
cp -r /tmp/sbp-backup .claude/skills/supabase-postgres-best-practices
# 4. .agents/ を git rm
git rm -r .agents/
git add .claude/skills/supabase-postgres-best-practices
git commit -m "refactor: remove .agents/, resolve symlink to .claude/skills/"

# Commit 8: ルートのゴミファイル削除
git rm npm "anicca-agi@0.6.2" Untitled.p12 pencil-new.pen
git commit -m "chore: remove root garbage files (empty files, unused .p12, .pen)"

# Commit 9: assets/ 作成、画像・動画・バッジ移動
mkdir -p assets/icon assets/screenshots assets/videos
git mv anicca-icon-1024x1024.png assets/icon/
git mv "IMG_3433 2.PNG" "IMG_3544.PNG" "IMG_3550.PNG" assets/screenshots/
git mv feedback-submitted.png image.png "image copy.png" image2.png llm-nudge-display.png assets/screenshots/
git mv "スクリーンショット 2026-01-25 18.00.10.png" assets/screenshots/
git mv "1:19-en.MOV" assets/videos/
git mv images/* assets/screenshots/
git rm -r images/
git mv Download-on-the-App-Store assets/app-store-badges
git add assets/
git commit -m "refactor: organize media files into assets/ directory"

# Commit 10: data/ 作成、CSV/JSON 移動
mkdir -p data/apple-ads data/audits
git mv "Apple Ads Campaign 2143222383 Keywords.csv" "Apple Ads Campaigns.csv" keywords_template.csv "targetedKeywords (1).csv" "targetedKeywords (2).csv" data/apple-ads/
git mv "SDK Audit 2026-01-12__11_58_39.csv" data/audits/
git mv anicca.csv data/
git mv "viralfal (2).json" data/
git add data/
git commit -m "refactor: organize data files into data/ directory"

# Commit 11: naistQmd/ → research/ リネーム
git mv naistQmd research
git commit -m "refactor: rename naistQmd/ to research/ for clarity"

# Commit 12: 散乱 MD・テスト結果・PDF 移動
mkdir -p docs/notes docs/reports maestro/results
git mv Notify.md Toggle.md docs/notes/
git mv maestro-phase6-results.xml maestro/results/
git mv "aniccaios-PrivacyReport 2025-11-12 19-27-30.pdf" docs/reports/
git commit -m "refactor: move loose docs, test results, and reports to proper directories"

# テスト実行
cd apps/api && npm test
```

### ⚠️ Prisma Migration 警告（Phase 1 から継続）

**`prisma migrate dev` / `prisma migrate deploy` / `prisma db push` は絶対に実行しない。**

| コマンド | OK？ | 理由 |
|---------|------|------|
| `npx prisma generate` | ✅ | クライアントコード再生成のみ。DB に触らない |
| `npx prisma migrate dev` | ❌ | Dead モデル削除を検出し `DROP TABLE` を生成する |
| `npx prisma db push` | ❌ | スキーマをDB に強制同期 → テーブル削除 |

---

## 7. レビュー指摘事項（refactor-cleaner）

### 対応済み（BLOCKING → Spec に反映）

| # | 指摘 | 対応 |
|---|------|------|
| B1 | Prisma migration リスクが未記載 | セクション 6 に警告追加、`prisma generate` のみ実行を明記 |
| B2 | Web Realtime ルートも同じく Dead だが未対応 | 削除対象に追加（`web.js`, `webSession.js`） |

### 対応済み（ADVISORY → Spec に反映）

| # | 指摘 | 対応 |
|---|------|------|
| A1 | Desktop ハンドラファイルも削除すべき | 削除対象に追加 |
| A2 | `@google-cloud/text-to-speech` が未使用 | package.json から削除を追加 |
| A5 | package.json description が古い | 修正を追加 |

### 将来対応（今回スコープ外）

| # | 指摘 | 理由 |
|---|------|------|
| A3 | `@composio/core`, `@composio/openai` 未使用 | Agent 系。影響範囲要調査 |
| A4 | `@vercel/mcp-adapter` 未使用 | 要調査 |
| A6 | `MobileVoipToken` モデルが Dead かも | raw SQL 参照あり。別 Spec で分析 |
| A9 | `docs/` 全体に stale ファイル多数 | 別 Spec でまとめてクリーンアップ |
| A10 | Stripe 課金コードが Desktop 残骸 | 影響範囲大。別 Spec |
| A11 | Desktop 用 Prisma モデル（usage 系） | mobile も参照。別 Spec で分析 |

---

## 8. GATE 1 レビュー結果

### Phase 1 Spec レビュー

| 項目 | 結果 |
|------|------|
| レビュー方法 | code-quality-reviewer サブエージェント |
| 判定 | **ok: true** |
| BLOCKING | 0件 |
| ADVISORY | 6件（全て Spec に反映済み） |

### Phase 1 実装レビュー（GATE 3）

| 項目 | 結果 |
|------|------|
| レビュー方法 | code-quality-reviewer サブエージェント |
| 判定 | **ok: true** |
| AC 達成 | **17/17 PASS** |
| テスト | **41/41 PASS** |
| BLOCKING | 0件 |
| ADVISORY | 0件 |
