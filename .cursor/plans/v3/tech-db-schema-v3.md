# tech-db-schema-v3.md

Anicca v0.3 のための DB スキーマ提案。PostgreSQL + Prisma を前提に、既存テーブルを尊重しつつ、Nudge/JITAI・Behavior ログ・メンタル EMI (Feeling) を収容する。**このドキュメントは実装前の設計書であり、コード変更は行わない。**

---

## 1. 設計方針（PostgreSQL + Prisma ベストプラクティス）

- **ID は UUID**: `String @id @default(uuid()) @db.Uuid` を原則。既存テキスト ID は移行時にマッピング（後述）。
- **時刻は UTC**: `DateTime @db.Timestamptz` を統一（アプリ側でローカル TZ 変換）。
- **JSONB**: Prisma では `Json @db.JsonB` を使用。検索用に GIN インデックスを付与（SQL マイグレーションで追加）。
- **配列**: `String[] @db.Text` を使用（ideals/struggles 等）。
- **監査列**: `createdAt`, `updatedAt` を全モデルに。`updated_at` トリガは必要に応じて付与。
- **スキーマ分離**: 既存テーブルは `public`。新規も `public` に揃える（マルチスキーマ不要）。
- **互換性**: 既存の text ベース `user_id` は段階的に UUID に寄せる。移行フェーズでは FK を緩めつつ、新規は UUID で作成。

---

## 2. 既存テーブル（確認済み）

- 認証・トークン: `tokens`, `refresh_tokens`
- ユーザープロファイル系: `profiles` (uuid), `user_settings`
- モバイル個別設定: `mobile_profiles` (device_id 主キー), `mobile_voip_tokens`, `mobile_alarm_schedules`
- 課金: `user_subscriptions`, `subscription_events`, `realtime_usage_daily`, `usage_sessions`, `monthly_vc_grants`

---

## 3. v0.3 で必要な新規 / 拡張テーブル

| テーブル | 用途 |
| --- | --- |
| `user_traits` | Ideals / Struggles / Big5 / Keywords / Summary / Nudge 強度 / Sticky モード |
| `daily_metrics` | 睡眠・スクリーンタイム・歩数・座位など日次集計 |
| `nudge_events` | DP 評価結果・state・採択 action の記録 |
| `nudge_outcomes` | reward・短期アウトカム・EMA 等 |
| `feeling_sessions` | Feeling EMI セッションの開始/終了・EMA |
| `habit_logs` | 優先習慣の実施/未実施ログ |
| `bandit_models` | 各ドメインの LinTS パラメータ（重み/共分散） |

---

## 4. Prisma モデル案

> Prisma 公式: JSONB は `Json @db.JsonB` を使用（[Prisma Docs](https://www.prisma.io/docs/concepts/components/prisma-schema/relations/working-with-fields#json-fields)）。GIN インデックスは SQL マイグレーションで追加する。

```prisma
// datasource と generator は既存設定に合わせること

model Profile {
  id         String   @id @default(uuid()) @db.Uuid
  email      String?  @unique
  metadata   Json     @db.JsonB @default("{}")
  createdAt  DateTime @default(now()) @db.Timestamptz
  updatedAt  DateTime @default(now()) @db.Timestamptz
  settings   UserSetting?
  traits     UserTrait?
}

model UserSetting {
  userId      String   @id @db.Uuid
  language    String   @default("ja")
  timezone    String   @default("Asia/Tokyo")
  notificationsEnabled Boolean @default(true)
  preferences Json     @db.JsonB @default("{}")
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @default(now()) @db.Timestamptz

  profile Profile @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model UserTrait {
  userId         String   @id @db.Uuid
  ideals         String[] @db.Text
  struggles      String[] @db.Text
  big5           Json     @db.JsonB @default("{}") // {O,C,E,A,N: 0-100, summary?: string}
  keywords       String[] @db.Text @default([])
  summary        String   @db.Text @default("")    // 性格サマリ文（Profileカード用）
  nudgeIntensity String   @default("normal") // quiet/normal/active
  stickyMode     Boolean  @default(false)
  updatedAt      DateTime @default(now()) @db.Timestamptz
  createdAt      DateTime @default(now()) @db.Timestamptz

  profile Profile @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model DailyMetric {
  userId              String   @db.Uuid
  date                DateTime @db.Date
  sleepDurationMin    Int?     // 分
  sleepStartAt        DateTime? @db.Timestamptz
  wakeAt              DateTime? @db.Timestamptz
  snsMinutesTotal     Int?     @default(0)
  snsMinutesNight     Int?     @default(0)
  steps               Int?     @default(0)
  sedentaryMinutes    Int?     @default(0)
  activitySummary     Json     @db.JsonB @default("{}") // walk/run sessions, etc.
  mindSummary         Json     @db.JsonB @default("{}") // feeling counts, EMA aggregates
  insights            Json     @db.JsonB @default("{}") // Today's Insights素材
  createdAt           DateTime @default(now()) @db.Timestamptz
  updatedAt           DateTime @default(now()) @db.Timestamptz

  @@id([userId, date])
  @@index([date])
}

model NudgeEvent {
  id             String   @id @default(uuid()) @db.Uuid
  userId         String   @db.Uuid
  domain         String   // rhythm/screen/body/mental/habit
  subtype        String   // wake, night_sns, sedentary, self_loathing...
  decisionPoint  String
  state          Json     @db.JsonB
  actionTemplate String?  // template id or name
  channel        String   // notification / notification+voice / talk_feeling
  sent           Boolean  @default(true)
  createdAt      DateTime @default(now()) @db.Timestamptz

  outcomes NudgeOutcome[]

  @@index([userId, createdAt])
  @@index([domain, createdAt])
}

model NudgeOutcome {
  id           String   @id @default(uuid()) @db.Uuid
  nudgeEventId String   @db.Uuid
  reward       Float?   // 0/1 or null if未回答
  shortTerm    Json     @db.JsonB @default("{}") // app closed, steps delta, etc.
  emaScore     Json?    @db.JsonB // {better: bool, scale?:int}
  signals      Json     @db.JsonB @default("{}") // raw signals for後処理
  createdAt    DateTime @default(now()) @db.Timestamptz

  event NudgeEvent @relation(fields: [nudgeEventId], references: [id], onDelete: Cascade)

  @@index([nudgeEventId])
}

model FeelingSession {
  id             String   @id @default(uuid()) @db.Uuid
  userId         String   @db.Uuid
  feelingId      String   // self_loathing / anxiety / irritation / free_conversation
  topic          String?
  actionTemplate String?  // bandit が選択したテンプレートID
  startedAt      DateTime @default(now()) @db.Timestamptz
  endedAt        DateTime?
  emaBetter      Boolean?
  summary        String?  @db.Text
  transcript     Json?    @db.JsonB
  context        Json     @db.JsonB @default("{}") // state snapshot (MentalState)
  createdAt      DateTime @default(now()) @db.Timestamptz

  @@index([userId, startedAt])
  @@index([feelingId, startedAt])
}

model HabitLog {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @db.Uuid
  habitId    String   // meditation / running / strength ...
  occurredOn DateTime @db.Date
  status     String   // success/missed/skipped
  payload    Json     @db.JsonB @default("{}") // duration, reps, notes
  createdAt  DateTime @default(now()) @db.Timestamptz

  @@index([userId, occurredOn])
  @@index([habitId, occurredOn])
}

model BanditModel {
  id          String   @id @default(uuid()) @db.Uuid
  domain      String   // rhythm/screen/body/mental/habit
  version     Int      @default(1)
  weights     Json     @db.JsonB // matrix/vector
  covariance  Json     @db.JsonB // matrix
  meta        Json     @db.JsonB @default("{}") // priors, feature map hash
  updatedAt   DateTime @default(now()) @db.Timestamptz
  createdAt   DateTime @default(now()) @db.Timestamptz

  @@unique([domain, version])
}

// 既存テーブルの Prisma 化（参考用。現行コードに合わせて調整）

model Token {
  userId          String
  provider        String
  providerSub     String?
  email           String?
  accessTokenEnc  Json     @db.JsonB
  refreshTokenEnc Json?
  scope           String?
  expiry          DateTime? @db.Timestamptz
  rotationFamilyId String?
  revokedAt       DateTime? @db.Timestamptz
  createdAt       DateTime  @default(now()) @db.Timestamptz
  updatedAt       DateTime  @default(now()) @db.Timestamptz

  @@id([userId, provider])
  @@index([providerSub])
  @@index([email])
}

model RefreshToken {
  id            String   @id @default(uuid()) @db.Uuid
  userId        String   @db.Uuid
  tokenHash     String
  deviceId      String
  userAgent     String?
  createdAt     DateTime @default(now()) @db.Timestamptz
  expiresAt     DateTime @db.Timestamptz
  rotatedFrom   String?  @db.Uuid
  revokedAt     DateTime?
  lastUsedAt    DateTime?
  reuseDetected Boolean  @default(false)

  @@index([userId])
  @@index([tokenHash])
}

model MobileProfile {
  deviceId  String  @id
  userId    String
  profile   Json    @db.JsonB @default("{}")
  language  String  @default("en")
  updatedAt DateTime @default(now()) @db.Timestamptz
  createdAt DateTime @default(now()) @db.Timestamptz

  @@index([userId])
  @@index([updatedAt])
}

model MobileVoipToken {
  userId     String
  deviceToken String
  updatedAt  DateTime @default(now()) @db.Timestamptz

  @@id([userId, deviceToken])
  @@index([userId])
}

model MobileAlarmSchedule {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String
  habitType   String
  fireTime    DateTime @db.Timestamptz
  timezone    String
  repeatRule  String   @default("daily")
  nextFireAt  DateTime @db.Timestamptz
  createdAt   DateTime @default(now()) @db.Timestamptz

  @@index([userId])
  @@index([nextFireAt])
}

model UserSubscription {
  userId                        String   @id
  plan                          String   @default("free")
  status                        String   @default("free")
  stripeCustomerId              String?
  stripeSubscriptionId          String?
  entitlementSource             String   @default("revenuecat")
  revenuecatEntitlementId       String?
  revenuecatOriginalTransactionId String?
  entitlementPayload            Json?
  currentPeriodEnd              DateTime? @db.Timestamptz
  trialEnd                      DateTime? @db.Timestamptz
  managementUrl                 String?
  metadata                      Json     @db.JsonB @default("{}")
  updatedAt                     DateTime @default(now()) @db.Timestamptz
}

model SubscriptionEvent {
  eventId   String   @id
  userId    String?
  type      String
  provider  String   @default("revenuecat")
  payload   Json?
  createdAt DateTime @default(now()) @db.Timestamptz
}

model UsageSession {
  sessionId     String   @id
  userId        String
  startedAt     DateTime @default(now()) @db.Timestamptz
  endedAt       DateTime?
  billedSeconds Int      @default(0)
  billedMinutes Int      @default(0)
  source        String   @default("realtime")
  updatedAt     DateTime @default(now()) @db.Timestamptz

  @@index([userId, startedAt])
}

model MonthlyVcGrant {
  userId      String
  grantMonth  DateTime @db.Date
  reason      String   // free / annual
  minutes     Int
  grantedAt   DateTime @default(now()) @db.Timestamptz

  @@id([userId, grantMonth, reason])
  @@index([grantMonth])
}
```

---

## 5. インデックス/パフォーマンス指針

- **JSONB 検索**（state, outcomes, mindSummary 等）: `CREATE INDEX ... USING GIN (state jsonb_path_ops);` を各 JSONB カラムに付与（Prisma Migrate の `@@index` では jsonb_ops/ path_ops を直接指定できないため raw SQL マイグレーションで追加）。
- **日次集計アクセス**: `daily_metrics (user_id, date)` に複合インデックス済み。期間集計は `(user_id, date DESC)` で BRIN も検討可。
- **Nudge 系**: `(user_id, created_at)`, `(domain, created_at)`。報酬計算バッチ向けに `(nudge_event_id)` on `nudge_outcomes`。
- **Feeling セッション**: `(user_id, started_at)`, `(feeling_id, started_at)`。
- **習慣ログ**: `(user_id, occurred_on)`, `(habit_id, occurred_on)`。
- **subscription**: 既存の revenuecat/stripe カラムに GIN は不要。必要なら `entitlement_source` 等へ btree インデックス。

---

## 6. API ↔ テーブル対応（主要エンドポイント）

| API (想定) | テーブル | 主な読み書き |
| --- | --- | --- |
| `POST /realtime/tools/get_context_snapshot` | `daily_metrics`, `nudge_events`, `feeling_sessions`, `user_traits` | 読み |
| `POST /nudge/trigger` | `nudge_events` | 書き（state/action/ch） |
| `POST /nudge/feedback` | `nudge_outcomes` | 書き（reward/signals/ema） |
| `GET /behavior/summary/today` | `daily_metrics`, `nudge_outcomes`, `user_traits` | 読み |
| `GET /behavior/highlights` | `daily_metrics`, `nudge_outcomes` | 読み |
| `GET /behavior/future` | `daily_metrics`, `user_traits` | 読み |
| `POST /feeling/start` / `end` | `feeling_sessions`, `nudge_outcomes` (mental) | 書き |
| `POST /profile/init|update` | `profiles`, `user_settings`, `user_traits`, `mobile_profiles` | 書き |

---

## 7. 既存テーブルとの整合・移行方針

- **user_id 型の統一**: 既存テーブルで `text` のものは、`profiles.id (uuid)` とのマッピングテーブル or カラム追加で移行する。移行ステップ:
  1. `profiles` に全ユーザーを集約（apple_user_id は metadata でユニーク）。
  2. 既存 `user_id text` カラムに `profile_id uuid` を追加し、バックフィル。
  3. アプリ/API を `profile_id` 参照に切替後、`user_id` を非推奨化。
- **mobile_profiles**: デバイス紐付け用途として存続。`user_id` は将来的に uuid へ移行。
- **課金テーブル**: 既存を流用。`entitlement_payload` は JSONB。RevenueCat 連携カラムは既に追加済み。

---

## 8. マイグレーション方針（手順メモ）

1) **スキーマ追加**: Prisma Migrate でモデル作成 → 生成された SQL に JSONB GIN インデックスを追記（raw）。
2) **バックフィル**:
   - `profiles` にユーザー行を集約（必要なら Apple ID 等を metadata に）。
   - 新設テーブルの初期データは空で可。過去ログ移行は別ジョブ。
3) **互換運用**: 旧 `user_id text` と新 `profile_id uuid` が並立する期間は、アプリ側で両方埋める。
4) **クレンジング**: 運用安定後に text `user_id` カラムを段階的に非推奨/削除。

---

## 9. 留意点

- **PII/センシティブデータ**: mem0 保存前に LLM で redact。DB 側にも必要以上の生 PII を置かない。
- **タイムゾーン**: すべての時刻カラム（`startedAt` など）は UTC (`@db.Timestamptz`) で保存し、日次集計用の `daily_metrics.date` には **ユーザーのタイムゾーンで丸めたローカル日付** を格納する。ユーザーTZは `user_settings.timezone` に IANA 文字列（例: `"Asia/Tokyo"`）で保持し、iOS 初回ログイン時と OS タイムゾーン変更時に同期する。
- **データ保持**: Feeling セッションの全文は `transcript` に保存する場合でも期間を設けてローテーション可。要件が決まったら TTL ポリシーを別途定義。

---

このスキーマ案に沿って Prisma モデルを確定させ、次ステップで Migrate 用 SQL（GIN インデックス含む）と既存テーブルの型統一移行計画を具体化する。***

---

## 10. 追加詳細（移行・インデックス・保持・レダクション）

### 10.1 text user_id → UUID 移行計画
- v0.3 のスコープでは以下の①〜③までを実施し、④〜⑤による完全移行は v0.4 以降で行う。  
- ① 新カラム追加: 主要テーブルに `profile_id uuid` を追加（NULL許容、緩いFK）。  
- ② バックフィル: `profiles.metadata->>'apple_user_id'` 等で突合し `profile_id` を埋める。重複/欠損はレポート。  
- ③ 二重書き込み期間: API層で `user_id(text)` と `profile_id(uuid)` 両方に書く。読みは `profile_id` 優先、fallback `user_id`。  
- ④ 切替: 読み先を `profile_id` に固定し、新規作成は UUID のみ。  
- ⑤ クリーンアップ: 2〜4週間程度の安定期間後に text `user_id` を非推奨→削除。  
- 監視: `profile_id IS NULL` 件数をメトリクス化。バックフィルは再実行可能なバッチで。

// 二重書き込み・読み優先

- 読み: profile_id(uuid) を優先し、nullなら user_id(text) をフォールバック。

- 書き: 移行期間は両方に書く（最低2〜4週）。profile_id IS NULL 件数を監視し、安定後に user_id を非推奨→削除。

- 既存テーブルには nullable profile_id を追加し、緩いFKでバックフィル。切替後にFKを強める。

### 10.2 GIN インデックス（JSONB）追加手順
Prisma Migrate 生成後に raw SQL を追記して適用（必要に応じて `CONCURRENTLY` を手動適用）。

- Prisma Migrate 生成後に raw SQL で jsonb_path_ops GIN を追加する。

- 大規模テーブルは CREATE INDEX CONCURRENTLY を手動適用。

例:
```sql
CREATE INDEX IF NOT EXISTS idx_nudge_events_state_gin
  ON public.nudge_events USING GIN (state jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_nudge_outcomes_shortterm_gin
  ON public.nudge_outcomes USING GIN (short_term jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_mind_gin
  ON public.daily_metrics USING GIN (mind_summary jsonb_path_ops);
```
※ 大規模テーブルに後付けする場合は `CREATE INDEX CONCURRENTLY` を検討（Prisma migrate ではなく手動/別SQLで実行）。

### 10.3 データ保持ポリシー（feeling_sessions.transcript）
- `summary`（短文要約）: 無期限保持。  
- `transcript`（全文）: 90日ローテ（上限180日以内を推奨）。週次バッチで `ended_at < now() - interval '90 days'` を削除/NULL。  
- `emaBetter`・`context/state`・`reward`系: 学習・分析用に保持（TTLなし）。  
- 削除ログは統計目的に残し、メトリクスへの影響を避ける。

### 10.4 PII レダクション運用（mem0/DB 保存前）
- 実装レイヤー: **API層で redact** してから mem0/DB に保存（クライアントに依存しない）。  
- 方法: LLM/ルールでメール・電話・住所・氏名などを検出し `{{REDACTED_EMAIL}}` 等に置換。対象は `interaction` / `transcript` / `behavior_summary`。  
- 失敗時: 保存をスキップしアラート。過去データにも再適用できるバッチを用意。  
- 目的: 生PIIを長期保持しないことで漏洩リスクを最小化。

