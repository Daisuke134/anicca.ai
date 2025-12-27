# Anicca v0.3 フェーズ1 擬似パッチ

## 概要
- 対象フェーズ: 1
- 対象タスク: `1.1`〜`1.4`
- バックエンド方針（固定）:
  - `apps/api` は **Node ESM の `.js` ランタイム**で完走（`apps/api/package.json` の `"type": "module"` を維持）
  - 新規ファイルは最初から `.js`
  - 相対 import は **必ず拡張子付き**（例: `./foo.js`。拡張子省略は禁止）
  - 追加依存（例: prisma）は **必ず `apps/api/package.json` の差分に含める**（「入ってる前提」禁止）
  - TypeScript本格導入（tsc/tsx/ts-node等）は v0.4 以降に切り出し（本フェーズでは行わない）

## 対象タスク（todolist.md から）
- `1.1 Prisma新規モデル定義`
- `1.2 JSONB GINインデックス用raw SQL追記`
- `1.3 環境変数MEM0追加と削除リスト反映`
- `1.4 UUID移行/バックフィル計画のマイグレーションメモ`

## 参照仕様（v3）
- `.cursor/plans/v3/todolist.md`（フェーズ1）
- `.cursor/plans/v3/tech-db-schema-v3.md`（セクション 1,2,4,5,7,8,10）
- `.cursor/plans/v3/migration-patch-v3.md`（セクション 3）
- `.cursor/plans/v3/v3-stack.md`（セクション 12.x）

## 参照した公式URL一覧（妄想禁止のための一次情報）
> フェーズ1は DB/Prisma と mem0 環境変数が中心だが、以後のフェーズで必要になる一次情報もここに先行して固定しておく（URL自体は公式）。

### Prisma
- `https://www.prisma.io/docs/orm/prisma-schema/data-model/models`（Prisma Schema / Models）
- `https://www.prisma.io/docs/orm/prisma-schema/data-model/fields#json-fields`（Json fields / PostgreSQL JSONB）
- `https://www.prisma.io/docs/orm/prisma-migrate`（Prisma Migrate 概要）

### PostgreSQL
- `https://www.postgresql.org/docs/current/datatype-json.html`（JSON/JSONB）
- `https://www.postgresql.org/docs/current/gin.html`（GIN Index）

### mem0
- `https://docs.mem0.ai/open-source/node-quickstart`（Node SDK Quickstart）

### OpenAI（Realtime / Tools）
- `https://platform.openai.com/docs/guides/realtime`（Realtime guide）
- `https://platform.openai.com/docs/guides/function-calling`（Function calling / Tools guide）

### Apple（後続フェーズで必須になるため先に固定）
- `https://developer.apple.com/documentation/deviceactivity`（DeviceActivity）
- `https://developer.apple.com/documentation/familycontrols`（FamilyControls）
- `https://developer.apple.com/documentation/healthkit`（HealthKit）
- `https://developer.apple.com/documentation/coremotion`（CoreMotion）

## ファイル別の変更概要

### 1) `apps/api/package.json`（フェーズ1での土台）
- Prisma を導入するため `dependencies` / `devDependencies` に追加
- Prisma コマンドを人間が実行しやすいよう `scripts` を追加（ただしサーバ起動フローは変更しない）

### 2) `apps/api/prisma/schema.prisma`（新規）
- v3 の DB設計（`tech-db-schema-v3.md`）をベースに、既存テーブルを尊重しつつ Prisma schema を追加
- 重要: 既存DBには `user_id TEXT` と `profiles.id UUID` が混在しているため、v0.3 では「二重書き込み/読み優先」計画を別途 `uuid-plan.md` に明記する

### 3) `apps/api/src/config/environment.js`
- `MEM0_API_KEY` を追加（v0.3 では Moss/Exa を新規導入しない前提を注記）

### 4) `apps/api/docs/migrations/uuid-plan.md`（新規）
- v0.3 の「text user_id → uuid profile_id」移行を、事故らない手順として文書化

## 完全パッチ（apply_patch 互換）

### 1.1 Prisma導入（依存追加）+ Prisma schema 追加
> v0.3 では **TypeScript導入は行わない**が、Prisma Client を JS(ESM) から利用できるように「依存 + schema」を追加する。
> ただし、このリポジトリの既存DBは **トリガー（例: tokensのupdated_at）や式インデックス（profilesのapple_user_id）を含む**ため、v0.3 では Prisma Migrate を主導にせず、テーブル作成は `apps/api/docs/migrations` のSQLで行う（安全第一）。

```text
*** Begin Patch
*** Update File: apps/api/package.json
@@
   "dependencies": {
@@
-    "uuid": "^9.0.0"
+    "uuid": "^9.0.0",
+    "@prisma/client": "7.1.0"
   }
*** End Patch
```

```text
*** Begin Patch
*** Update File: apps/api/package.json
@@
   "devDependencies": {
     "@types/node": "^24.0.4",
     "typescript": "^5.8.3",
-    "vercel": "^32.0.0"
+    "vercel": "^32.0.0",
+    "prisma": "7.1.0"
   },
*** End Patch
```

```text
*** Begin Patch
*** Update File: apps/api/package.json
@@
   "scripts": {
     "dev": "vercel dev",
     "deploy": "vercel --prod",
     "start": "node src/server.js",
-    "dev:railway": "nodemon src/server.js"
+    "dev:railway": "nodemon src/server.js",
+    "prisma:generate": "prisma generate",
+    "prisma:studio": "prisma studio"
   },
*** End Patch
```

> Prisma バージョン根拠（公式一次情報）: Prisma公式 GitHub Releases（`7.1.0` stable）  
> - `https://github.com/prisma/prisma/releases/tag/7.1.0`

```text
*** Begin Patch
*** Add File: apps/api/prisma/schema.prisma
+// Anicca v0.3 Prisma schema (Node ESM .js runtime)
+// - v0.3 は Node ESM の .js を維持し、TypeScript導入は v0.4 以降
+// - 既存DB（snake_case）に合わせて @map/@@map を付ける
+// - v0.3 では Prisma Migrate 主導で既存DBを管理しない（トリガー/式インデックスがあるため）
+
+// Prisma v7+ 注意: `prisma generate` は generator の `output` を必須とする（公式一次情報: Prisma v7.0.0 release notes）
+// - `https://github.com/prisma/prisma/releases/tag/7.0.0`
+generator client {
+  provider = "prisma-client"
+  output   = "../src/generated/prisma"
+}
+
+datasource db {
+  provider = "postgresql"
+  url      = env("DATABASE_URL")
+}
+
+// -----------------------------
+// Existing tables (current repo)
+// -----------------------------
+
+model Token {
+  userId           String @map("user_id")
+  provider         String
+  providerSub      String? @map("provider_sub")
+  email            String?
+  accessTokenEnc   Json @db.JsonB @map("access_token_enc")
+  refreshTokenEnc  Json? @db.JsonB @map("refresh_token_enc")
+  scope            String?
+  expiry           DateTime? @db.Timestamptz
+  rotationFamilyId String? @map("rotation_family_id")
+  revokedAt        DateTime? @db.Timestamptz @map("revoked_at")
+  createdAt        DateTime @default(now()) @db.Timestamptz @map("created_at")
+  updatedAt        DateTime @default(now()) @db.Timestamptz @map("updated_at")
+
+  @@id([userId, provider])
+  @@map("tokens")
+}
+
+model RefreshToken {
+  id            String   @id @db.Uuid @default(uuid())
+  userId        String   @db.Uuid @map("user_id")
+  tokenHash     String   @map("token_hash")
+  deviceId      String   @map("device_id")
+  userAgent     String?  @map("user_agent")
+  createdAt     DateTime @default(now()) @db.Timestamptz @map("created_at")
+  expiresAt     DateTime @db.Timestamptz @map("expires_at")
+  rotatedFrom   String?  @db.Uuid @map("rotated_from")
+  revokedAt     DateTime? @db.Timestamptz @map("revoked_at")
+  lastUsedAt    DateTime? @db.Timestamptz @map("last_used_at")
+  reuseDetected Boolean  @default(false) @map("reuse_detected")
+
+  @@map("refresh_tokens")
+}
+
+model MobileProfile {
+  deviceId  String @id @map("device_id")
+  userId    String @map("user_id")
+  profile   Json   @db.JsonB @default("{}")
+  language  String @default("en")
+  updatedAt DateTime? @db.Timestamptz @map("updated_at")
+  createdAt DateTime? @db.Timestamptz @map("created_at")
+
+  @@map("mobile_profiles")
+}
+
+model MobileVoipToken {
+  userId      String @map("user_id")
+  deviceToken String @map("device_token")
+  updatedAt   DateTime @default(now()) @db.Timestamptz @map("updated_at")
+
+  @@id([userId, deviceToken])
+  @@map("mobile_voip_tokens")
+}
+
+// 注意: `mobile_alarm_schedules.id` は過去マイグレーションが UUID/TEXT で揺れている。
+// v0.3 の主要機能では必須ではないため、現DBの型に合わせて必要なら @db.Uuid/@db.Text を調整する。
+model MobileAlarmSchedule {
+  id         String @id @map("id")
+  userId     String @map("user_id")
+  habitType  String @map("habit_type")
+  fireTime   DateTime @db.Timestamptz @map("fire_time")
+  timezone   String
+  repeatRule String @default("daily") @map("repeat_rule")
+  nextFireAt DateTime @db.Timestamptz @map("next_fire_at")
+  createdAt  DateTime? @db.Timestamptz @map("created_at")
+  updatedAt  DateTime? @db.Timestamptz @map("updated_at")
+
+  @@map("mobile_alarm_schedules")
+}
+
+model UserSubscription {
+  userId                          String @id @map("user_id")
+  plan                            String @default("free")
+  status                          String @default("free")
+  stripeCustomerId                String? @map("stripe_customer_id")
+  stripeSubscriptionId            String? @map("stripe_subscription_id")
+  entitlementSource               String @default("revenuecat") @map("entitlement_source")
+  revenuecatEntitlementId         String? @map("revenuecat_entitlement_id")
+  revenuecatOriginalTransactionId String? @map("revenuecat_original_transaction_id")
+  entitlementPayload              Json? @db.JsonB @map("entitlement_payload")
+  currentPeriodEnd                DateTime? @db.Timestamptz @map("current_period_end")
+  trialEnd                        DateTime? @db.Timestamptz @map("trial_end")
+  metadata                        Json @db.JsonB @default("{}")
+  updatedAt                       DateTime @default(now()) @db.Timestamptz @map("updated_at")
+
+  @@map("user_subscriptions")
+}
+
+model RealtimeUsageDaily {
+  userId    String @map("user_id")
+  usageDate DateTime @db.Date @map("usage_date")
+  count     Int @default(0)
+  updatedAt DateTime @default(now()) @db.Timestamptz @map("updated_at")
+
+  @@id([userId, usageDate])
+  @@map("realtime_usage_daily")
+}
+
+model SubscriptionEvent {
+  eventId   String @id @map("event_id")
+  userId    String? @map("user_id")
+  type      String
+  provider  String @default("revenuecat")
+  payload   Json? @db.JsonB
+  createdAt DateTime @default(now()) @db.Timestamptz @map("created_at")
+
+  @@map("subscription_events")
+}
+
+model UsageSession {
+  sessionId     String @id @map("session_id")
+  userId        String @map("user_id")
+  startedAt     DateTime @default(now()) @db.Timestamptz @map("started_at")
+  endedAt       DateTime? @db.Timestamptz @map("ended_at")
+  billedSeconds Int @default(0) @map("billed_seconds")
+  billedMinutes Int @default(0) @map("billed_minutes")
+  source        String @default("realtime")
+  updatedAt     DateTime @default(now()) @db.Timestamptz @map("updated_at")
+
+  @@map("usage_sessions")
+}
+
+model MonthlyVcGrant {
+  userId     String @map("user_id")
+  grantMonth DateTime @db.Date @map("grant_month")
+  reason     String
+  minutes    Int
+  grantedAt  DateTime @default(now()) @db.Timestamptz @map("granted_at")
+
+  @@id([userId, grantMonth, reason])
+  @@map("monthly_vc_grants")
+}
+
+model Profile {
+  id        String @id @db.Uuid
+  email     String? @unique
+  metadata  Json @db.JsonB @default("{}")
+  createdAt DateTime @default(now()) @db.Timestamptz @map("created_at")
+  updatedAt DateTime @default(now()) @db.Timestamptz @map("updated_at")
+
+  settings UserSetting?
+
+  @@map("profiles")
+}
+
+model UserSetting {
+  userId               String @id @db.Uuid @map("user_id")
+  language             String @default("ja")
+  timezone             String @default("Asia/Tokyo")
+  notificationsEnabled Boolean @default(true) @map("notifications_enabled")
+  preferences          Json @db.JsonB @default("{}")
+  createdAt            DateTime @default(now()) @db.Timestamptz @map("created_at")
+  updatedAt            DateTime @default(now()) @db.Timestamptz @map("updated_at")
+
+  profile Profile @relation(fields: [userId], references: [id], onDelete: Cascade)
+
+  @@map("user_settings")
+}
+
+// -----------------------------
+// New v0.3 tables
+// -----------------------------
+
+model UserTrait {
+  userId         String   @id @db.Uuid @map("user_id")
+  ideals         String[] @db.Text @default([])
+  struggles      String[] @db.Text @default([])
+  big5           Json     @db.JsonB @default("{}")
+  keywords       String[] @db.Text @default([])
+  summary        String   @db.Text @default("")
+  nudgeIntensity String   @default("normal") @map("nudge_intensity")
+  stickyMode     Boolean  @default(false) @map("sticky_mode")
+  createdAt      DateTime @default(now()) @db.Timestamptz @map("created_at")
+  updatedAt      DateTime @default(now()) @db.Timestamptz @map("updated_at")
+
+  @@map("user_traits")
+}
+
+model DailyMetric {
+  userId           String   @db.Uuid @map("user_id")
+  date             DateTime @db.Date
+  sleepDurationMin Int?     @map("sleep_duration_min")
+  sleepStartAt     DateTime? @db.Timestamptz @map("sleep_start_at")
+  wakeAt           DateTime? @db.Timestamptz @map("wake_at")
+  snsMinutesTotal  Int      @default(0) @map("sns_minutes_total")
+  snsMinutesNight  Int      @default(0) @map("sns_minutes_night")
+  steps            Int      @default(0)
+  sedentaryMinutes Int      @default(0) @map("sedentary_minutes")
+  activitySummary  Json     @db.JsonB @default("{}") @map("activity_summary")
+  mindSummary      Json     @db.JsonB @default("{}") @map("mind_summary")
+  insights         Json     @db.JsonB @default("{}")
+  createdAt        DateTime @default(now()) @db.Timestamptz @map("created_at")
+  updatedAt        DateTime @default(now()) @db.Timestamptz @map("updated_at")
+
+  @@id([userId, date])
+  @@map("daily_metrics")
+}
+
+model NudgeEvent {
+  id             String   @id @db.Uuid @default(uuid())
+  userId         String   @db.Uuid @map("user_id")
+  domain         String
+  subtype        String
+  decisionPoint  String   @map("decision_point")
+  state          Json     @db.JsonB
+  actionTemplate String?  @map("action_template")
+  channel        String
+  sent           Boolean  @default(true)
+  createdAt      DateTime @default(now()) @db.Timestamptz @map("created_at")
+
+  outcomes NudgeOutcome[]
+
+  @@map("nudge_events")
+}
+
+model NudgeOutcome {
+  id           String   @id @db.Uuid @default(uuid())
+  nudgeEventId String   @db.Uuid @map("nudge_event_id")
+  reward       Float?
+  shortTerm    Json     @db.JsonB @default("{}") @map("short_term")
+  emaScore     Json?    @db.JsonB @map("ema_score")
+  signals      Json     @db.JsonB @default("{}")
+  createdAt    DateTime @default(now()) @db.Timestamptz @map("created_at")
+
+  event NudgeEvent @relation(fields: [nudgeEventId], references: [id], onDelete: Cascade)
+
+  @@map("nudge_outcomes")
+}
+
+model FeelingSession {
+  id             String   @id @db.Uuid @default(uuid())
+  userId         String   @db.Uuid @map("user_id")
+  feelingId      String   @map("feeling_id")
+  topic          String?
+  actionTemplate String?  @map("action_template")
+  startedAt      DateTime @default(now()) @db.Timestamptz @map("started_at")
+  endedAt        DateTime? @db.Timestamptz @map("ended_at")
+  emaBetter      Boolean? @map("ema_better")
+  summary        String?  @db.Text
+  transcript     Json?    @db.JsonB
+  context        Json     @db.JsonB @default("{}")
+  createdAt      DateTime @default(now()) @db.Timestamptz @map("created_at")
+
+  @@map("feeling_sessions")
+}
+
+model HabitLog {
+  id         String   @id @db.Uuid @default(uuid())
+  userId     String   @db.Uuid @map("user_id")
+  habitId    String   @map("habit_id")
+  occurredOn DateTime @db.Date @map("occurred_on")
+  status     String
+  payload    Json     @db.JsonB @default("{}")
+  createdAt  DateTime @default(now()) @db.Timestamptz @map("created_at")
+
+  @@map("habit_logs")
+}
+
+model BanditModel {
+  id         String   @id @db.Uuid @default(uuid())
+  domain     String
+  version    Int      @default(1)
+  weights    Json     @db.JsonB
+  covariance Json     @db.JsonB
+  meta       Json     @db.JsonB @default("{}")
+  createdAt  DateTime @default(now()) @db.Timestamptz @map("created_at")
+  updatedAt  DateTime @default(now()) @db.Timestamptz @map("updated_at")
+
+  @@unique([domain, version])
+  @@map("bandit_models")
+}
+
*** End Patch
```

### 1.2 v0.3 新規テーブル作成 + JSONB GIN インデックス（SQL migrations）
> `apps/api/src/lib/migrate.js` は現在 `006|007|008` のみ自動適用。v0.3 の新規テーブルを確実に作るため、同じ仕組みに **010/011 を追加**する。
> 既存の `001/002/003/004/005/009` はトリガー/DOブロック等があり、現行の「単純セミコロン分割」では安全に実行できないため対象外のままにする。

```text
*** Begin Patch
*** Update File: apps/api/src/lib/migrate.js
@@
-  // 006以降のRailway用DDLを適用。既存の他SQLは対象外。
+  // 006以降のRailway用DDLを適用。既存の他SQLは対象外。
+  // v0.3: 010/011 を追加（v0.3新規テーブル + JSONB GINインデックス）
   const files = (await fs.readdir(MIGRATIONS_DIR))
-    .filter(f => /^(006|007|008)_.*\.sql$/.test(f))
+    .filter(f => /^(006|007|008|010|011)_.*\.sql$/.test(f))
     .sort();
*** End Patch
```

```text
*** Begin Patch
*** Add File: apps/api/docs/migrations/010_v0_3_tables.sql
+-- v0.3 core tables (Prisma schema: apps/api/prisma/schema.prisma)
+-- Note: This file is intentionally kept free of PL/pgSQL blocks because
+-- apps/api/src/lib/migrate.js uses simple semicolon-splitting execution.
+
+CREATE EXTENSION IF NOT EXISTS pgcrypto;
+
+-- profiles / user_settings
+-- NOTE: v0.3 の新規テーブル（user_traits 等）は profiles(id) を UUID の権威として参照するため、
+-- migrate.js の自動適用範囲（006/007/008/010/011）に profiles/user_settings の DDL も含める。
+-- 一次情報: apps/api/supabase/migrations/20251106_create_profiles.sql
+create table if not exists public.profiles (
+    id uuid primary key,
+    email text unique,
+    metadata jsonb not null default '{}'::jsonb,
+    created_at timestamptz not null default timezone('utc', now()),
+    updated_at timestamptz not null default timezone('utc', now())
+);
+
+create unique index if not exists profiles_apple_user_id_idx
+    on public.profiles ((metadata->>'apple_user_id'))
+    where metadata ? 'apple_user_id';
+
+create table if not exists public.user_settings (
+    user_id uuid primary key references public.profiles(id) on delete cascade,
+    language text not null default 'ja',
+    timezone text not null default 'Asia/Tokyo',
+    notifications_enabled boolean not null default true,
+    preferences jsonb not null default '{}'::jsonb,
+    created_at timestamptz not null default timezone('utc', now()),
+    updated_at timestamptz not null default timezone('utc', now())
+);
+
+-- refresh_tokens (mobile auth)
+-- NOTE: apps/api/src/services/auth/refreshStore.js が refresh_tokens を参照するため、
+-- 新規環境でも自動適用されるよう 010 に含める（既に存在する場合は IF NOT EXISTS で無害）。
+create table if not exists public.refresh_tokens (
+  id uuid primary key default gen_random_uuid(),
+  user_id uuid not null references public.profiles(id) on delete cascade,
+  token_hash text not null,
+  device_id text not null,
+  user_agent text,
+  created_at timestamptz not null default now(),
+  expires_at timestamptz not null,
+  rotated_from uuid,
+  revoked_at timestamptz,
+  last_used_at timestamptz,
+  reuse_detected boolean default false
+);
+
+create index if not exists idx_refresh_tokens_user on public.refresh_tokens(user_id);
+create index if not exists idx_refresh_tokens_hash on public.refresh_tokens(token_hash);
+
+-- user_traits: ideals/struggles/big5/nudge settings
+create table if not exists public.user_traits (
+  user_id uuid primary key references public.profiles(id) on delete cascade,
+  ideals text[] not null default '{}'::text[],
+  struggles text[] not null default '{}'::text[],
+  big5 jsonb not null default '{}'::jsonb,
+  keywords text[] not null default '{}'::text[],
+  summary text not null default '',
+  nudge_intensity text not null default 'normal',
+  sticky_mode boolean not null default true,
+  created_at timestamptz not null default timezone('utc', now()),
+  updated_at timestamptz not null default timezone('utc', now())
+);
+
+-- daily_metrics: day-level aggregates
+create table if not exists public.daily_metrics (
+  user_id uuid not null,
+  date date not null,
+  sleep_duration_min int,
+  sleep_start_at timestamptz,
+  wake_at timestamptz,
+  sns_minutes_total int not null default 0,
+  sns_minutes_night int not null default 0,
+  steps int not null default 0,
+  sedentary_minutes int not null default 0,
+  activity_summary jsonb not null default '{}'::jsonb,
+  mind_summary jsonb not null default '{}'::jsonb,
+  insights jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default timezone('utc', now()),
+  updated_at timestamptz not null default timezone('utc', now()),
+  primary key (user_id, date)
+);
+
+create index if not exists idx_daily_metrics_date on public.daily_metrics(date);
+
+-- nudge_events: decision points and chosen actions
+create table if not exists public.nudge_events (
+  id uuid primary key default gen_random_uuid(),
+  user_id uuid not null,
+  domain text not null,
+  subtype text not null,
+  decision_point text not null,
+  state jsonb not null,
+  action_template text,
+  channel text not null,
+  sent boolean not null default true,
+  created_at timestamptz not null default timezone('utc', now())
+);
+
+create index if not exists idx_nudge_events_user_created_at on public.nudge_events(user_id, created_at);
+create index if not exists idx_nudge_events_domain_created_at on public.nudge_events(domain, created_at);
+
+-- nudge_outcomes: rewards and signals
+create table if not exists public.nudge_outcomes (
+  id uuid primary key default gen_random_uuid(),
+  nudge_event_id uuid not null references public.nudge_events(id) on delete cascade,
+  reward double precision,
+  short_term jsonb not null default '{}'::jsonb,
+  ema_score jsonb,
+  signals jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default timezone('utc', now())
+);
+
+create index if not exists idx_nudge_outcomes_event_id on public.nudge_outcomes(nudge_event_id);
+
+-- feeling_sessions: EMI sessions with EMA yes/no
+create table if not exists public.feeling_sessions (
+  id uuid primary key default gen_random_uuid(),
+  user_id uuid not null,
+  feeling_id text not null,
+  topic text,
+  action_template text,
+  started_at timestamptz not null default timezone('utc', now()),
+  ended_at timestamptz,
+  ema_better boolean,
+  summary text,
+  transcript jsonb,
+  context jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default timezone('utc', now())
+);
+
+create index if not exists idx_feeling_sessions_user_started_at on public.feeling_sessions(user_id, started_at);
+create index if not exists idx_feeling_sessions_feeling_started_at on public.feeling_sessions(feeling_id, started_at);
+
+-- habit_logs: priority habit logs (v0.3)
+create table if not exists public.habit_logs (
+  id uuid primary key default gen_random_uuid(),
+  user_id uuid not null,
+  habit_id text not null,
+  occurred_on date not null,
+  status text not null,
+  payload jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default timezone('utc', now())
+);
+
+create index if not exists idx_habit_logs_user_occurred_on on public.habit_logs(user_id, occurred_on);
+create index if not exists idx_habit_logs_habit_occurred_on on public.habit_logs(habit_id, occurred_on);
+
+-- bandit_models: LinTS params
+create table if not exists public.bandit_models (
+  id uuid primary key default gen_random_uuid(),
+  domain text not null,
+  version int not null default 1,
+  weights jsonb not null,
+  covariance jsonb not null,
+  meta jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default timezone('utc', now()),
+  updated_at timestamptz not null default timezone('utc', now()),
+  unique(domain, version)
+);
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: apps/api/docs/migrations/011_v0_3_jsonb_gin_indexes.sql
+-- v0.3 JSONB GIN indexes (jsonb_path_ops)
+-- Keep this file DDL-only (no PL/pgSQL blocks).
+
+create index if not exists idx_nudge_events_state_gin
+  on public.nudge_events using gin (state jsonb_path_ops);
+
+create index if not exists idx_nudge_outcomes_short_term_gin
+  on public.nudge_outcomes using gin (short_term jsonb_path_ops);
+
+create index if not exists idx_daily_metrics_mind_summary_gin
+  on public.daily_metrics using gin (mind_summary jsonb_path_ops);
+
+create index if not exists idx_daily_metrics_activity_summary_gin
+  on public.daily_metrics using gin (activity_summary jsonb_path_ops);
+
+create index if not exists idx_daily_metrics_insights_gin
+  on public.daily_metrics using gin (insights jsonb_path_ops);
+
*** End Patch
```

### 1.3 環境変数: `MEM0_API_KEY` 追加

```text
*** Begin Patch
*** Update File: apps/api/src/config/environment.js
@@
 export const API_KEYS = {
   ANTHROPIC: !!process.env.ANTHROPIC_API_KEY,
   OPENAI: !!process.env.OPENAI_API_KEY,
   SLACK_CLIENT_ID: !!process.env.SLACK_CLIENT_ID,
   SLACK_CLIENT_SECRET: !!process.env.SLACK_CLIENT_SECRET,
-  SLACK_TOKEN_ENCRYPTION_KEY: !!process.env.SLACK_TOKEN_ENCRYPTION_KEY
+  SLACK_TOKEN_ENCRYPTION_KEY: !!process.env.SLACK_TOKEN_ENCRYPTION_KEY,
+  // v0.3: mem0（Moss/Exa は v0.3 の新規実装では使用しない）
+  MEM0: !!process.env.MEM0_API_KEY
 };
@@
   if (!API_KEYS.OPENAI) {
     warnings.push('OPENAI_API_KEY must be set');
   }
+
+  // v0.3: mem0 が未設定の場合、v0.3 のパーソナライズ機能は無効化されるため警告
+  if (!API_KEYS.MEM0) {
+    warnings.push('MEM0_API_KEY is not set');
+  }
 
   return warnings;
 }
*** End Patch
```

### 1.4 UUID移行/バックフィル計画（ドキュメント）

```text
*** Begin Patch
*** Add File: apps/api/docs/migrations/uuid-plan.md
+# UUID移行計画（v0.3）: text `user_id` → `profiles.id` (uuid)
+
+## 目的
+v0.3 で新設するテーブル（`user_traits`, `daily_metrics`, `nudge_*`, `feeling_sessions` など）は UUID を前提に設計する。
+一方、既存の `apps/api` では歴史的経緯により `user_id` が **TEXT** のテーブルが多い。
+このギャップを事故なく埋めるため、v0.3 は「二重書き込み＋読み優先」方式で移行する。
+
+## 現状（一次情報）
+- `public.profiles.id`: UUID（`apps/api/supabase/migrations/20251106_create_profiles.sql`）
+- `public.user_settings.user_id`: UUID（FK）
+- `tokens.user_id`: TEXT（`apps/api/docs/migrations/001_create_tokens.sql`）
+- `public.user_subscriptions.user_id`: TEXT（`apps/api/docs/migrations/006_init_billing_tables_on_railway.sql`）
+- `mobile_profiles.user_id`: TEXT だが、`apps/api/docs/migrations/004_backfill_profile_user_ids.sql` により **Apple ID → UUID文字列** へ置換される設計
+
+## v0.3 方針（段階的）
+
+### フェーズA: 新規テーブルは UUID を「正」とする
+- v0.3 新設テーブルは `user_id uuid` を基本。
+- API層では、受け取った `user-id` ヘッダが UUID 文字列であることを前提に実装する（非UUIDなら 400/401 扱い）。
+
+### フェーズB: 二重書き込み期間（v0.3〜）
+- 既存の TEXT `user_id` テーブルに対しては、**UUID文字列**を書き続ける（互換のため TEXT をすぐに変えない）。
+- 将来的に `profile_id uuid` カラムを追加する場合は「NULL許容＋緩いFK」で導入し、バックフィル後に強める。
+
+### フェーズC: 読みの優先順位
+- 新コードの読み取りは `profile_id(uuid)` を優先。
+- `profile_id` が無い場合のみ `user_id(text)` をフォールバック。
+
+### フェーズD: バックフィルと監視
+- `profile_id IS NULL` 件数を継続監視し、再実行可能なバックフィル手段を用意。
+- v0.3 のスコープでは「完全移行（text列削除）」はしない（v0.4 で実施）。
+
+## 推奨チェック（手動）
+1. DB上の型確認:
+   - `\\d public.profiles`
+   - `\\d public.user_settings`
+   - `\\d public.user_subscriptions`
+   - `\\d public.usage_sessions`
+2. `mobile_profiles.user_id` が UUID文字列に変換済みか確認:
+   - `SELECT user_id FROM mobile_profiles LIMIT 5;`
+
+## 注意
+- `mobile_alarm_schedules.id` は過去マイグレーションが UUID/TEXT で揺れているため、実DBの型を先に確認すること。
+  v0.3 ではここを無理に直さず、v0.4 で整理するのが安全。
+
*** End Patch
```

## ユーザーが実行するコマンド（フェーズ1）
> ここは「実行はユーザーが行う」前提。v0.3 では CI/起動スクリプトを大きく変えない。

1. 依存インストール（`apps/api`）
   - `npm install`
2. Prisma Client を生成（任意：v0.3のAPI実装でPrisma Clientを使う場合）
   - `npm run prisma:generate`
3. DBマイグレーション適用（自動）
   - `apps/api/src/server.js` 起動時に `runMigrationsOnce()` が `006/007/008/010/011` を適用する

## ユーザーが GUI で行う必要がある設定（フェーズ1）
1. Railway 環境変数の設定
   - 追加/確認:
     - `MEM0_API_KEY`: mem0 ダッシュボードから取得
   - 備考:
     - v0.3 の新規実装では Moss/Exa を使わない（mem0のみ）

