# Backend クリーンアップ & DB明確化 Spec

**バージョン**: 1.5.x
**日付**: 2026-01-28
**ステータス**: Draft

---

## 1. 概要（What & Why）

### What

コードベースから Dead Code・Desktop 残骸・誤解を招く Supabase 参照を整理し、「Railway PostgreSQL がメイン DB」であることをコードを読むだけで明確に分かるようにする。

### Why

| 問題 | 影響 |
|------|------|
| AI が「Supabase 使ってる」と誤認する | 毎セッションで誤った前提の回答が生成される |
| Desktop 残骸（4.7GB）がリポジトリに残存 | git clone が重い、コードベースが混乱する |
| Dead Prisma モデルが schema にある | スキーマの正確性が損なわれる |
| `examples/`（8.3GB）、`plantuml/`（48MB）が放置 | ノイズ、ディスク浪費 |

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

| # | 条件 | テスト可能な形式 |
|---|------|----------------|
| AC1 | Dead Prisma モデル（HabitLog, MobileAlarmSchedule）が schema.prisma から削除されている | `grep -c "model HabitLog" schema.prisma` → 0 |
| AC2 | `apps/desktop/` ディレクトリが削除されている | `ls apps/desktop/` → not found |
| AC3 | Desktop API ルート登録が routes/index.js から除去されている | `grep -c "desktop" apps/api/src/routes/index.js` → 0 |
| AC4 | Desktop 関連ドキュメント（3ファイル）が削除されている | 該当ファイルが存在しない |
| AC5 | `release/` ディレクトリが削除されている | `ls release/` → not found |
| AC6 | `examples/` ディレクトリが削除されている | `ls examples/` → not found |
| AC7 | `plantuml/` ディレクトリが削除されている | `ls plantuml/` → not found |
| AC8 | CLAUDE.md の DB 記述が正確（Railway PostgreSQL が明記） | CLAUDE.md に「Railway PostgreSQL」の記述がある |
| AC9 | Supabase SDK の用途がコード内コメントで明確 | `slackTokens.supabase.js` 冒頭に用途コメントがある |
| AC10 | 全既存 API テストが PASS する | `cd apps/api && npm test` → all pass |
| AC11 | Desktop API ハンドラファイル（3ファイル）が削除されている | 該当ファイルが存在しない |
| AC12 | Web Realtime ルート登録が routes/index.js から除去されている | `grep -c "web" apps/api/src/routes/realtime/` → 0 |
| AC13 | `@google-cloud/text-to-speech` が package.json から削除されている | `grep -c "text-to-speech" package.json` → 0 |
| AC14 | package.json の description が正確 | description に "Anicca" が含まれている |

---

## 3. As-Is / To-Be

### 3.1 Prisma Schema

**As-Is**: 20 モデル（うち 2 つ Dead）

```
model HabitLog { ... }           ← DEAD（ProblemType ベースに置換済み）
model MobileAlarmSchedule { ... } ← DEAD（ルールベース Nudge に置換済み）
```

**To-Be**: 18 モデル（Dead モデル削除）

### 3.2 Desktop 残骸

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

**To-Be**: 全て削除

### 3.3 Dead ディレクトリ

**As-Is**:

| ディレクトリ | サイズ | 状態 |
|-------------|--------|------|
| `examples/` | 8.3GB | DEAD — サンプルプロジェクト45個 |
| `plantuml/` | 48MB | DEAD — ツールクローン |
| `apps/web/` | 120KB | DORMANT — 2021年以降停止 |

**To-Be**: 全て削除

### 3.4 DB 明確化

**As-Is**: CLAUDE.md に「Supabase」への曖昧な言及あり

**To-Be**: CLAUDE.md の技術スタックセクションに以下を明記:

```markdown
### データベース
- **メインDB**: Railway PostgreSQL（Prisma ORM経由）
- **Supabase SDK**: 補助サービスのみ（Slackトークン保存、Worker Memory、一部OAuth）
  - ※ DB としては使用していない
```

### 3.5 Supabase コードの明確化

**As-Is**: `slackTokens.supabase.js` 等のファイル名が「Supabase = メイン DB」と誤解させる

**To-Be**: 各 Supabase import ファイルの冒頭にコメント追加:

```javascript
/**
 * Supabase SDK — 補助ストレージとして使用（メインDBではない）
 * メインDB: Railway PostgreSQL（Prisma経由、apps/api/src/lib/db.js）
 * 用途: Slackトークンのkey-value保存
 */
```

---

## 4. テストマトリックス

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
| 11 | Dead パッケージ削除 | `grep "text-to-speech" package.json` → 0件 | ✅ |
| 12 | package.json description 更新 | description に "Anicca" が含まれる | ✅ |
| 13 | CLAUDE.md DB 記述正確 | テキスト確認 | ✅ |
| 14 | Supabase コードにコメント追加 | ファイル冒頭確認 | ✅ |
| 15 | 既存 API テスト PASS | `npm test` | ✅ |

---

## 5. 境界

### やること

- Dead Code / Dead ディレクトリの削除
- Desktop 残骸の完全削除
- CLAUDE.md の DB 記述修正
- Supabase SDK ファイルへのコメント追加

### やらないこと

| 項目 | 理由 |
|------|------|
| Supabase DB 移行 | 今回のスコープ外。将来のオプション |
| Supabase SDK の削除・置換 | 動いているコードを壊さない |
| API ロジックの変更 | クリーンアップのみ、機能変更なし |
| `SensorAccessState` モデル削除 | DORMANT だが将来使う可能性あり、判断保留 |
| Stripe 課金コード削除 | Desktop 課金の残骸だが、影響範囲が大きい。別 Spec で対応 |
| Desktop 用 Prisma モデル削除（RealtimeUsageDaily 等） | mobile realtime も参照している可能性あり。別 Spec で分析 |
| `docs/` 全体のクリーンアップ | 今回は Desktop 関連 3 ファイルのみ。他の stale docs は別途 |

### 触るファイル

| ファイル | 変更内容 |
|---------|---------|
| `apps/api/prisma/schema.prisma` | HabitLog, MobileAlarmSchedule モデル削除 |
| `apps/api/src/routes/index.js` | Desktop + Web Realtime ルート登録削除 |
| `CLAUDE.md` | DB 記述修正 |
| Supabase import ファイル（9ファイル） | 冒頭コメント追加 |

### 削除するディレクトリ/ファイル

| 対象 | サイズ |
|------|--------|
| `apps/desktop/` | 4.7GB |
| `apps/web/` | 120KB |
| `examples/` | 8.3GB |
| `plantuml/` | 48MB |
| `release/` | 805MB |
| `docs/electron.md` | — |
| `docs/desktop-auth-and-mcp-token-architecture.md` | — |
| `docs/desktop-billing-subscription-plan.md` | — |

**合計削除**: 約 13.8GB

---

## 6. 実行手順

```bash
# 0. ワークツリー作成
git worktree add ../anicca-backend-cleanup -b feature/backend-cleanup
cd ../anicca-backend-cleanup

# 1. Dead Prisma モデル削除
# schema.prisma から HabitLog, MobileAlarmSchedule を削除
# ⚠️ 重要: prisma generate のみ実行。prisma migrate は絶対に実行しない。
# 理由: migrate するとDBからテーブルがDROPされ、本番データが消える。
# schema.prisma のヘッダにも「Prisma Migrate でDBを管理しない」と明記済み。
cd apps/api && npx prisma generate  # クライアント再生成のみ（DB変更なし）

# 2. Desktop + Web Realtime 残骸削除
rm -rf apps/desktop/
rm -rf release/
rm docs/electron.md docs/desktop-auth-and-mcp-token-architecture.md docs/desktop-billing-subscription-plan.md
# routes/index.js から desktop + web realtime の import と登録を削除
# desktopSession.js, desktopStop.js, desktop.js ルートファイルを削除
# webSession.js, web.js ルートファイルを削除

# 3. Dead ディレクトリ削除
rm -rf examples/
rm -rf plantuml/
rm -rf apps/web/

# 4. Dead パッケージ削除
# package.json から @google-cloud/text-to-speech を削除（音声機能削除済み）
# package.json の description を "Anicca API Server" に修正
cd apps/api && npm install  # lockfile 更新

# 5. CLAUDE.md 修正
# DB 記述を正確に更新

# 6. Supabase コードにコメント追加
# 9ファイルの冒頭にコメント追加

# 7. ローカル git worktree 整理
git worktree prune  # stale worktree 参照を削除

# 8. テスト実行
cd apps/api && npm test

# 9. コミット（フェーズごと）
git add -A && git commit -m "refactor: remove dead Prisma models (HabitLog, MobileAlarmSchedule)"
git add -A && git commit -m "refactor: remove Desktop/Web Realtime remnants and handler files"
git add -A && git commit -m "refactor: remove dead directories (examples, plantuml, apps/web, release)"
git add -A && git commit -m "chore: remove unused @google-cloud/text-to-speech, update package description"
git add -A && git commit -m "docs: clarify DB architecture in CLAUDE.md"
git add -A && git commit -m "docs: add Supabase SDK usage comments for clarity"
```

### ⚠️ Prisma Migration 警告

**`prisma migrate dev` / `prisma migrate deploy` / `prisma db push` は絶対に実行しない。**

| コマンド | OK？ | 理由 |
|---------|------|------|
| `npx prisma generate` | ✅ | クライアントコード再生成のみ。DB に触らない |
| `npx prisma migrate dev` | ❌ | Dead モデル削除を検出し `DROP TABLE` を生成する |
| `npx prisma db push` | ❌ | スキーマをDB に強制同期 → テーブル削除 |

このプロジェクトでは Prisma Migrate で DB を管理していない（schema ヘッダに明記済み）。
`prisma generate` のみで十分。

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
