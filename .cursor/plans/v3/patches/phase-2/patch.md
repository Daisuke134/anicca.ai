# Anicca v0.3 フェーズ2（APIエンドポイント）擬似パッチ（完全版）

## 1) 概要

### 対象
- 対象フェーズ: **2**
- 対象タスク: `.cursor/plans/v3/todolist.md` の **「## フェーズ 2」(2.1〜2.13)** 全件

### バックエンド方針（固定 / 絶対ルールの再掲）
- `apps/api` は **Node ESM `.js` のまま**（新規ファイルも最初から `.js`）
- 相対 import は **必ず拡張子付き**（例: `./foo.js`。省略禁止）
- 追加依存（mem0 SDK / zod 等）は **必ず `apps/api/package.json` の dependencies 差分に含める**
- TypeScript本格導入（tsc/tsx/ts-node等）は **v0.4 以降**（本フェーズではやらない）
- **実装ファイルは変更しない**（このタスクでは `patch.md` だけ作る）
- 妄想禁止: **公式ドキュメント（OpenAI Realtime/Tools と mem0）を先に開き、URLを固定してから書く**

### 対象タスク一覧（todolist.md から）
- **2.1** mem0クライアントラッパ追加（`mem0Client.js`）
- **2.2** traits/big5/nudge保存対応（`profileService.js`）
- **2.3** realtime context_snapshot拡張（`routes/mobile/realtime.js`）
- **2.4** BehaviorサマリAPI新設（`routes/mobile/behavior.js`）
- **2.5** Feeling EMI API（`routes/mobile/feeling.js`）
- **2.6** Nudge trigger/feedback API（`routes/mobile/nudge.js`）
- **2.7** metrics state builder（`modules/metrics/stateBuilder.js`）
- **2.8** 未来シナリオ生成モジュール（`modules/simulation/futureScenario.js`）
- **2.9** LinTS/ポリシー実装（`modules/nudge/policy/*.js`）
- **2.10** Nudge state/rewardビルダー（`modules/nudge/{features,reward}/*.js`）
- **2.11** Realtime tool結果整形（`openaiRealtimeService.js`）
- **2.12** entitlement返却拡張（`subscriptionStore.js`）
- **2.13** ルーター登録整理（`routes/mobile/index.js`）

### 参照仕様MD（必読）
- `.cursor/plans/v3/todolist.md`（フェーズ2: 2.1〜2.13）
- `.cursor/plans/v3/migration-patch-v3.md`（**2.x / 6.x / 7.x / 8**）
- `.cursor/plans/v3/tech-db-schema-v3.md`（**6** ほか、API↔テーブル対応）
- `.cursor/plans/v3/v3-stack.md`（**2.1, 3.2.1, 5.x, 6.x, 10〜14**）
- `.cursor/plans/v3/prompts-v3.md`（tool schema / プロンプト整合）
- `.cursor/plans/v3/tech-state-builder-v3.md`（stateBuilder仕様決定版）
- `.cursor/plans/v3/tech-bandit-v3.md`（LinTS / featureOrderHash / 保存形式）
- `.cursor/plans/v3/tech-nudge-scheduling-v3.md`（頻度/優先度/クールダウン）
- `.cursor/plans/v3/tech-ema-v3.md`（Feeling EMA と bandit 連携）
- `.cursor/plans/v3/v3-data.md`（state/action/reward の具体）

### 参照した既存コード（差分判断の一次情報）
- `apps/api/src/routes/mobile/realtime.js`
- `apps/api/src/services/openaiRealtimeService.js`
- `apps/api/src/services/subscriptionStore.js`
- `apps/api/src/services/mobile/profileService.js`
- `apps/api/src/routes/mobile/profile.js`（zod使用パターン）
- `apps/api/src/middleware/extractUserId.js`（user-id/device-id運用）
- `apps/api/src/routes/mobile/index.js`
- `apps/api/package.json` / `apps/api/package-lock.json`

### 参照した公式URL一覧（妄想禁止の一次情報）
#### OpenAI（Realtime / Tools）
- `https://platform.openai.com/docs/guides/realtime`（Realtime guide）
- `https://platform.openai.com/docs/api-reference/realtime-sessions`（**Client secrets**: `POST /v1/realtime/client_secrets`）
- `https://platform.openai.com/docs/api-reference/realtime-client-events/session/update`（Realtime の `session.update` と **tools schema 形式**）
- `https://platform.openai.com/docs/guides/function-calling`（Tool/Function calling guide）

#### mem0（Node SDK）
- `https://docs.mem0.ai/open-source/node-quickstart`（Node SDK Quickstart / `mem0ai/oss`）
- `https://docs.mem0.ai/platform/advanced-memory-operations`（Platform client / `MEM0_API_KEY` / metadata filters）

### 重要な既知リスク（必ず自分で決めて明記）

#### リスク1: `zod` が import されているが `package.json` に未宣言
- **観測（一次情報）**:
  - `apps/api/src/routes/mobile/profile.js` が `import { z } from 'zod';`
  - `apps/api/package-lock.json` に `node_modules/zod` が存在し **version=`3.25.67`**（ただし `package.json` には `zod` が無い）
- **決定**:
  - `apps/api/package.json` の `dependencies` に **`"zod": "^3.25.67"`** を追加（lock の実体に合わせる）

#### リスク2: Realtime API の endpoint / header / session 仕様のズレ
- **観測（一次情報）**:
  - 既存 `apps/api/src/services/openaiRealtimeService.js` は `https://api.openai.com/v1/realtime/sessions` + `OpenAI-Beta: realtime=v1` を使用
  - 公式は GA で **`POST https://api.openai.com/v1/realtime/client_secrets`**（Client secrets）を明記
- **決定**:
  - `openaiRealtimeService.js` は **`/v1/realtime/client_secrets` に移行**し、返却を iOS 既存想定の `client_secret: { value, expires_at }` に正規化する
  - `OpenAI-Beta` header は **GA では不要**なので外す（必要なら v0.4 で再検討）

#### リスク3: tools schema の形式が MD と公式で矛盾する可能性
- **観測（一次情報）**:
  - 公式 `session.update` の tools は `{ type, name, description, parameters }` 形式
  - `.cursor/plans/v3/prompts-v3.md` の tools 例は `{ type:"function", function:{...} }` 形式（旧表現の可能性）
- **決定**:
  - **公式（`session.update`）を正**として backend 側は “tools の形” に依存しない（tool 実行は iOS→HTTP なので）
  - iOS の tools schema 形式修正は **別フェーズ（5.5）**で行う（このフェーズ2パッチは API 側のみ）

#### リスク4: `dayOfWeek` の定義が MD 間で揺れている
- **観測**:
  - `tech-state-builder-v3.md`: `dayOfWeek = now.tz(tz).day()`（0=Sun 相当）
  - `v3-data.md`: 0=Mon〜6=Sun と書かれている
- **決定**:
  - **0=Sun〜6=Sat**（JS `Date` / Intl の自然な定義）で実装し、バンディットの `featureOrderHash` もこの定義に固定する  
  - `v3-data.md` の記述は **誤記として扱い**、以後の実装は `tech-state-builder-v3.md` 優先

### 依存バージョンの一次情報（差分に使う値）
- `mem0ai`: **2.1.38**（一次情報: npm の `mem0ai` パッケージページ）
  - `https://www.npmjs.com/package/mem0ai`
- `zod`: **3.25.67**（一次情報: `apps/api/package-lock.json` の `node_modules/zod.version`）

---

## 2) ファイル別変更概要（俯瞰）

### `apps/api/package.json`
- `dependencies` に `mem0ai` と `zod` を追加（上記一次情報に固定）

### `apps/api/src/services/openaiRealtimeService.js`
- OpenAI Realtime の client secret 発行を **GA endpoint** に合わせる
- レスポンスを backend 既存形式（`client_secret: { value, expires_at }`）へ整形

### `apps/api/src/routes/mobile/realtime.js`
- `GET /session` と `POST /session/stop` のレスポンスに **`context_snapshot`** を追加
- `POST /tools/get_context_snapshot` を追加（Realtime tool→HTTP 変換のため）

### `apps/api/src/routes/mobile/behavior.js`（新規）
- `GET /behavior/summary` を追加（6.1仕様: todayInsight/highlights/futureScenario/timeline）

### `apps/api/src/routes/mobile/feeling.js`（新規）
- `POST /feeling/start` / `POST /feeling/end` を追加（6.2/6.3、EMA連携）

### `apps/api/src/routes/mobile/nudge.js`（新規）
- `POST /nudge/trigger` / `POST /nudge/feedback` を追加（6.4/6.5）

### `apps/api/src/routes/mobile/index.js`
- `behavior.js` / `feeling.js` / `nudge.js` を登録

### `apps/api/src/services/mobile/profileService.js` / `apps/api/src/routes/mobile/profile.js`
- traits/big5/nudgeIntensity/stickyMode を `user_traits` と同期（互換: old keys を吸収）

### `apps/api/src/modules/*`（新規）
- `modules/memory/mem0Client.js`（2.1）
- `modules/realtime/contextSnapshot.js`（2.3/2.11 支援）
- `modules/metrics/stateBuilder.js`（2.7）
- `modules/simulation/futureScenario.js`（2.8）
- `modules/nudge/features/stateBuilder.js`（2.10）
- `modules/nudge/reward/rewardCalculator.js`（2.10）
- `modules/nudge/policy/linTS.js` / `wakeBandit.js` / `mentalBandit.js`（2.9）
- `utils/timezone.js`（TZ/ローカル日付ユーティリティ）

### `apps/api/src/services/subscriptionStore.js`
- **差分なし**（既に `monthly_usage_limit/remaining/count` を `normalizePlanForResponse()` で返却しているため、2.12 は現状コードで満たされている）

---

## 3) 完全パッチ（apply_patch 互換V4A形式）

> 注意: これは **擬似パッチ**（このフェーズ2の実装差分を 1ファイルに集約したもの）。実際の適用は `apply_patch` で各ブロックを順に当てる。

### 3.1 `apps/api/package.json`（依存追加: mem0ai / zod）

```text
*** Begin Patch
*** Update File: apps/api/package.json
@@
   "dependencies": {
@@
-    "uuid": "^9.0.0"
+    "uuid": "^9.0.0",
+    "zod": "^3.25.67",
+    "mem0ai": "2.1.38"
   }
*** End Patch
```

> `zod` のバージョン根拠: `apps/api/package-lock.json` の `node_modules/zod.version = 3.25.67`  
> `mem0ai` のバージョン根拠: npm の `mem0ai@2.1.38` 表示（一次情報）  
> - `https://www.npmjs.com/package/mem0ai`

---

### 3.2 `apps/api/src/utils/timezone.js`（新規）

```text
*** Begin Patch
*** Add File: apps/api/src/utils/timezone.js
+// Timezone utilities (Node ESM)
+// - Avoid new deps: rely on Intl.DateTimeFormat
+// - dayOfWeek: 0=Sun..6=Sat (JS-consistent)
+
+const WEEKDAY_TO_INDEX = {
+  Sun: 0,
+  Mon: 1,
+  Tue: 2,
+  Wed: 3,
+  Thu: 4,
+  Fri: 5,
+  Sat: 6
+};
+
+function formatParts(date, timeZone) {
+  // en-CA yields YYYY-MM-DD
+  const dateFmt = new Intl.DateTimeFormat('en-CA', {
+    timeZone,
+    year: 'numeric',
+    month: '2-digit',
+    day: '2-digit'
+  });
+  const timeFmt = new Intl.DateTimeFormat('en-GB', {
+    timeZone,
+    hour12: false,
+    hour: '2-digit',
+    minute: '2-digit'
+  });
+  const weekdayFmt = new Intl.DateTimeFormat('en-US', {
+    timeZone,
+    weekday: 'short'
+  });
+
+  const localDate = dateFmt.format(date); // YYYY-MM-DD
+  const hm = timeFmt.format(date); // HH:MM
+  const weekdayShort = weekdayFmt.format(date); // Sun/Mon...
+
+  return { localDate, hm, weekdayShort };
+}
+
+export function toLocalDateString(date, timeZone) {
+  return formatParts(date, timeZone).localDate;
+}
+
+export function toLocalTimeHHMM(date, timeZone) {
+  return formatParts(date, timeZone).hm;
+}
+
+export function getLocalHour(date, timeZone) {
+  const hm = formatParts(date, timeZone).hm;
+  const [h] = hm.split(':');
+  return Number.parseInt(h, 10);
+}
+
+export function getLocalDayOfWeek(date, timeZone) {
+  const { weekdayShort } = formatParts(date, timeZone);
+  return WEEKDAY_TO_INDEX[weekdayShort] ?? 0;
+}
+
*** End Patch
```

---

### 3.3 `apps/api/src/modules/memory/mem0Client.js`（新規, 2.1）

```text
*** Begin Patch
*** Add File: apps/api/src/modules/memory/mem0Client.js
+import baseLogger from '../../utils/logger.js';
+import { Memory as PlatformMemory } from 'mem0ai';
+import { Memory as OSSMemory } from 'mem0ai/oss';
+
+// mem0 SDK:
+// - OSS:   import { Memory } from "mem0ai/oss";
+// - Cloud: import { Memory } from "mem0ai";
+// Ref:
+// - https://docs.mem0.ai/open-source/node-quickstart
+// - https://docs.mem0.ai/platform/advanced-memory-operations
+
+const logger = baseLogger.withContext('Mem0Client');
+
+let singleton = null;
+
+function getMode() {
+  return process.env.MEM0_API_KEY ? 'platform' : 'oss';
+}
+
+export function getMem0Client() {
+  if (singleton) return singleton;
+  singleton = createMem0Client();
+  return singleton;
+}
+
+export function createMem0Client() {
+  const mode = getMode();
+  if (mode === 'platform') {
+    // Platform (hosted)
+    const memory = new PlatformMemory({ apiKey: process.env.MEM0_API_KEY, async: true });
+    logger.info('Initialized mem0 platform client');
+    return wrap(memory);
+  }
+  // OSS fallback (local-friendly)
+  const memory = new OSSMemory();
+  logger.warn('MEM0_API_KEY is not set; using mem0 OSS mode (local storage)');
+  return wrap(memory);
+}
+
+function wrap(memory) {
+  return {
+    async addProfile({ userId, content, metadata = {} }) {
+      return addText(memory, userId, content, { category: 'profile', ...metadata });
+    },
+    async addBehaviorSummary({ userId, content, metadata = {} }) {
+      return addText(memory, userId, content, { category: 'behavior_summary', ...metadata });
+    },
+    async addInteraction({ userId, content, metadata = {} }) {
+      return addText(memory, userId, content, { category: 'interaction', ...metadata });
+    },
+    async addNudgeMeta({ userId, content, metadata = {} }) {
+      return addText(memory, userId, content, { category: 'nudge_meta', ...metadata });
+    },
+
+    async search({ userId, query, filters, topK = 3, rerank = true, includeVectors = false }) {
+      // mem0 platform supports rerank + filters; OSS supports a subset.
+      return memory.search(query, {
+        userId,
+        topK,
+        rerank,
+        includeVectors,
+        ...(filters ? { filters } : {})
+      });
+    },
+
+    async getAll({ userId }) {
+      return memory.getAll({ userId });
+    },
+    async update(memoryId, patch) {
+      return memory.update(memoryId, patch);
+    },
+    async delete(memoryId) {
+      return memory.delete(memoryId);
+    },
+    async deleteAll({ userId, runId }) {
+      return memory.deleteAll({ userId, ...(runId ? { runId } : {}) });
+    }
+  };
+}
+
+async function addText(memory, userId, content, metadata) {
+  // mem0 "add" expects a conversation array; keep it minimal.
+  const conversation = [
+    { role: 'user', content: String(content || '') }
+  ];
+  return memory.add(conversation, { userId, metadata });
+}
+
*** End Patch
```

---

### 3.4 `apps/api/src/services/mobile/userIdResolver.js`（新規: text user_id → uuid profile_id 解決）

```text
*** Begin Patch
*** Add File: apps/api/src/services/mobile/userIdResolver.js
+import { query } from '../../lib/db.js';
+import baseLogger from '../../utils/logger.js';
+
+const logger = baseLogger.withContext('UserIdResolver');
+
+const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
+
+export function isUuid(value) {
+  return UUID_RE.test(String(value || ''));
+}
+
+/**
+ * Resolve incoming userId (uuid or apple_user_id) into profiles.id (uuid string).
+ * Returns null if not resolvable.
+ */
+export async function resolveProfileId(userId) {
+  const raw = String(userId || '').trim();
+  if (!raw) return null;
+  if (isUuid(raw)) return raw;
+
+  // Fallback: match profiles.metadata.apple_user_id
+  try {
+    const r = await query(
+      `select id
+         from profiles
+        where metadata->>'apple_user_id' = $1
+        limit 1`,
+      [raw]
+    );
+    return r.rows?.[0]?.id ? String(r.rows[0].id) : null;
+  } catch (e) {
+    logger.warn('Failed to resolve profileId from profiles.metadata', e);
+    return null;
+  }
+}
+
*** End Patch
```

---

### 3.5 `apps/api/src/modules/realtime/contextSnapshot.js`（新規, 2.3/2.11 支援）

```text
*** Begin Patch
*** Add File: apps/api/src/modules/realtime/contextSnapshot.js
+import { query } from '../../lib/db.js';
+import baseLogger from '../../utils/logger.js';
+import { resolveProfileId } from '../../services/mobile/userIdResolver.js';
+import { getMem0Client } from '../memory/mem0Client.js';
+import { toLocalDateString } from '../../utils/timezone.js';
+
+const logger = baseLogger.withContext('ContextSnapshot');
+
+async function getUserSettings(profileId) {
+  const r = await query(
+    `select language, timezone
+       from user_settings
+      where user_id = $1::uuid
+      limit 1`,
+    [profileId]
+  );
+  const row = r.rows?.[0] || {};
+  return {
+    language: row.language || 'en',
+    timezone: row.timezone || 'UTC'
+  };
+}
+
+async function getTraits(profileId) {
+  const r = await query(
+    `select ideals, struggles, big5, keywords, summary, nudge_intensity, sticky_mode
+       from user_traits
+      where user_id = $1::uuid
+      limit 1`,
+    [profileId]
+  );
+  const row = r.rows?.[0];
+  if (!row) {
+    return {
+      ideals: [],
+      struggles: [],
+      big5: {},
+      keywords: [],
+      summary: '',
+      nudgeIntensity: 'normal',
+      stickyMode: false
+    };
+  }
+  return {
+    ideals: row.ideals || [],
+    struggles: row.struggles || [],
+    big5: row.big5 || {},
+    keywords: row.keywords || [],
+    summary: row.summary || '',
+    nudgeIntensity: row.nudge_intensity || 'normal',
+    stickyMode: row.sticky_mode ?? false
+  };
+}
+
+async function getTodayMetrics(profileId, localDate) {
+  const r = await query(
+    `select user_id, date,
+            sleep_duration_min, sleep_start_at, wake_at,
+            sns_minutes_total, sns_minutes_night,
+            steps, sedentary_minutes,
+            activity_summary, mind_summary, insights
+       from daily_metrics
+      where user_id = $1::uuid and date = $2::date
+      limit 1`,
+    [profileId, localDate]
+  );
+  return r.rows?.[0] || null;
+}
+
+async function getLatestFeeling(profileId) {
+  const r = await query(
+    `select id, feeling_id, started_at, ended_at, ema_better, action_template
+       from feeling_sessions
+      where user_id = $1::uuid
+      order by started_at desc
+      limit 1`,
+    [profileId]
+  );
+  const row = r.rows?.[0];
+  if (!row) return null;
+  return {
+    id: row.id,
+    feelingId: row.feeling_id,
+    startedAt: row.started_at,
+    endedAt: row.ended_at,
+    emaBetter: row.ema_better,
+    actionTemplate: row.action_template
+  };
+}
+
+async function getMem0Buckets(profileId) {
+  // Best-effort. Do not fail snapshot if mem0 is unavailable.
+  try {
+    const mem0 = getMem0Client();
+    const [profile, interaction, behaviorSummary, nudgeMeta] = await Promise.all([
+      mem0.search({ userId: profileId, query: 'profile', filters: { category: 'profile' }, topK: 3 }).catch(() => null),
+      mem0.search({ userId: profileId, query: 'recent', filters: { category: 'interaction' }, topK: 3 }).catch(() => null),
+      mem0.search({ userId: profileId, query: 'today', filters: { category: 'behavior_summary' }, topK: 3 }).catch(() => null),
+      mem0.search({ userId: profileId, query: 'nudge', filters: { category: 'nudge_meta' }, topK: 3 }).catch(() => null)
+    ]);
+    return {
+      profile: profile?.results || profile?.results?.results || profile?.results || [],
+      interaction: interaction?.results || interaction?.results?.results || [],
+      behavior_summary: behaviorSummary?.results || behaviorSummary?.results?.results || [],
+      nudge_meta: nudgeMeta?.results || nudgeMeta?.results?.results || []
+    };
+  } catch (e) {
+    logger.warn('mem0 snapshot failed', e);
+    return { profile: [], interaction: [], behavior_summary: [], nudge_meta: [] };
+  }
+}
+
+/**
+ * Build a context snapshot for Realtime tools and for /realtime/session response.
+ * Input userId can be uuid or apple_user_id; snapshot uses profileId (uuid) as stable key.
+ */
+export async function buildContextSnapshot({ userId, deviceId, now = new Date() }) {
+  const profileId = await resolveProfileId(userId);
+  if (!profileId) {
+    return {
+      profile_id: null,
+      device_id: deviceId || null,
+      error: { code: 'UNRESOLVED_PROFILE_ID', message: 'Could not resolve profile_id' }
+    };
+  }
+
+  const settings = await getUserSettings(profileId);
+  const localDate = toLocalDateString(now, settings.timezone);
+
+  const [traits, today, feeling, mem0] = await Promise.all([
+    getTraits(profileId),
+    getTodayMetrics(profileId, localDate),
+    getLatestFeeling(profileId),
+    getMem0Buckets(profileId)
+  ]);
+
+  return {
+    profile_id: profileId,
+    device_id: deviceId || null,
+    timezone: settings.timezone,
+    language: settings.language,
+    local_date: localDate,
+    traits,
+    today_stats: today
+      ? {
+          sleepDurationMin: today.sleep_duration_min ?? null,
+          wakeAt: today.wake_at ?? null,
+          snsMinutesTotal: today.sns_minutes_total ?? 0,
+          steps: today.steps ?? 0,
+          sedentaryMinutes: today.sedentary_minutes ?? 0,
+          mindSummary: today.mind_summary ?? {},
+          activitySummary: today.activity_summary ?? {},
+          insights: today.insights ?? {}
+        }
+      : null,
+    recent_feeling: feeling,
+    mem0
+  };
+}
+
*** End Patch
```

---

### 3.6 `apps/api/src/services/openaiRealtimeService.js`（Update, 2.11）

```text
*** Begin Patch
*** Update File: apps/api/src/services/openaiRealtimeService.js
@@
 import baseLogger from '../utils/logger.js';
 import { fetch } from 'undici';
 
 const logger = baseLogger.withContext('OpenAIRealtimeService');
-const OPENAI_REALTIME_URL = 'https://api.openai.com/v1/realtime/sessions';
-const REALTIME_MODEL = 'gpt-realtime';
-const DEFAULT_VOICE = 'alloy';
+// GA: Create ephemeral client secrets for Realtime
+// Ref: https://platform.openai.com/docs/api-reference/realtime-sessions
+const OPENAI_REALTIME_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';
+const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
+const DEFAULT_VOICE = process.env.OPENAI_REALTIME_VOICE || 'alloy';
 
 export async function issueRealtimeClientSecret({ deviceId, userId }) {
   const apiKey = process.env.OPENAI_API_KEY;
   if (!apiKey) {
     throw new Error('OPENAI_API_KEY not configured');
   }
 
-const response = await fetch(OPENAI_REALTIME_URL, {
+  const response = await fetch(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
     method: 'POST',
     headers: {
       Authorization: `Bearer ${apiKey}`,
-      'Content-Type': 'application/json',
-      'OpenAI-Beta': 'realtime=v1'
+      'Content-Type': 'application/json'
     },
     body: JSON.stringify({
-      model: REALTIME_MODEL,
-      modalities: ['text', 'audio'],
-      voice: process.env.OPENAI_REALTIME_VOICE ?? DEFAULT_VOICE
+      expires_after: { anchor: 'created_at', seconds: 600 },
+      session: {
+        type: 'realtime',
+        model: REALTIME_MODEL,
+        // tools/instructions are set client-side via session.update (iOS) to match prompts-v3.md.
+        audio: { output: { voice: DEFAULT_VOICE } },
+        output_modalities: ['audio', 'text']
+      }
     })
   });
 
   if (!response.ok) {
     const detail = await response.text();
     logger.error('Realtime session creation failed', detail);
     throw new Error(`Realtime API error: ${response.status} ${detail}`);
   }
 
-  return response.json();
+  const data = await response.json();
+  // Normalize to existing mobile payload shape
+  return {
+    client_secret: {
+      value: data.value,
+      expires_at: data.expires_at
+    },
+    // Keep full session for debugging (non-breaking additive)
+    session: data.session
+  };
 }
*** End Patch
```

---

### 3.7 `apps/api/src/services/mobile/profileService.js`（Update, 2.2）

```text
*** Begin Patch
*** Update File: apps/api/src/services/mobile/profileService.js
@@
 import { query } from '../../lib/db.js';
 import baseLogger from '../../utils/logger.js';
+import { resolveProfileId, isUuid } from './userIdResolver.js';
 
 const logger = baseLogger.withContext('MobileProfileService');
@@
 export async function upsertProfile({ deviceId, userId, profile, language }) {
   try {
@@
     logger.info(`Profile upserted for device: ${deviceId}, language: ${language}`);
+
+    // v0.3: traits/big5/nudge settings are authoritative in user_traits (uuid key).
+    // We accept both legacy keys (idealTraits/problems/stickyModeEnabled) and new keys (ideals/struggles/big5/nudgeIntensity/stickyMode).
+    const profileId = await resolveProfileId(userId);
+    if (profileId) {
+      await upsertUserTraitsFromProfilePayload(profileId, profile);
+    } else {
+      // Non-uuid user_id can happen during migration; don't hard-fail profile upsert.
+      logger.warn('Could not resolve profileId; user_traits sync skipped', { userId });
+    }
   } catch (error) {
     logger.error('Failed to upsert profile', error);
     throw error;
   }
 }
+
+async function upsertUserTraitsFromProfilePayload(profileId, payload) {
+  // Normalize old → new
+  const ideals = Array.isArray(payload?.ideals) ? payload.ideals : Array.isArray(payload?.idealTraits) ? payload.idealTraits : [];
+  const struggles = Array.isArray(payload?.struggles) ? payload.struggles : Array.isArray(payload?.problems) ? payload.problems : [];
+
+  const nudgeIntensityRaw = String(payload?.nudgeIntensity || '').trim();
+  const nudgeIntensity = ['quiet', 'normal', 'active'].includes(nudgeIntensityRaw) ? nudgeIntensityRaw : null;
+
+  const stickyMode =
+    typeof payload?.stickyMode === 'boolean'
+      ? payload.stickyMode
+      : typeof payload?.stickyModeEnabled === 'boolean'
+        ? payload.stickyModeEnabled
+        : typeof payload?.wakeStickyModeEnabled === 'boolean'
+          ? payload.wakeStickyModeEnabled
+          : null;
+
+  const big5 = payload?.big5 && typeof payload.big5 === 'object' ? payload.big5 : null;
+  const keywords = Array.isArray(payload?.keywords) ? payload.keywords : [];
+  const summary = typeof payload?.summary === 'string' ? payload.summary : null;
+
+  // Only write if something is present (avoid overwriting with empties during partial updates)
+  const hasAny =
+    (ideals && ideals.length > 0) ||
+    (struggles && struggles.length > 0) ||
+    big5 ||
+    (keywords && keywords.length > 0) ||
+    (summary != null) ||
+    (nudgeIntensity != null) ||
+    (stickyMode != null);
+
+  if (!hasAny) return;
+
+  await query(
+    `insert into user_traits
+       (user_id, ideals, struggles, big5, keywords, summary, nudge_intensity, sticky_mode, created_at, updated_at)
+     values
+       ($1::uuid,
+        coalesce($2::text[], '{}'::text[]),
+        coalesce($3::text[], '{}'::text[]),
+        coalesce($4::jsonb, '{}'::jsonb),
+        coalesce($5::text[], '{}'::text[]),
+        coalesce($6::text, ''),
+        coalesce($7::text, 'normal'),
+        coalesce($8::boolean, false),
+        timezone('utc', now()),
+        timezone('utc', now()))
+     on conflict (user_id)
+     do update set
+       ideals = case when array_length(excluded.ideals,1) is null then user_traits.ideals else excluded.ideals end,
+       struggles = case when array_length(excluded.struggles,1) is null then user_traits.struggles else excluded.struggles end,
+       big5 = case when excluded.big5 = '{}'::jsonb then user_traits.big5 else excluded.big5 end,
+       keywords = case when array_length(excluded.keywords,1) is null then user_traits.keywords else excluded.keywords end,
+       summary = case when excluded.summary = '' then user_traits.summary else excluded.summary end,
+       nudge_intensity = coalesce(excluded.nudge_intensity, user_traits.nudge_intensity),
+       sticky_mode = coalesce(excluded.sticky_mode, user_traits.sticky_mode),
+       updated_at = timezone('utc', now())`,
+    [
+      profileId,
+      ideals.length ? ideals : null,
+      struggles.length ? struggles : null,
+      big5 ? JSON.stringify(big5) : null,
+      keywords.length ? keywords : null,
+      summary ?? null,
+      nudgeIntensity,
+      stickyMode
+    ]
+  );
+}
*** End Patch
```

---

### 3.8 `apps/api/src/routes/mobile/profile.js`（Update, zodスキーマ拡張 + traits返却）

```text
*** Begin Patch
*** Update File: apps/api/src/routes/mobile/profile.js
@@
 const profileSchema = z.object({
@@
   idealTraits: z.array(z.string()).optional(),
   problems: z.array(z.string()).optional(),
+  // v0.3: new traits keys（旧キーは互換として残す）
+  ideals: z.array(z.string()).optional(),
+  struggles: z.array(z.string()).optional(),
+  big5: z.object({
+    O: z.number().optional(),
+    C: z.number().optional(),
+    E: z.number().optional(),
+    A: z.number().optional(),
+    N: z.number().optional(),
+    summary: z.string().optional(),
+    keyTraits: z.array(z.string()).optional()
+  }).optional(),
+  keywords: z.array(z.string()).optional(),
+  summary: z.string().optional(),
+  nudgeIntensity: z.enum(['quiet', 'normal', 'active']).optional(),
+  stickyMode: z.boolean().optional(),
@@
   // Stickyモード（全習慣共通）
   stickyModeEnabled: z.boolean().optional(),
   // 後方互換用
   wakeStickyModeEnabled: z.boolean().optional(),
@@
 });
@@
     const profile = profileData.profile || {};
@@
     return res.json({
       displayName: profile.displayName || '',
       preferredLanguage,
       sleepLocation: profile.sleepLocation || '',
       trainingFocus: profile.trainingFocus || [],
       wakeLocation: profile.wakeLocation || '',
       wakeRoutines: profile.wakeRoutines || [],
       sleepRoutines: profile.sleepRoutines || [],
       trainingGoal: profile.trainingGoal || '',
       idealTraits: profile.idealTraits || [],
       problems: profile.problems || [],
+      // v0.3: new fields (best-effort; profileService upserts to user_traits)
+      ideals: profile.ideals || profile.idealTraits || [],
+      struggles: profile.struggles || profile.problems || [],
+      big5: profile.big5 || null,
+      keywords: profile.keywords || [],
+      summary: profile.summary || '',
+      nudgeIntensity: profile.nudgeIntensity || 'normal',
+      stickyMode: profile.stickyMode ?? profile.stickyModeEnabled ?? profile.wakeStickyModeEnabled ?? true,
       useAlarmKitForWake: profile.useAlarmKitForWake ?? true,
       useAlarmKitForTraining: profile.useAlarmKitForTraining ?? true,
       useAlarmKitForBedtime: profile.useAlarmKitForBedtime ?? true,
       useAlarmKitForCustom: profile.useAlarmKitForCustom ?? true,
       // 後方互換: stickyModeEnabled を優先、なければ wakeStickyModeEnabled を使用
       stickyModeEnabled: profile.stickyModeEnabled ?? profile.wakeStickyModeEnabled ?? true,
       habitSchedules: profile.habitSchedules || {},
       habitFollowupCounts: profile.habitFollowupCounts || {},
       customHabits: profile.customHabits || [],
       customHabitSchedules: profile.customHabitSchedules || {},
       customHabitFollowupCounts: profile.customHabitFollowupCounts || {}
     });
*** End Patch
```

---

### 3.9 `apps/api/src/modules/metrics/stateBuilder.js`（新規, 2.7）

```text
*** Begin Patch
*** Add File: apps/api/src/modules/metrics/stateBuilder.js
+import { toLocalTimeHHMM } from '../../utils/timezone.js';
+
+/**
+ * Build Behavior tab payload pieces from daily_metrics row.
+ * This is a thin, deterministic mapper; richer insights may be generated upstream and stored into daily_metrics.insights.
+ */
+export function buildHighlights({ todayStats, timezone }) {
+  const wakeAt = todayStats?.wakeAt ? new Date(todayStats.wakeAt) : null;
+  const snsMinutesTotal = Number(todayStats?.snsMinutesTotal ?? 0);
+  const steps = Number(todayStats?.steps ?? 0);
+  const ruminationProxy = Number(todayStats?.mindSummary?.ruminationProxy ?? 0);
+
+  const wakeLabel = wakeAt ? `Wake ${toLocalTimeHHMM(wakeAt, timezone)}` : 'Wake';
+  const wakeStatus = wakeAt ? 'on_track' : 'warning';
+
+  // Minimal heuristics (v0.3): thresholds are placeholders until insights pipeline fills daily_metrics.insights.highlights
+  const screenStatus = snsMinutesTotal >= 180 ? 'warning' : snsMinutesTotal >= 120 ? 'warning' : 'on_track';
+  const screenLabel = snsMinutesTotal > 0 ? `SNS ${snsMinutesTotal}m` : 'SNS';
+
+  const workoutStatus = steps >= 8000 ? 'on_track' : steps >= 3000 ? 'warning' : 'missed';
+  const workoutLabel = steps > 0 ? `Steps ${steps}` : 'Workout';
+
+  const ruminationStatus = ruminationProxy >= 0.7 ? 'warning' : ruminationProxy >= 0.4 ? 'ok' : 'ok';
+  const ruminationLabel = ruminationProxy > 0 ? 'Rumination' : 'Rumination';
+
+  return {
+    wake: { status: wakeStatus, label: wakeLabel },
+    screen: { status: screenStatus, label: screenLabel },
+    workout: { status: workoutStatus, label: workoutLabel },
+    rumination: { status: ruminationStatus, label: ruminationLabel }
+  };
+}
+
+export function buildTimeline({ todayStats, timezone }) {
+  const timeline = [];
+
+  const sleepStartAt = todayStats?.sleepStartAt ? new Date(todayStats.sleepStartAt) : null;
+  const wakeAt = todayStats?.wakeAt ? new Date(todayStats.wakeAt) : null;
+  if (sleepStartAt && wakeAt) {
+    timeline.push({
+      type: 'sleep',
+      start: toLocalTimeHHMM(sleepStartAt, timezone),
+      end: toLocalTimeHHMM(wakeAt, timezone)
+    });
+  }
+
+  const snsSessions = todayStats?.activitySummary?.snsSessions;
+  if (Array.isArray(snsSessions)) {
+    for (const s of snsSessions) {
+      if (!s?.startAt || !s?.endAt) continue;
+      const startAt = new Date(s.startAt);
+      const endAt = new Date(s.endAt);
+      timeline.push({
+        type: 'scroll',
+        start: toLocalTimeHHMM(startAt, timezone),
+        end: toLocalTimeHHMM(endAt, timezone)
+      });
+    }
+  }
+
+  const walkRun = todayStats?.activitySummary?.walkRunSessions;
+  if (Array.isArray(walkRun)) {
+    for (const a of walkRun) {
+      if (!a?.startAt || !a?.endAt) continue;
+      const startAt = new Date(a.startAt);
+      const endAt = new Date(a.endAt);
+      timeline.push({
+        type: 'activity',
+        start: toLocalTimeHHMM(startAt, timezone),
+        end: toLocalTimeHHMM(endAt, timezone)
+      });
+    }
+  }
+
+  return timeline;
+}
+
+export function pickTodayInsight({ todayStats, language = 'en' }) {
+  const insight = todayStats?.insights?.todayInsight;
+  if (typeof insight === 'string' && insight.trim()) return insight.trim();
+  return language === 'ja'
+    ? 'まだ十分な行動データがありません。今日の流れを一緒に整えていきましょう。'
+    : 'Not enough behavior data yet. We can shape today gently from here.';
+}
+
*** End Patch
```

---

### 3.10 `apps/api/src/modules/simulation/futureScenario.js`（新規, 2.8）

> 注: v0.3 の API 実装として「LLM 連携の入口」を用意する。  
> ただし OpenAI Responses API の詳細は本フェーズ必読ではないため、**モデル名は env で差し替え可能**にして、失敗時は deterministic fallback を返す。

```text
*** Begin Patch
*** Add File: apps/api/src/modules/simulation/futureScenario.js
+import { fetch } from 'undici';
+
+function fallback(language) {
+  if (language === 'ja') {
+    return {
+      ifContinue: '今のパターンが続くと、疲れが溜まりやすく、気持ちが重くなる日が増えるかもしれません。',
+      ifImprove: '小さな改善を積み重ねると、睡眠と集中が少しずつ安定して、気持ちに余白が戻ってきます。'
+    };
+  }
+  return {
+    ifContinue: 'If current patterns continue, fatigue may accumulate and heavy days may become more frequent.',
+    ifImprove: 'With small, steady improvements, sleep and focus can stabilize and your days can feel lighter.'
+  };
+}
+
+export async function generateFutureScenario({
+  language = 'en',
+  traits = {},
+  todayStats = {},
+  now = new Date()
+}) {
+  const apiKey = process.env.OPENAI_API_KEY;
+  if (!apiKey) return fallback(language);
+
+  const model = process.env.OPENAI_SIMULATION_MODEL || 'gpt-4.1';
+
+  const input = [
+    {
+      role: 'system',
+      content:
+        language === 'ja'
+          ? 'あなたは生活とウェルビーイングの将来シナリオを短く書く。医療予測や診断はしない。'
+          : 'You write short, realistic lifestyle/wellbeing future scenarios. No medical predictions or diagnosis.'
+    },
+    {
+      role: 'user',
+      content: JSON.stringify(
+        {
+          task: 'Write two scenarios about lifestyle and wellbeing only.',
+          rules: [
+            '1) If current patterns continue (realistic, not catastrophizing).',
+            '2) If small improvements are made (hopeful and achievable).',
+            '3-4 sentences each.'
+          ],
+          traits,
+          todayStats,
+          now: now.toISOString()
+        },
+        null,
+        2
+      )
+    }
+  ];
+
+  try {
+    // Minimal call (Responses API assumed). If this fails, we fallback.
+    const resp = await fetch('https://api.openai.com/v1/responses', {
+      method: 'POST',
+      headers: {
+        Authorization: `Bearer ${apiKey}`,
+        'Content-Type': 'application/json'
+      },
+      body: JSON.stringify({
+        model,
+        input,
+        // Ask for JSON in text; parse best-effort below.
+        text: { format: { type: 'json_object' } }
+      })
+    });
+
+    if (!resp.ok) throw new Error(await resp.text());
+    const data = await resp.json();
+    const text = data.output_text || '';
+    const parsed = JSON.parse(text);
+    if (parsed?.ifContinue && parsed?.ifImprove) {
+      return { ifContinue: String(parsed.ifContinue), ifImprove: String(parsed.ifImprove) };
+    }
+    return fallback(language);
+  } catch {
+    return fallback(language);
+  }
+}
+
*** End Patch
```

---

### 3.11 `apps/api/src/modules/nudge/features/stateBuilder.js`（新規, 2.10）

```text
*** Begin Patch
*** Add File: apps/api/src/modules/nudge/features/stateBuilder.js
+import { query } from '../../../lib/db.js';
+import { getLocalHour, getLocalDayOfWeek, toLocalDateString } from '../../../utils/timezone.js';
+
+// Struggles fixed order (tech-bandit-v3.md)
+export const STRUGGLE_ORDER = [
+  'late_sleep',
+  'sns_addiction',
+  'self_loathing',
+  'anxiety',
+  'anger',
+  'jealousy',
+  'sedentary',
+  'procrastination',
+  'perfectionism',
+  'burnout'
+];
+
+export function normalizeBig5(big5) {
+  const src = big5 && typeof big5 === 'object' ? big5 : {};
+  const to01 = (v) => {
+    if (v == null) return 0;
+    const n = Number(v);
+    if (!Number.isFinite(n)) return 0;
+    // Accept 0-1 or 0-100
+    return n > 1 ? Math.max(0, Math.min(1, n / 100)) : Math.max(0, Math.min(1, n));
+  };
+  return {
+    O: to01(src.O),
+    C: to01(src.C),
+    E: to01(src.E),
+    A: to01(src.A),
+    N: to01(src.N)
+  };
+}
+
+export async function getUserTimezone(profileId) {
+  const r = await query(
+    `select timezone
+       from user_settings
+      where user_id = $1::uuid
+      limit 1`,
+    [profileId]
+  );
+  return r.rows?.[0]?.timezone || 'UTC';
+}
+
+export async function getUserTraits(profileId) {
+  const r = await query(
+    `select ideals, struggles, big5, nudge_intensity, sticky_mode
+       from user_traits
+      where user_id = $1::uuid
+      limit 1`,
+    [profileId]
+  );
+  const row = r.rows?.[0] || {};
+  return {
+    ideals: row.ideals || [],
+    struggles: row.struggles || [],
+    big5: row.big5 || {},
+    nudgeIntensity: row.nudge_intensity || 'normal',
+    stickyMode: row.sticky_mode ?? false
+  };
+}
+
+export async function getDailyMetrics(profileId, localDate) {
+  const r = await query(
+    `select *
+       from daily_metrics
+      where user_id = $1::uuid and date = $2::date
+      limit 1`,
+    [profileId, localDate]
+  );
+  return r.rows?.[0] || null;
+}
+
+export async function getDailyMetrics7d(profileId, localDate) {
+  const r = await query(
+    `select *
+       from daily_metrics
+      where user_id = $1::uuid
+        and date between ($2::date - interval '6 days') and $2::date
+      order by date desc`,
+    [profileId, localDate]
+  );
+  return r.rows || [];
+}
+
+function avgHour(rows, key) {
+  const hs = [];
+  for (const row of rows) {
+    const v = row?.[key];
+    if (!v) continue;
+    const d = new Date(v);
+    hs.push(d.getUTCHours() + d.getUTCMinutes() / 60);
+  }
+  if (!hs.length) return null;
+  return hs.reduce((a, b) => a + b, 0) / hs.length;
+}
+
+function sleepDebtHours(metrics7d) {
+  const durations = metrics7d
+    .map(m => Number(m?.sleep_duration_min ?? NaN))
+    .filter(n => Number.isFinite(n) && n > 0);
+  const lastNight = durations[0] ? durations[0] / 60 : null;
+  const avg7d = durations.length ? (durations.reduce((a, b) => a + b, 0) / durations.length) / 60 : null;
+  if (lastNight == null || avg7d == null) return 0;
+  const debt = avg7d - lastNight;
+  return Math.max(-5, Math.min(5, debt));
+}
+
+async function successRate7d(profileId, subtype, nowUtcIso) {
+  const r = await query(
+    `select
+       (count(*) filter (where no.reward = 1))::float / nullif(count(*),0) as rate
+     from nudge_events ne
+     left join nudge_outcomes no on no.nudge_event_id = ne.id
+     where ne.user_id = $1::uuid
+       and ne.subtype = $2
+       and ne.created_at >= ($3::timestamptz - interval '7 days')`,
+    [profileId, subtype, nowUtcIso]
+  );
+  const v = r.rows?.[0]?.rate;
+  return Number.isFinite(Number(v)) ? Number(v) : 0;
+}
+
+export function calculateRuminationProxy(data) {
+  const lateNight = Math.min(Number(data?.lateNightSnsMinutes ?? 0) / 60, 1.0) * 0.4;
+  const total = Number(data?.totalScreenTime ?? 0);
+  const sns = Number(data?.snsMinutes ?? 0);
+  const ratio = total > 0 ? sns / total : 0;
+  const snsScore = Math.max(0, Math.min(1, ratio)) * 0.3;
+  const sleepWindow = Math.min(Number(data?.sleepWindowPhoneMinutes ?? 0) / 30, 1.0) * 0.3;
+  const longest = Number(data?.longestNoUseHours ?? 0);
+  const restBonus = longest >= 7 && longest <= 9 ? -0.2 : 0;
+  return Math.max(0, Math.min(1, lateNight + snsScore + sleepWindow + restBonus));
+}
+
+export async function buildWakeState({ profileId, now = new Date(), tz }) {
+  const timezone = tz || 'UTC';
+  const localDate = toLocalDateString(now, timezone);
+  const [metrics7d, traits, today] = await Promise.all([
+    getDailyMetrics7d(profileId, localDate),
+    getUserTraits(profileId),
+    getDailyMetrics(profileId, localDate)
+  ]);
+
+  const avgWake7d = avgHour(metrics7d, 'wake_at');
+  const avgBedtime7d = avgHour(metrics7d, 'sleep_start_at');
+  const debt = sleepDebtHours(metrics7d);
+
+  const wakeSuccessRate7d = await successRate7d(profileId, 'wake', now.toISOString());
+  const bedtimeSuccessRate7d = await successRate7d(profileId, 'bedtime', now.toISOString());
+
+  const activity = today?.activity_summary || {};
+  const snsMinutesLast60min = Number(activity?.snsMinutesLast60min ?? 0);
+  const snsLongUseAtNight = Number(today?.sns_minutes_night ?? 0) >= 30;
+
+  const mind = today?.mind_summary || {};
+  const feelingCounts = mind?.feelingCounts || {};
+
+  return {
+    localHour: getLocalHour(now, timezone),
+    dayOfWeek: getLocalDayOfWeek(now, timezone),
+    avgWake7d,
+    avgBedtime7d,
+    sleepDebtHours: debt,
+    snsMinutesToday: Number(today?.sns_minutes_total ?? 0),
+    stepsToday: Number(today?.steps ?? 0),
+    sedentaryMinutesToday: Number(today?.sedentary_minutes ?? 0),
+    wakeSuccessRate7d,
+    bedtimeSuccessRate7d,
+    snsMinutesLast60min,
+    snsLongUseAtNight,
+    big5: normalizeBig5(traits.big5),
+    struggles: traits.struggles || [],
+    nudgeIntensity: traits.nudgeIntensity || 'normal',
+    recentFeelingCounts: feelingCounts
+  };
+}
+
+export async function buildScreenState({ profileId, now = new Date(), tz }) {
+  const timezone = tz || 'UTC';
+  const localDate = toLocalDateString(now, timezone);
+  const [metrics7d, traits, today] = await Promise.all([
+    getDailyMetrics7d(profileId, localDate),
+    getUserTraits(profileId),
+    getDailyMetrics(profileId, localDate)
+  ]);
+  const debt = sleepDebtHours(metrics7d);
+  const mind = today?.mind_summary || {};
+  const feelingCounts = mind?.feelingCounts || {};
+  const activity = today?.activity_summary || {};
+  const snsSessions = Array.isArray(activity?.snsSessions) ? activity.snsSessions : [];
+  const last = snsSessions.length ? snsSessions[snsSessions.length - 1] : null;
+  const snsCurrentSessionMinutes = Number(last?.totalMinutes ?? 0);
+  return {
+    localHour: getLocalHour(now, timezone),
+    dayOfWeek: getLocalDayOfWeek(now, timezone),
+    snsCurrentSessionMinutes,
+    snsMinutesToday: Number(today?.sns_minutes_total ?? 0),
+    sleepDebtHours: debt,
+    big5: normalizeBig5(traits.big5),
+    struggles: traits.struggles || [],
+    nudgeIntensity: traits.nudgeIntensity || 'normal',
+    recentFeelingCounts: feelingCounts
+  };
+}
+
+export async function buildMovementState({ profileId, now = new Date(), tz }) {
+  const timezone = tz || 'UTC';
+  const localDate = toLocalDateString(now, timezone);
+  const [metrics7d, traits, today] = await Promise.all([
+    getDailyMetrics7d(profileId, localDate),
+    getUserTraits(profileId),
+    getDailyMetrics(profileId, localDate)
+  ]);
+  const debt = sleepDebtHours(metrics7d);
+  const activity = today?.activity_summary || {};
+  return {
+    localHour: getLocalHour(now, timezone),
+    dayOfWeek: getLocalDayOfWeek(now, timezone),
+    sedentaryMinutesCurrent: Number(activity?.sedentaryStreak?.currentMinutes ?? 0),
+    sedentaryMinutesToday: Number(today?.sedentary_minutes ?? 0),
+    stepsToday: Number(today?.steps ?? 0),
+    recentActivityEvents: activity?.walkRunSessions || [],
+    sleepDebtHours: debt,
+    big5: normalizeBig5(traits.big5),
+    struggles: traits.struggles || [],
+    nudgeIntensity: traits.nudgeIntensity || 'normal'
+  };
+}
+
+export async function buildMentalState({ profileId, feelingId, now = new Date(), tz }) {
+  const timezone = tz || 'UTC';
+  const localDate = toLocalDateString(now, timezone);
+  const [metrics7d, traits, today] = await Promise.all([
+    getDailyMetrics7d(profileId, localDate),
+    getUserTraits(profileId),
+    getDailyMetrics(profileId, localDate)
+  ]);
+  const debt = sleepDebtHours(metrics7d);
+  const mind = today?.mind_summary || {};
+  const feelingCounts = mind?.feelingCounts || {};
+
+  const count7dR = await query(
+    `select count(*)::int as c
+       from feeling_sessions
+      where user_id = $1::uuid
+        and feeling_id = $2
+        and started_at >= ($3::timestamptz - interval '7 days')`,
+    [profileId, String(feelingId), now.toISOString()]
+  );
+  const recentFeelingCount7d = Number(count7dR.rows?.[0]?.c ?? 0);
+
+  const activity = today?.activity_summary || {};
+  const ruminationProxy = calculateRuminationProxy({
+    lateNightSnsMinutes: activity?.lateNightSnsMinutes ?? 0,
+    snsMinutes: today?.sns_minutes_total ?? 0,
+    totalScreenTime: activity?.totalScreenTime ?? 0,
+    sleepWindowPhoneMinutes: activity?.sleepWindowPhoneMinutes ?? 0,
+    longestNoUseHours: activity?.longestNoUseHours ?? 0
+  });
+
+  return {
+    localHour: getLocalHour(now, timezone),
+    dayOfWeek: getLocalDayOfWeek(now, timezone),
+    feelingId: String(feelingId),
+    recentFeelingCount: Number(feelingCounts?.[String(feelingId)] ?? 0),
+    recentFeelingCount7d,
+    sleepDebtHours: debt,
+    snsMinutesToday: Number(today?.sns_minutes_total ?? 0),
+    ruminationProxy,
+    big5: normalizeBig5(traits.big5),
+    struggles: traits.struggles || [],
+    nudgeIntensity: traits.nudgeIntensity || 'normal'
+  };
+}
+
*** End Patch
```

---

### 3.12 `apps/api/src/modules/nudge/reward/rewardCalculator.js`（新規, 2.10）

```text
*** Begin Patch
*** Add File: apps/api/src/modules/nudge/reward/rewardCalculator.js
+// Reward calculator (v0.3)
+// Ref: .cursor/plans/v3/v3-data.md
+
+export function computeReward({ domain, subtype, signals }) {
+  const s = signals && typeof signals === 'object' ? signals : {};
+
+  // For v0.3: wake/bedtime rewards are computed from HealthKit/DeviceActivity and stored later;
+  // trigger/feedback endpoint uses passive signals (screen/movement).
+  if (domain === 'screen' || domain === 'morning_phone') {
+    // Success: close within 5 min AND no reopen for 10-30 min (simplified here using client-provided signals)
+    const appClosed = s.appClosed === true;
+    const noReopenMinutes = Number(s.noReopenMinutes ?? 0);
+    return appClosed && noReopenMinutes >= 10 ? 1 : 0;
+  }
+
+  if (domain === 'movement') {
+    const stepsDelta = Number(s.stepsDelta ?? 0);
+    const hasWalk = s.walkingEvent === true || s.runningEvent === true;
+    return (stepsDelta >= 300) || hasWalk ? 1 : 0;
+  }
+
+  if (domain === 'habit') {
+    // v0.3: delayed reward; log only
+    return null;
+  }
+
+  // default unknown
+  return null;
+}
+
*** End Patch
```

---

### 3.13 `apps/api/src/modules/nudge/policy/linTS.js`（新規, 2.9）

> LinTS は tech-bandit-v3.md の保存形式（weights/covariance/meta）に合わせ、**1モデルで action block を持つ**構造にする。  
> これにより DB の `bandit_models` 形式を変えずに action ごとに学習できる（`x_action` をブロックに埋め込む）。

```text
*** Begin Patch
*** Add File: apps/api/src/modules/nudge/policy/linTS.js
+import crypto from 'crypto';
+import { query } from '../../../lib/db.js';
+import baseLogger from '../../../utils/logger.js';
+
+const logger = baseLogger.withContext('LinTS');
+
+function zeros(n) {
+  return Array.from({ length: n }, () => 0);
+}
+
+function identity(n, scale = 1) {
+  const m = [];
+  for (let i = 0; i < n; i++) {
+    const row = zeros(n);
+    row[i] = scale;
+    m.push(row);
+  }
+  return m;
+}
+
+function dot(a, b) {
+  let s = 0;
+  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
+  return s;
+}
+
+function matVec(M, v) {
+  const out = zeros(M.length);
+  for (let i = 0; i < M.length; i++) {
+    out[i] = dot(M[i], v);
+  }
+  return out;
+}
+
+function outer(u, v) {
+  const n = u.length;
+  const m = v.length;
+  const out = [];
+  for (let i = 0; i < n; i++) {
+    const row = zeros(m);
+    for (let j = 0; j < m; j++) row[j] = u[i] * v[j];
+    out.push(row);
+  }
+  return out;
+}
+
+function matSub(A, B) {
+  const out = [];
+  for (let i = 0; i < A.length; i++) {
+    const row = zeros(A[i].length);
+    for (let j = 0; j < A[i].length; j++) row[j] = A[i][j] - B[i][j];
+    out.push(row);
+  }
+  return out;
+}
+
+function matScale(A, k) {
+  const out = [];
+  for (let i = 0; i < A.length; i++) {
+    const row = zeros(A[i].length);
+    for (let j = 0; j < A[i].length; j++) row[j] = A[i][j] * k;
+    out.push(row);
+  }
+  return out;
+}
+
+function cholesky(A) {
+  // Lower-triangular L such that A = L L^T
+  const n = A.length;
+  const L = Array.from({ length: n }, () => zeros(n));
+  for (let i = 0; i < n; i++) {
+    for (let j = 0; j <= i; j++) {
+      let sum = 0;
+      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
+      if (i === j) {
+        const v = A[i][i] - sum;
+        L[i][j] = v > 0 ? Math.sqrt(v) : 0;
+      } else {
+        const denom = L[j][j] || 1e-12;
+        L[i][j] = (A[i][j] - sum) / denom;
+      }
+    }
+  }
+  return L;
+}
+
+function mulLowerVec(L, z) {
+  const n = L.length;
+  const out = zeros(n);
+  for (let i = 0; i < n; i++) {
+    let s = 0;
+    for (let j = 0; j <= i; j++) s += L[i][j] * z[j];
+    out[i] = s;
+  }
+  return out;
+}
+
+function randn() {
+  // Box-Muller
+  let u = 0, v = 0;
+  while (u === 0) u = Math.random();
+  while (v === 0) v = Math.random();
+  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
+}
+
+function sampleMVN(mu, cov) {
+  const n = mu.length;
+  const z = zeros(n).map(() => randn());
+  const L = cholesky(cov);
+  const w = mulLowerVec(L, z);
+  const out = zeros(n);
+  for (let i = 0; i < n; i++) out[i] = mu[i] + w[i];
+  return out;
+}
+
+export function buildActionFeatureVector(x, actionId, actionCount) {
+  const d = x.length;
+  const D = d * actionCount;
+  const out = zeros(D);
+  const offset = actionId * d;
+  for (let i = 0; i < d; i++) out[offset + i] = x[i];
+  return out;
+}
+
+export function generateFeatureOrderHash(fields) {
+  return crypto.createHash('sha256').update(fields.join(',')).digest('hex').slice(0, 16);
+}
+
+export class LinTSModel {
+  constructor({ domain, featureDim, actionCount, lambda = 1.0, v = 0.5, featureOrderHash }) {
+    this.domain = domain;
+    this.featureDim = featureDim;
+    this.actionCount = actionCount;
+    this.lambda = lambda;
+    this.v = v;
+    this.featureOrderHash = featureOrderHash;
+
+    this.D = featureDim * actionCount;
+    this.mu = zeros(this.D);
+    this.b = zeros(this.D); // f vector in tech-bandit-v3.md
+    this.Binv = identity(this.D, 1 / lambda);
+  }
+
+  static async loadOrInit({ domain, version = 1, featureDim, actionCount, lambda, v, featureOrderHash }) {
+    const r = await query(
+      `select weights, covariance, meta
+         from bandit_models
+        where domain = $1 and version = $2
+        limit 1`,
+      [domain, version]
+    );
+    const row = r.rows?.[0];
+    if (!row) {
+      const model = new LinTSModel({ domain, featureDim, actionCount, lambda, v, featureOrderHash });
+      await model.save({ version });
+      return model;
+    }
+
+    const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
+    if (meta.featureOrderHash && meta.featureOrderHash !== featureOrderHash) {
+      throw new Error(`featureOrderHash mismatch for ${domain}: db=${meta.featureOrderHash} code=${featureOrderHash}`);
+    }
+
+    const model = new LinTSModel({ domain, featureDim, actionCount, lambda, v, featureOrderHash });
+    model.mu = Array.isArray(row.weights) ? row.weights.map(Number) : zeros(model.D);
+    model.Binv = Array.isArray(row.covariance) ? row.covariance : identity(model.D, 1 / lambda);
+    model.b = Array.isArray(meta.b) ? meta.b.map(Number) : zeros(model.D);
+    return model;
+  }
+
+  selectAction(x) {
+    const covScaled = matScale(this.Binv, this.v ** 2);
+    const theta = sampleMVN(this.mu, covScaled);
+    let best = 0;
+    let bestScore = -Infinity;
+    for (let a = 0; a < this.actionCount; a++) {
+      const offset = a * this.featureDim;
+      const thetaA = theta.slice(offset, offset + this.featureDim);
+      const score = dot(thetaA, x);
+      if (score > bestScore) {
+        bestScore = score;
+        best = a;
+      }
+    }
+    return best;
+  }
+
+  update(x, actionId, reward) {
+    const xa = buildActionFeatureVector(x, actionId, this.actionCount);
+    const Binv_x = matVec(this.Binv, xa);
+    const denom = 1 + dot(xa, Binv_x);
+    const num = outer(Binv_x, Binv_x);
+    this.Binv = matSub(this.Binv, matScale(num, 1 / denom));
+
+    // b = b + r*x ; mu = Binv*b
+    for (let i = 0; i < this.b.length; i++) this.b[i] += reward * xa[i];
+    this.mu = matVec(this.Binv, this.b);
+  }
+
+  async save({ version = 1 }) {
+    const meta = {
+      featureDim: this.featureDim,
+      actionCount: this.actionCount,
+      lambda: this.lambda,
+      v: this.v,
+      featureOrderHash: this.featureOrderHash,
+      b: this.b
+    };
+    await query(
+      `insert into bandit_models (domain, version, weights, covariance, meta, created_at, updated_at)
+       values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, timezone('utc', now()), timezone('utc', now()))
+       on conflict (domain, version)
+       do update set
+         weights = excluded.weights,
+         covariance = excluded.covariance,
+         meta = excluded.meta,
+         updated_at = timezone('utc', now())`,
+      [
+        this.domain,
+        version,
+        JSON.stringify(this.mu),
+        JSON.stringify(this.Binv),
+        JSON.stringify(meta)
+      ]
+    );
+  }
+}
+
*** End Patch
```

---

### 3.14 `apps/api/src/modules/nudge/policy/wakeBandit.js`（新規, 2.9）

```text
*** Begin Patch
*** Add File: apps/api/src/modules/nudge/policy/wakeBandit.js
+import { LinTSModel, generateFeatureOrderHash } from './linTS.js';
+import { STRUGGLE_ORDER } from '../features/stateBuilder.js';
+
+// Action mapping (v3-data.md / tech-bandit-v3.md)
+export const WAKE_ACTIONS = [
+  'do_nothing',
+  'gentle_wake',
+  'direct_wake',
+  'future_ref_wake'
+];
+
+export const BEDTIME_ACTIONS = [
+  'do_nothing',
+  'gentle_bedtime',
+  'firm_bedtime',
+  'psychoedu_bedtime'
+];
+
+function commonFeatureFields() {
+  return [
+    'bias',
+    'localHour_sin', 'localHour_cos',
+    'dow_0', 'dow_1', 'dow_2', 'dow_3', 'dow_4', 'dow_5', 'dow_6',
+    'sleepDebtHours',
+    'snsMinutesToday_norm',
+    'stepsToday_norm',
+    'sedentaryMinutesToday_norm',
+    'big5_O', 'big5_C', 'big5_E', 'big5_A', 'big5_N',
+    ...STRUGGLE_ORDER.map(s => `struggle_${s}`),
+    'nudge_quiet', 'nudge_normal', 'nudge_active',
+    'feeling_self_loathing_norm', 'feeling_anxiety_norm'
+  ];
+}
+
+function domainFields() {
+  return [
+    'avgWake7d_norm',
+    'avgBedtime7d_norm',
+    'wakeSuccessRate7d',
+    'bedtimeSuccessRate7d',
+    'snsMinutesLast60_norm',
+    'snsLongUseAtNight'
+  ];
+}
+
+export function encodeWakeState(state) {
+  const fields = [];
+  const x = [];
+
+  // bias
+  fields.push('bias'); x.push(1);
+
+  const hour = Number(state.localHour ?? 0);
+  const sin = Math.sin((2 * Math.PI * hour) / 24);
+  const cos = Math.cos((2 * Math.PI * hour) / 24);
+  fields.push('localHour_sin'); x.push(sin);
+  fields.push('localHour_cos'); x.push(cos);
+
+  const dow = Number(state.dayOfWeek ?? 0);
+  for (let i = 0; i < 7; i++) {
+    fields.push(`dow_${i}`);
+    x.push(i === dow ? 1 : 0);
+  }
+
+  // clip [-5,5] (kept as raw per tech-bandit; model learns scale)
+  fields.push('sleepDebtHours'); x.push(Math.max(-5, Math.min(5, Number(state.sleepDebtHours ?? 0))));
+
+  // day totals (normalize)
+  fields.push('snsMinutesToday_norm'); x.push(Math.min(Number(state.snsMinutesToday ?? 0), 600) / 600);
+  fields.push('stepsToday_norm'); x.push(Math.min(Number(state.stepsToday ?? 0), 15000) / 15000);
+  fields.push('sedentaryMinutesToday_norm'); x.push(Math.min(Number(state.sedentaryMinutesToday ?? 0), 180) / 180);
+
+  const b = state.big5 || {};
+  fields.push('big5_O'); x.push(Number(b.O ?? 0));
+  fields.push('big5_C'); x.push(Number(b.C ?? 0));
+  fields.push('big5_E'); x.push(Number(b.E ?? 0));
+  fields.push('big5_A'); x.push(Number(b.A ?? 0));
+  fields.push('big5_N'); x.push(Number(b.N ?? 0));
+
+  const struggles = Array.isArray(state.struggles) ? state.struggles : [];
+  for (const s of STRUGGLE_ORDER) {
+    fields.push(`struggle_${s}`);
+    x.push(struggles.includes(s) ? 1 : 0);
+  }
+
+  const intensity = String(state.nudgeIntensity || 'normal');
+  fields.push('nudge_quiet'); x.push(intensity === 'quiet' ? 1 : 0);
+  fields.push('nudge_normal'); x.push(intensity === 'normal' ? 1 : 0);
+  fields.push('nudge_active'); x.push(intensity === 'active' ? 1 : 0);
+
+  const counts = state.recentFeelingCounts || {};
+  fields.push('feeling_self_loathing_norm'); x.push(Math.min(Number(counts.self_loathing ?? 0), 10) / 10);
+  fields.push('feeling_anxiety_norm'); x.push(Math.min(Number(counts.anxiety ?? 0), 10) / 10);
+
+  // domain fields
+  fields.push('avgWake7d_norm'); x.push(state.avgWake7d != null ? Math.max(0, Math.min(1, Number(state.avgWake7d) / 24)) : 0);
+  fields.push('avgBedtime7d_norm'); x.push(state.avgBedtime7d != null ? Math.max(0, Math.min(1, Number(state.avgBedtime7d) / 24)) : 0);
+  fields.push('wakeSuccessRate7d'); x.push(Math.max(0, Math.min(1, Number(state.wakeSuccessRate7d ?? 0))));
+  fields.push('bedtimeSuccessRate7d'); x.push(Math.max(0, Math.min(1, Number(state.bedtimeSuccessRate7d ?? 0))));
+  fields.push('snsMinutesLast60_norm'); x.push(Math.min(Number(state.snsMinutesLast60min ?? 0), 90) / 90);
+  fields.push('snsLongUseAtNight'); x.push(state.snsLongUseAtNight ? 1 : 0);
+
+  return { x, fields };
+}
+
+export async function loadWakeBandit({ domain = 'rhythm_wake' }) {
+  const { x, fields } = encodeWakeState({
+    localHour: 0,
+    dayOfWeek: 0,
+    sleepDebtHours: 0,
+    snsMinutesToday: 0,
+    stepsToday: 0,
+    sedentaryMinutesToday: 0,
+    big5: { O: 0, C: 0, E: 0, A: 0, N: 0 },
+    struggles: [],
+    nudgeIntensity: 'normal',
+    recentFeelingCounts: {},
+    avgWake7d: 0,
+    avgBedtime7d: 0,
+    wakeSuccessRate7d: 0,
+    bedtimeSuccessRate7d: 0,
+    snsMinutesLast60min: 0,
+    snsLongUseAtNight: false
+  });
+  const featureOrderHash = generateFeatureOrderHash(fields);
+  return LinTSModel.loadOrInit({
+    domain,
+    version: 1,
+    featureDim: x.length,
+    actionCount: 4,
+    lambda: 1.0,
+    v: 0.5,
+    featureOrderHash
+  });
+}
+
+export function actionIdToTemplate(domain, actionId) {
+  const list = domain === 'rhythm_bedtime' ? BEDTIME_ACTIONS : WAKE_ACTIONS;
+  return list[actionId] || 'do_nothing';
+}
+
*** End Patch
```

---

### 3.15 `apps/api/src/modules/nudge/policy/mentalBandit.js`（新規, 2.9）

```text
*** Begin Patch
*** Add File: apps/api/src/modules/nudge/policy/mentalBandit.js
+import { LinTSModel, generateFeatureOrderHash } from './linTS.js';
+import { STRUGGLE_ORDER } from '../features/stateBuilder.js';
+
+export const MENTAL_ACTIONS = [
+  'do_nothing',
+  'soft_self_compassion',
+  'cognitive_reframe',
+  'behavioral_activation_micro',
+  'metta_like'
+];
+
+function featureFields() {
+  return [
+    'bias',
+    'localHour_sin', 'localHour_cos',
+    'dow_0', 'dow_1', 'dow_2', 'dow_3', 'dow_4', 'dow_5', 'dow_6',
+    'sleepDebtHours',
+    'snsMinutesToday_norm',
+    'stepsToday_norm',
+    'sedentaryMinutesToday_norm',
+    'big5_O', 'big5_C', 'big5_E', 'big5_A', 'big5_N',
+    ...STRUGGLE_ORDER.map(s => `struggle_${s}`),
+    'nudge_quiet', 'nudge_normal', 'nudge_active',
+    'feelingId_self_loathing', 'feelingId_anxiety', 'feelingId_anger', 'feelingId_jealousy', 'feelingId_other',
+    'recentFeelingCount_norm',
+    'recentFeelingCount7d_norm',
+    'ruminationProxy_norm'
+  ];
+}
+
+export function encodeMentalState(state) {
+  const fields = [];
+  const x = [];
+
+  fields.push('bias'); x.push(1);
+  const hour = Number(state.localHour ?? 0);
+  fields.push('localHour_sin'); x.push(Math.sin((2 * Math.PI * hour) / 24));
+  fields.push('localHour_cos'); x.push(Math.cos((2 * Math.PI * hour) / 24));
+
+  const dow = Number(state.dayOfWeek ?? 0);
+  for (let i = 0; i < 7; i++) {
+    fields.push(`dow_${i}`);
+    x.push(i === dow ? 1 : 0);
+  }
+
+  fields.push('sleepDebtHours'); x.push(Math.max(-5, Math.min(5, Number(state.sleepDebtHours ?? 0))));
+  fields.push('snsMinutesToday_norm'); x.push(Math.min(Number(state.snsMinutesToday ?? 0), 600) / 600);
+
+  // Unused in mental but kept for shared vector shape stability
+  fields.push('stepsToday_norm'); x.push(0);
+  fields.push('sedentaryMinutesToday_norm'); x.push(0);
+
+  const b = state.big5 || {};
+  fields.push('big5_O'); x.push(Number(b.O ?? 0));
+  fields.push('big5_C'); x.push(Number(b.C ?? 0));
+  fields.push('big5_E'); x.push(Number(b.E ?? 0));
+  fields.push('big5_A'); x.push(Number(b.A ?? 0));
+  fields.push('big5_N'); x.push(Number(b.N ?? 0));
+
+  const struggles = Array.isArray(state.struggles) ? state.struggles : [];
+  for (const s of STRUGGLE_ORDER) {
+    fields.push(`struggle_${s}`);
+    x.push(struggles.includes(s) ? 1 : 0);
+  }
+
+  const intensity = String(state.nudgeIntensity || 'normal');
+  fields.push('nudge_quiet'); x.push(intensity === 'quiet' ? 1 : 0);
+  fields.push('nudge_normal'); x.push(intensity === 'normal' ? 1 : 0);
+  fields.push('nudge_active'); x.push(intensity === 'active' ? 1 : 0);
+
+  const fid = String(state.feelingId || 'other');
+  fields.push('feelingId_self_loathing'); x.push(fid === 'self_loathing' ? 1 : 0);
+  fields.push('feelingId_anxiety'); x.push(fid === 'anxiety' ? 1 : 0);
+  fields.push('feelingId_anger'); x.push(fid === 'anger' ? 1 : 0);
+  fields.push('feelingId_jealousy'); x.push(fid === 'jealousy' ? 1 : 0);
+  fields.push('feelingId_other'); x.push(['self_loathing','anxiety','anger','jealousy'].includes(fid) ? 0 : 1);
+
+  fields.push('recentFeelingCount_norm'); x.push(Math.min(Number(state.recentFeelingCount ?? 0), 10) / 10);
+  fields.push('recentFeelingCount7d_norm'); x.push(Math.min(Number(state.recentFeelingCount7d ?? 0), 20) / 20);
+  fields.push('ruminationProxy_norm'); x.push(Math.max(0, Math.min(1, Number(state.ruminationProxy ?? 0))));
+
+  return { x, fields };
+}
+
+export async function loadMentalBandit() {
+  const { x, fields } = encodeMentalState({
+    localHour: 0,
+    dayOfWeek: 0,
+    feelingId: 'other',
+    recentFeelingCount: 0,
+    recentFeelingCount7d: 0,
+    sleepDebtHours: 0,
+    snsMinutesToday: 0,
+    ruminationProxy: 0,
+    big5: { O: 0, C: 0, E: 0, A: 0, N: 0 },
+    struggles: [],
+    nudgeIntensity: 'normal'
+  });
+  const featureOrderHash = generateFeatureOrderHash(fields);
+  return LinTSModel.loadOrInit({
+    domain: 'mental',
+    version: 1,
+    featureDim: x.length,
+    actionCount: 5,
+    lambda: 1.0,
+    v: 0.7,
+    featureOrderHash
+  });
+}
+
+export function actionIdToTemplate(actionId) {
+  return MENTAL_ACTIONS[actionId] || 'do_nothing';
+}
+
*** End Patch
```

---

### 3.16 `apps/api/src/routes/mobile/realtime.js`（Update, 2.3）

```text
*** Begin Patch
*** Update File: apps/api/src/routes/mobile/realtime.js
@@
 import express from 'express';
 import crypto from 'crypto';
 import { issueRealtimeClientSecret } from '../../services/openaiRealtimeService.js';
 import baseLogger from '../../utils/logger.js';
+import { buildContextSnapshot } from '../../modules/realtime/contextSnapshot.js';
 import {
   getEntitlementState,
   startUsageSession,
   finishUsageSessionAndBill,
   normalizePlanForResponse,
   canUseRealtime
 } from '../../services/subscriptionStore.js';
 import extractUserId from '../../middleware/extractUserId.js';
@@
 router.get('/session', async (req, res) => {
   const deviceId = (req.get('device-id') || '').toString().trim();
   const userId = await extractUserId(req, res);
   if (!userId) return;
@@
     // 再取得して最新の状態を返す
     const updatedEntitlement = await getEntitlementState(userId);
-    const payload = await issueRealtimeClientSecret({ deviceId, userId });
+    const [payload, contextSnapshot] = await Promise.all([
+      issueRealtimeClientSecret({ deviceId, userId }),
+      buildContextSnapshot({ userId, deviceId })
+    ]);
     
     return res.json({
       ...payload,
       session_id: sessionId,
-      entitlement: normalizePlanForResponse(updatedEntitlement)
+      entitlement: normalizePlanForResponse(updatedEntitlement),
+      context_snapshot: contextSnapshot
     });
   } catch (error) {
     logger.error('Failed to issue client_secret', error);
     return res.status(500).json({ error: 'failed_to_issue_client_secret' });
   }
 });
@@
   try {
     const minutes = await finishUsageSessionAndBill(userId, session_id);
     const state = await getEntitlementState(userId);
     return res.json({
       minutes_billed: minutes,
-      entitlement: normalizePlanForResponse(state)
+      entitlement: normalizePlanForResponse(state),
+      context_snapshot: await buildContextSnapshot({ userId, deviceId })
     });
   } catch (error) {
     logger.error('Failed to stop session', error);
     return res.status(500).json({ error: 'failed_to_stop' });
   }
 });
+
+// Realtime tool endpoint: get_context_snapshot
+// iOS parses tool_call and calls this endpoint, then forwards JSON back to OpenAI as tool output.
+router.post('/tools/get_context_snapshot', async (req, res) => {
+  const deviceId = (req.get('device-id') || '').toString().trim();
+  const userId = await extractUserId(req, res);
+  if (!userId) return;
+
+  try {
+    const snapshot = await buildContextSnapshot({ userId, deviceId });
+    return res.json({ ok: true, context_snapshot: snapshot });
+  } catch (e) {
+    logger.error('Failed to build context snapshot', e);
+    return res.status(500).json({
+      ok: false,
+      error: { code: 'INTERNAL_ERROR', message: 'Failed to build context snapshot' }
+    });
+  }
+});
 
 export default router;
*** End Patch
```

---

### 3.17 `apps/api/src/routes/mobile/behavior.js`（新規, 2.4）

```text
*** Begin Patch
*** Add File: apps/api/src/routes/mobile/behavior.js
+import express from 'express';
+import baseLogger from '../../utils/logger.js';
+import extractUserId from '../../middleware/extractUserId.js';
+import { buildContextSnapshot } from '../../modules/realtime/contextSnapshot.js';
+import { buildHighlights, buildTimeline, pickTodayInsight } from '../../modules/metrics/stateBuilder.js';
+import { generateFutureScenario } from '../../modules/simulation/futureScenario.js';
+
+const router = express.Router();
+const logger = baseLogger.withContext('MobileBehavior');
+
+// GET /api/mobile/behavior/summary
+router.get('/summary', async (req, res) => {
+  const deviceId = (req.get('device-id') || '').toString().trim();
+  const userId = await extractUserId(req, res);
+  if (!userId) return;
+
+  try {
+    const snapshot = await buildContextSnapshot({ userId, deviceId });
+    const tz = snapshot?.timezone || 'UTC';
+    const lang = snapshot?.language || 'en';
+    const today = snapshot?.today_stats || null;
+
+    const todayInsight = pickTodayInsight({ todayStats: today, language: lang });
+    const highlights = buildHighlights({ todayStats: today, timezone: tz });
+    const timeline = buildTimeline({ todayStats: today, timezone: tz });
+    const futureScenario = await generateFutureScenario({
+      language: lang,
+      traits: snapshot?.traits || {},
+      todayStats: today || {},
+      now: new Date()
+    });
+
+    return res.json({
+      todayInsight,
+      highlights,
+      futureScenario,
+      timeline
+    });
+  } catch (e) {
+    logger.error('Failed to build behavior summary', e);
+    return res.status(500).json({ error: 'failed_to_get_behavior_summary' });
+  }
+});
+
+export default router;
+
*** End Patch
```

---

### 3.18 `apps/api/src/routes/mobile/feeling.js`（新規, 2.5）

```text
*** Begin Patch
*** Add File: apps/api/src/routes/mobile/feeling.js
+import express from 'express';
+import { z } from 'zod';
+import crypto from 'crypto';
+import baseLogger from '../../utils/logger.js';
+import extractUserId from '../../middleware/extractUserId.js';
+import { query } from '../../lib/db.js';
+import { resolveProfileId } from '../../services/mobile/userIdResolver.js';
+import { getUserTimezone, buildMentalState, normalizeBig5, getUserTraits } from '../../modules/nudge/features/stateBuilder.js';
+import { loadMentalBandit, encodeMentalState, actionIdToTemplate } from '../../modules/nudge/policy/mentalBandit.js';
+import { getMem0Client } from '../../modules/memory/mem0Client.js';
+import { getEntitlementState, normalizePlanForResponse } from '../../services/subscriptionStore.js';
+
+const router = express.Router();
+const logger = baseLogger.withContext('MobileFeeling');
+
+const startSchema = z.object({
+  feelingId: z.string(),
+  topic: z.string().optional()
+});
+
+const endSchema = z.object({
+  session_id: z.string().optional(),
+  sessionId: z.string().optional(),
+  emaBetter: z.union([z.boolean(), z.null()]).optional(),
+  summary: z.string().optional()
+});
+
+function opener(feelingId, lang) {
+  const ja = lang === 'ja';
+  switch (String(feelingId)) {
+    case 'self_loathing':
+      return ja
+        ? 'ここにいるよ。自己嫌悪は重いよね。まずは一緒に、その痛みを少しだけゆるめよう。'
+        : "I'm here. Self-loathing is heavy. Let's soften that painful voice together, just a little.";
+    case 'anxiety':
+      return ja
+        ? '大丈夫。まず息をひとつ。肩を少しゆるめて、今この瞬間に戻ろう。'
+        : "I'm with you. One breath. Let your shoulders drop a little, and come back to this moment.";
+    case 'anger':
+    case 'irritation':
+      return ja
+        ? 'その熱さ、きついよね。反応する前に、息をひとつだけ置こう。'
+        : "I hear that heat. Before we react, let's place one breath of space.";
+    default:
+      return ja
+        ? 'ここはあなたの場所。静かでも、話しても大丈夫。必要なら、最近の流れから優しく始めるよ。'
+        : 'This space is yours. We can talk or be quiet. If you want, I can start gently from your recent days.';
+  }
+}
+
+// POST /api/mobile/feeling/start
+router.post('/start', async (req, res) => {
+  const deviceId = (req.get('device-id') || '').toString().trim();
+  const userId = await extractUserId(req, res);
+  if (!userId) return;
+
+  const parsed = startSchema.safeParse(req.body);
+  if (!parsed.success) {
+    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid body', details: parsed.error.errors } });
+  }
+
+  const profileId = await resolveProfileId(userId);
+  if (!profileId) {
+    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Could not resolve profile_id' } });
+  }
+
+  try {
+    const tz = await getUserTimezone(profileId);
+    const state = await buildMentalState({ profileId, feelingId: parsed.data.feelingId, now: new Date(), tz });
+    const bandit = await loadMentalBandit();
+    const { x } = encodeMentalState(state);
+    const actionId = bandit.selectAction(x);
+    const actionTemplate = actionIdToTemplate(actionId);
+
+    const sessionId = crypto.randomUUID();
+    await query(
+      `insert into feeling_sessions
+        (id, user_id, feeling_id, topic, action_template, started_at, context, created_at)
+       values
+        ($1::uuid, $2::uuid, $3, $4, $5, timezone('utc', now()), $6::jsonb, timezone('utc', now()))`,
+      [sessionId, profileId, parsed.data.feelingId, parsed.data.topic || null, actionTemplate, JSON.stringify(state)]
+    );
+
+    // Return minimal opening script (LLM opener can be added later)
+    const settings = await query(`select language from user_settings where user_id=$1::uuid limit 1`, [profileId]);
+    const lang = settings.rows?.[0]?.language || 'en';
+
+    return res.json({
+      sessionId,
+      openingScript: opener(parsed.data.feelingId, lang),
+      actionTemplate,
+      context_snapshot: {
+        mental_state: state
+      }
+    });
+  } catch (e) {
+    logger.error('Failed to start feeling session', e);
+    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to start feeling session' } });
+  }
+});
+
+// POST /api/mobile/feeling/end
+router.post('/end', async (req, res) => {
+  const userId = await extractUserId(req, res);
+  if (!userId) return;
+
+  const parsed = endSchema.safeParse(req.body);
+  if (!parsed.success) {
+    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid body', details: parsed.error.errors } });
+  }
+
+  const sessionId = parsed.data.session_id || parsed.data.sessionId;
+  if (!sessionId) {
+    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'session_id is required' } });
+  }
+
+  const profileId = await resolveProfileId(userId);
+  if (!profileId) {
+    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Could not resolve profile_id' } });
+  }
+
+  try {
+    const r = await query(
+      `select id, user_id, feeling_id, action_template, context
+         from feeling_sessions
+        where id = $1::uuid and user_id = $2::uuid
+        limit 1`,
+      [sessionId, profileId]
+    );
+    const row = r.rows?.[0];
+    if (!row) {
+      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
+    }
+
+    const emaBetter = parsed.data.emaBetter ?? null;
+    await query(
+      `update feeling_sessions
+          set ended_at = timezone('utc', now()),
+              ema_better = $3,
+              summary = $4
+        where id = $1::uuid and user_id = $2::uuid`,
+      [sessionId, profileId, emaBetter, parsed.data.summary || null]
+    );
+
+    // Bandit update only when emaBetter is boolean
+    if (typeof emaBetter === 'boolean') {
+      const bandit = await loadMentalBandit();
+      const state = row.context || {};
+      const { x } = encodeMentalState(state);
+      const actionTemplate = String(row.action_template || 'do_nothing');
+      const actionId = Math.max(0, ['do_nothing','soft_self_compassion','cognitive_reframe','behavioral_activation_micro','metta_like'].indexOf(actionTemplate));
+      bandit.update(x, actionId, emaBetter ? 1 : 0);
+      await bandit.save({ version: 1 });
+    }
+
+    // Save to mem0 as interaction (best-effort)
+    try {
+      const mem0 = getMem0Client();
+      await mem0.addInteraction({
+        userId: profileId,
+        content: `Feeling session: ${row.feeling_id}. Template: ${row.action_template}. EMA: ${emaBetter === null ? 'skipped' : emaBetter ? 'better' : 'not better'}. Summary: ${parsed.data.summary || ''}`.trim(),
+        metadata: {
+          sessionId,
+          feelingId: row.feeling_id,
+          actionTemplate: row.action_template,
+          emaBetter,
+          timestamp: new Date().toISOString()
+        }
+      });
+    } catch (e) {
+      logger.warn('mem0 interaction save failed', e);
+    }
+
+    const ent = await getEntitlementState(userId);
+    return res.json({ success: true, entitlement: normalizePlanForResponse(ent) });
+  } catch (e) {
+    logger.error('Failed to end feeling session', e);
+    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to end feeling session' } });
+  }
+});
+
+export default router;
+
*** End Patch
```

---

### 3.19 `apps/api/src/routes/mobile/nudge.js`（新規, 2.6）

```text
*** Begin Patch
*** Add File: apps/api/src/routes/mobile/nudge.js
+import express from 'express';
+import { z } from 'zod';
+import crypto from 'crypto';
+import baseLogger from '../../utils/logger.js';
+import extractUserId from '../../middleware/extractUserId.js';
+import { query } from '../../lib/db.js';
+import { resolveProfileId } from '../../services/mobile/userIdResolver.js';
+import { getUserTimezone, buildScreenState, buildMovementState, getUserTraits } from '../../modules/nudge/features/stateBuilder.js';
+import { computeReward } from '../../modules/nudge/reward/rewardCalculator.js';
+import { getMem0Client } from '../../modules/memory/mem0Client.js';
+
+const router = express.Router();
+const logger = baseLogger.withContext('MobileNudge');
+
+const triggerSchema = z.object({
+  eventType: z.string(),
+  timestamp: z.string().optional(),
+  payload: z.any().optional()
+});
+
+const feedbackSchema = z.object({
+  nudgeId: z.string(),
+  outcome: z.enum(['success', 'failed', 'ignored']).optional(),
+  signals: z.record(z.any()).optional()
+});
+
+function pickTemplate({ domain, eventType, intensity }) {
+  // Minimal mapping per prompts-v3.md examples.
+  if (domain === 'screen') {
+    if (String(eventType).includes('60')) return 'direct_sns_stop';
+    return intensity === 'active' ? 'direct_sns_stop' : 'gentle_sns_break';
+  }
+  if (domain === 'movement') {
+    return intensity === 'active' ? 'walk_invite' : 'short_break';
+  }
+  return 'do_nothing';
+}
+
+function renderMessage(templateId, lang) {
+  const ja = lang === 'ja';
+  switch (templateId) {
+    case 'gentle_sns_break':
+      return ja
+        ? '少しスクロールが続いてるみたい。1分だけ、目と心を休めよう。'
+        : "You've been scrolling for a while. How about a one-minute pause to let your eyes and mind breathe?";
+    case 'direct_sns_stop':
+      return ja
+        ? 'ここで一度切ろう。スマホを伏せて、次の数分を取り戻そう。'
+        : "Let's cut it here. Put the phone face-down and reclaim the next few minutes.";
+    case 'short_break':
+      return ja
+        ? '座りっぱなしが続いてるよ。立って、伸びて、数歩だけ。'
+        : "You've been still for a while. Stand up, stretch, take a few steps—just one minute.";
+    case 'walk_invite':
+      return ja
+        ? '今、5分だけ歩こう。体が動くと、気分も少し変わるよ。'
+        : 'Let’s walk for five minutes. When the body moves, the mind often shifts too.';
+    default:
+      return ja ? '今は送らないよ。' : 'No nudge for now.';
+  }
+}
+
+function classifyDomain(eventType) {
+  const t = String(eventType);
+  if (t.includes('sns') || t.includes('screen')) return { domain: 'screen', subtype: t };
+  if (t.includes('sedentary') || t.includes('movement')) return { domain: 'movement', subtype: t };
+  return { domain: 'unknown', subtype: t };
+}
+
+// POST /api/mobile/nudge/trigger
+router.post('/trigger', async (req, res) => {
+  const userId = await extractUserId(req, res);
+  if (!userId) return;
+  const deviceId = (req.get('device-id') || '').toString().trim();
+
+  const parsed = triggerSchema.safeParse(req.body);
+  if (!parsed.success) {
+    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid body', details: parsed.error.errors } });
+  }
+
+  const profileId = await resolveProfileId(userId);
+  if (!profileId) {
+    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Could not resolve profile_id' } });
+  }
+
+  try {
+    const tz = await getUserTimezone(profileId);
+    const traits = await getUserTraits(profileId);
+    const { domain, subtype } = classifyDomain(parsed.data.eventType);
+
+    let state = null;
+    if (domain === 'screen') state = await buildScreenState({ profileId, now: new Date(), tz });
+    if (domain === 'movement') state = await buildMovementState({ profileId, now: new Date(), tz });
+
+    const templateId = pickTemplate({ domain, eventType: parsed.data.eventType, intensity: traits.nudgeIntensity || 'normal' });
+    const langR = await query(`select language from user_settings where user_id = $1::uuid limit 1`, [profileId]);
+    const lang = langR.rows?.[0]?.language || 'en';
+    const message = renderMessage(templateId, lang);
+    const nudgeId = crypto.randomUUID();
+
+    await query(
+      `insert into nudge_events (id, user_id, domain, subtype, decision_point, state, action_template, channel, sent, created_at)
+       values ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, true, timezone('utc', now()))`,
+      [
+        nudgeId,
+        profileId,
+        domain,
+        subtype,
+        parsed.data.eventType,
+        JSON.stringify(state || {}),
+        templateId,
+        'notification'
+      ]
+    );
+
+    return res.json({ nudgeId, templateId, message });
+  } catch (e) {
+    logger.error('Failed to trigger nudge', e);
+    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to trigger nudge' } });
+  }
+});
+
+// POST /api/mobile/nudge/feedback
+router.post('/feedback', async (req, res) => {
+  const userId = await extractUserId(req, res);
+  if (!userId) return;
+
+  const parsed = feedbackSchema.safeParse(req.body);
+  if (!parsed.success) {
+    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid body', details: parsed.error.errors } });
+  }
+
+  const profileId = await resolveProfileId(userId);
+  if (!profileId) {
+    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Could not resolve profile_id' } });
+  }
+
+  try {
+    const ev = await query(
+      `select id, domain, subtype, action_template
+         from nudge_events
+        where id = $1::uuid and user_id = $2::uuid
+        limit 1`,
+      [parsed.data.nudgeId, profileId]
+    );
+    const row = ev.rows?.[0];
+    if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Nudge not found' } });
+
+    const signals = parsed.data.signals || {};
+    const reward = computeReward({ domain: row.domain, subtype: row.subtype, signals });
+
+    await query(
+      `insert into nudge_outcomes (id, nudge_event_id, reward, short_term, ema_score, signals, created_at)
+       values ($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb, $6::jsonb, timezone('utc', now()))`,
+      [
+        crypto.randomUUID(),
+        row.id,
+        reward,
+        JSON.stringify({ outcome: parsed.data.outcome || null }),
+        null,
+        JSON.stringify(signals)
+      ]
+    );
+
+    // Save nudge_meta to mem0 (best-effort)
+    try {
+      const mem0 = getMem0Client();
+      await mem0.addNudgeMeta({
+        userId: profileId,
+        content: `Nudge ${row.action_template} outcome=${parsed.data.outcome || ''} reward=${reward}`,
+        metadata: {
+          nudgeId: row.id,
+          templateId: row.action_template,
+          reward,
+          timestamp: new Date().toISOString()
+        }
+      });
+    } catch (e) {
+      logger.warn('mem0 nudge_meta save failed', e);
+    }
+
+    return res.json({ recorded: true, reward });
+  } catch (e) {
+    logger.error('Failed to record nudge feedback', e);
+    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to record nudge feedback' } });
+  }
+});
+
+export default router;
+
*** End Patch
```

---

### 3.20 `apps/api/src/routes/mobile/index.js`（Update, 2.13）

```text
*** Begin Patch
*** Update File: apps/api/src/routes/mobile/index.js
@@
 import express from 'express';
 import realtimeRouter from './realtime.js';
 import profileRouter from './profile.js';
 import entitlementRouter from './entitlement.js';
 import accountRouter from './account.js';
+import behaviorRouter from './behavior.js';
+import feelingRouter from './feeling.js';
+import nudgeRouter from './nudge.js';
 
 const router = express.Router();
 
 router.use('/realtime', realtimeRouter);
 router.use('/profile', profileRouter);
 router.use('/entitlement', entitlementRouter);
 router.use('/account', accountRouter);
+router.use('/behavior', behaviorRouter);
+router.use('/feeling', feelingRouter);
+router.use('/nudge', nudgeRouter);
 
 export default router;
*** End Patch
```

---

## 4) ユーザーが GUI で行う設定（Railway 等）

### Railway 環境変数（最低限）
- **必須**
  - `OPENAI_API_KEY`（Realtime / futureScenario で使用）
  - `MEM0_API_KEY`（mem0 platform client で使用）
  - `DATABASE_URL`
- **任意（運用で調整）**
  - `OPENAI_REALTIME_MODEL`（未設定時 `gpt-realtime`）
  - `OPENAI_REALTIME_VOICE`（未設定時 `alloy`）
  - `OPENAI_SIMULATION_MODEL`（未設定時 `gpt-4.1`）

---

## 5) ユーザーが実行するコマンド（必要なら。実行はしない）

### 依存インストール（apps/api）
- `cd apps/api && npm install`

### DB（前提）
- フェーズ2は DB テーブルが前提（`user_traits`, `daily_metrics`, `nudge_events`, `nudge_outcomes`, `feeling_sessions`, `bandit_models`）
- これらは **フェーズ1のマイグレーション**が適用されている必要がある（本パッチは “API 実装” フェーズ2）


