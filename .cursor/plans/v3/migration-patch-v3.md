# migration-patch-v3.md

※本ドキュメントは「実装前の計画MD」。コードや設定ファイルはまだ触らない。

## 1. iOS アプリの変更（計画）

### 1.1 `AppState.swift`

**現在の状態**  
- 認証・購読: `authStatus`, `subscriptionInfo`, `purchaseEnvironmentStatus`, `subscriptionHold`, `subscriptionHoldPlan`, `quotaHoldReason`  
- プロフィール: `userProfile`（`displayName`/`preferredLanguage`/`sleepLocation`/`trainingFocus`/`wakeLocation`/`wakeRoutines`/`sleepRoutines`/`trainingGoal`/`idealTraits`/`problems`/`useAlarmKit*`/`stickyModeEnabled`）  
- 習慣/オンボーディング: `habitSchedules`, `habitFollowupCounts`, `customHabits`/`customHabitSchedules`/`customHabitFollowupCounts`, `pendingHabitTrigger`, `pendingHabitFollowUps`, `shouldStartSessionImmediately`, `onboardingStep`, `isOnboardingComplete`, `selectedRootTab`  
- 内部キャッシュ: `cachedOffering`, `customHabit`, `pendingHabitPrompt`, `pendingConsultPrompt` など  
- 永続化は UserDefaults（`com.anicca.*` 各キー）に保存し、`ProfileSyncService.enqueue` でサーバー同期

**追加するプロパティ**  
- `ideals: [String]`（理想タグ）  
- `struggles: [String]`（苦しみタグ）  
- `big5: Big5Scores?`（`openness/conscientiousness/extraversion/agreeableness/neuroticism: Int(0-100)` と `summary: String?` を持つ構造体）  
- `keywords: [String]`（性格キーワード、Profileカード表示用）  
- `summary: String`（性格サマリ文、Profileカード表示用）  
- `nudgeIntensity: NudgeIntensity`（`quiet | normal | active`、デフォルト`normal`）  
- `stickyMode: Bool`（`stickyModeEnabled` の後継。後方互換で読み込み、保存時は新キーのみ）  
- 永続化キーを追加（例: `com.anicca.userTraits` 等）し、既存データ読み込み時は `idealTraits`/`problems`→`ideals`/`struggles` にマップ

**追加/変更するメソッド**  
- `updateTraits(ideals:struggles:)` — `userProfile` を更新し保存＋`ProfileSyncService` へ enqueue  
- `updateBig5(_ scores: Big5Scores?)` — Big5 設定・クリア両対応  
- `updateNudgeIntensity(_:)` — `nudgeIntensity` を設定し即同期  
- `setStickyMode(_ enabled: Bool)` — `stickyMode` を更新しサーバー同期（旧フィールドとの互換処理含む）  
- `profileSyncPayload` に `ideals/struggles/big5/nudgeIntensity/stickyMode` を含める  
- `applyRemoteProfilePayload` で上記新フィールドを解釈（古い `idealTraits`/`problems`/`stickyModeEnabled` は読み込みのみ）

**オンボーディング連携**  
- `OnboardingStep` に `ideals` / `struggles` / `value`（ユースケース説明）を追加し、初期ステップを `.welcome → .ideals → .struggles → .value → .account → .microphone → .notifications → .habitSetup ...` の順に更新  
- `setOnboardingStep` / `markOnboardingComplete` の保存ロジックは新ステップ値に対応させる

### 1.2 `VoiceSessionController.swift`

**現在の状態**  
- Realtime 接続確立（`session.update` で instructions 送信）、月次利用量のローカル監視（30秒ごと）  
- Sticky モードは `AppState.shared.userProfile.stickyModeEnabled` に依存し、`conversation.item.completed` / `response.completed` でリクエスト連投  
- セッション開始時に該当習慣の通知/アラームをキャンセルし、終了時 `/session/stop` へ通知

**追加/変更する挙動**  
- `session.update` に `context` を付与（`traits`=`ideals/struggles/keywords/summary`、`big5`、`nudgeIntensity`、`stickyMode`、`current_habit`) を JSON で送る  
- Feeling EMA 対応: Realtime からの `tool`/`response` により「楽になった？」フラグを受信し、`AppState` へ記録するフックを追加（UI 側 EMAModal と連動）  
- サーバーから返る `entitlement`/`context_snapshot` を保存して `AppState.subscriptionInfo` / 新規 `AppState` フィールドへ反映  
- Sticky モードの閾値・カウントを `AppState` 側の `stickyMode` に統合（`stickyModeEnabled` 後方互換を維持）

### 1.3 `Models/UserProfile.swift`

**現在の状態**  
- フィールド: `displayName`, `preferredLanguage`, `sleepLocation`, `trainingFocus`, `wakeLocation`, `wakeRoutines`, `sleepRoutines`, `trainingGoal`, `idealTraits`, `problems`, `useAlarmKit*`, `stickyModeEnabled`  
- エンコード/デコードは後方互換付き（`wakeStickyModeEnabled`）

**変更内容**  
- リネーム/追加: `idealTraits`→`ideals`, `problems`→`struggles`; 新規 `big5: Big5Scores?`, `keywords: [String]`, `summary: String`, `nudgeIntensity: NudgeIntensity`, `stickyMode: Bool`  
- 旧キーとの互換: デコード時に旧 `idealTraits/problems/stickyModeEnabled/wakeStickyModeEnabled` を読み込み、新キーへ集約。エンコードは新キーのみ  
- `NudgeIntensity` enum を追加（`quiet`/`normal`/`active`、`default: .normal`）  
- `Big5Scores` struct を追加（5因子スコア＋`summary`）  
- 既存初期値に対し、新規フィールドのデフォルトを設定（`big5 = nil`, `keywords = []`, `summary = ""`, `nudgeIntensity = .normal`, `stickyMode = true`）

### 1.4 `Onboarding/*`

**現在の状態**  
- `OnboardingStep` には 10 ステップのみ（`welcome/microphone/notifications/account/habitSetup/habitWakeLocation/habitSleepLocation/habitTrainingFocus/paywall/completion`）

- 新規ステップ enum: `.ideals`, `.struggles`, `.value` を追加（RawValue 再配置に注意。既存保存値に対し 5→shift のマイグレーション処理を `AppState` 初期化時に追加）  
- 新規画面: `IdealsView.swift`, `StrugglesView.swift`, `ValueView.swift` をルーティングへ組み込み  
- `SignInView`, `MicPermissionView`, `NotificationPermissionView` は v3 文言へ更新（`Skip/Continue` 整理）

- 旧RawValueが保存されている場合、初期化時に新しい値へマッピングし直すこと。

### 1.5 その他 iOS 変更ポイント（抜粋）
- `MainTabView.swift` を Talk/Behavior/Profile の3タブに更新  
- `ProfileView.swift` へ `ideals/struggles/nudgeIntensity/stickyMode` 編集 UI を追加、`TraitsDetailView.swift` で `Big5Scores` を表示  
- `TalkView.swift` / `SessionView.swift` に EMA モーダル連携（セッション終了時の「楽になった？」）  
- `NotificationScheduler.swift`：Nudge カテゴリ/フォローアップ通知を追加（nudge強度に応じた頻度調整）  
- `QuoteProvider.swift`：固定30件の Quote をローテーションする新サービス

## 2. バックエンド API の変更

### 2.1 `routes/mobile/realtime.js`
**現在**: `GET /session` で利用量チェック→`session_id` 発行→`client_secret` 返却。`POST /session/stop` で課金と entitle 返却。  
**変更**:  
- `context_snapshot` 取得 API（`POST /session/context-snapshot` など）を追加し、Realtime tool から要求されたときの状態返却を実装（`user_traits`/`daily_metrics`/`feeling_sessions` を読み出し）  
- `/session` レスポンスに `context_snapshot`（最新 traits/big5/nudgeIntensity/stickyMode + 直近 feeling 状態）を含める  
- `/session/stop` で `minutes_billed` に加え直近 `entitlement`/`context_snapshot` を返す

### 2.2 `services/mobile/profileService.js`
**現在**: `mobile_profiles` への JSON upsert と `user_settings.language` 更新のみ。traits/big5 未対応。  
**変更**:  
- 新テーブル `user_traits` を読み書きするメソッドを追加（`saveTraits({userId, ideals, struggles, big5, nudgeIntensity, stickyMode})` 等）  
- `getProfile`/`getProfileByUserId` が traits 情報を JOIN して返却するよう拡張  
- 互換処理: 旧 `profile` JSON 内に `idealTraits`/`problems` がある場合は `user_traits` へバックフィル

### 2.3 その他 API 層
- `subscriptionStore.js`：`normalizePlanForResponse` に `monthly_usage_limit/remaining/count` を含めて返却（クライアント側 UsageTracking と一致させる）  
- 新規ルーター雛形: `routes/mobile/behavior.js`（サマリ/ハイライト/未来シナリオ）、`routes/mobile/feeling.js`（Feeling EMI start/end/EMA）、`routes/mobile/nudge.js`（trigger/feedback）
- 認証/識別: v0.3 では既存のヘッダー方式を継続し、すべてのモバイル API は `user-id` / `device-id` ヘッダーを必須とする。UUID への内部移行はサービス層・DB 層で行い、HTTP インターフェースは変更しない。

## 3. Prisma schema の変更

**現状**: `apps/api/prisma/schema.prisma` が未配置（Prisma 未導入）。`docs/migrations` には SQL ベースの既存テーブルのみ。  
**対応**: 新規に `apps/api/prisma/schema.prisma` を作成し、`tech-db-schema-v3.md` のモデルをそのまま定義する。必須モデル:
- `UserTrait`（`ideals`/`struggles`/`big5 Json`/`keywords String[]`/`summary String`/`nudgeIntensity`/`stickyMode`）  
- `DailyMetric`（睡眠/スクリーン/歩数/座位/insights 等）  
- `NudgeEvent` / `NudgeOutcome`（state, action, reward, emaScore, signals）  
- `FeelingSession`（feeling_id/topic/emaBetter/summary/transcript/context）  
- `HabitLog`（習慣ログ）  
- `BanditModel`（LinTS パラメータ）  
- 既存テーブルの Prisma 定義も合わせて追記（`Token`, `RefreshToken`, `MobileProfile`, `MobileVoipToken`, `MobileAlarmSchedule`, `UserSubscription`, `SubscriptionEvent`, `UsageSession`, `MonthlyVcGrant`）

**インデックス/制約**: JSONB カラムに GIN（`state`, `shortTerm`, `mindSummary` 等）を raw SQL マイグレーションで追加。ID は UUID、時刻は `DateTime @db.Timestamptz`。

## 4. Info.plist の変更（計画）

- `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription`（睡眠・歩数/運動の読み取り・アップデート理由を明記）  
- `NSMotionUsageDescription`（座位/歩行検知でナッジを行う旨を明記）  
- FamilyControls/ScreenTime 用の説明文（エンタイトルメント `com.apple.developer.family-controls` を使う前提で透明性を確保）  
- 既存の `NSMicrophoneUsageDescription` / `NSUserNotificationUsageDescription` は v3 文言に更新（Talk/Nudge 目的を明記）

## 5. 多言語方針（計画）
- `preferredLanguage` (ja/en) をクライアント→サーバー間で保持し、サマリ文/Big5 summary/keywords/context_snapshot を同言語で生成・返却（未設定時はOS言語、なければ en）。Profile/Traits UI も同言語で表示する。

## 6. 新規 API エンドポイント詳細仕様

### 6.1 `GET /api/mobile/behavior/summary`

**目的**: Today's Insights + ハイライト + 10年後シナリオを返す

**リクエスト**:
```http
GET /api/mobile/behavior/summary
Headers:
  user-id: <uuid>
  device-id: <uuid>
```

**レスポンス**:
```json
{
  "todayInsight": "睡眠がいつもより短かった。午後のスクロールが増えた。",
  "highlights": {
    "wake": { "status": "on_track", "label": "Wake 7:30" },
    "screen": { "status": "warning", "label": "SNS 2h 15m" },
    "workout": { "status": "missed", "label": "No activity" },
    "rumination": { "status": "ok", "label": "Low" }
  },
  "futureScenario": {
    "ifContinue": "現在のパターンを続けると...",
    "ifImprove": "少しの改善で..."
  },
  "timeline": [
    { "type": "sleep", "start": "00:00", "end": "07:30" },
    { "type": "scroll", "start": "08:00", "end": "08:45" }
  ]
}
```

- 上記 JSON 形式を v0.3 の正式仕様とし、`highlights` は `wake` / `screen` / `workout` / `rumination` の 4 キーを持つ。各値は `{ "status": string, "label": string }` 形式で返す。

### 6.2 `POST /api/mobile/feeling/start`

**目的**: Feeling セッション開始を記録

**リクエスト**:
```json
{
  "feelingId": "self_loathing",
  "topic": "今日の仕事で失敗した"
}
```

**レスポンス**:
```json
{
  "sessionId": "uuid",
  "openingScript": "I'm here. Self-loathing is heavy..."
}
```

### 6.3 `POST /api/mobile/feeling/end`

**目的**: Feeling セッション終了 + EMA 回答を記録

**リクエスト**:
```json
{
  "sessionId": "uuid",
  "emaBetter": true,
  "summary": "自己批判の声を和らげることができた"
}
```

**レスポンス**:
```json
{
  "saved": true
}
```

### 6.4 `POST /api/mobile/nudge/trigger`

**目的**: iOS からの DP イベントを受信

**リクエスト**:
```json
{
  "eventType": "sns_30min",
  "timestamp": "2025-01-15T14:30:00Z",
  "payload": {
    "snsMinutes": 30,
    "app": "Instagram"
  }
}
```

**レスポンス**:
```json
{
  "nudgeId": "uuid",
  "templateId": "sns_break_gentle",
  "message": "ここで一度、手を離そう。目と心を休める 5 分にしよう。"
}
```

### 6.5 `POST /api/mobile/nudge/feedback`

**目的**: Nudge の結果（成功/失敗）を記録

**リクエスト**:
```json
{
  "nudgeId": "uuid",
  "outcome": "success",
  "signals": {
    "appClosed": true,
    "noReopenMinutes": 15
  }
}
```

**レスポンス**:
```json
{
  "recorded": true
}
```

---

## 7. エラーハンドリングパターン

### 7.1 共通エラーレスポンス形式

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

### 7.2 エラーコード一覧

| HTTP | code | 意味 | 対処 |
|------|------|------|------|
| 400 | `INVALID_REQUEST` | リクエスト形式が不正 | クライアント修正 |
| 401 | `UNAUTHORIZED` | 認証失敗 | 再ログイン |
| 402 | `QUOTA_EXCEEDED` | 月間利用量上限 | Paywall 表示 |
| 403 | `FORBIDDEN` | 権限なし | - |
| 404 | `NOT_FOUND` | リソースなし | - |
| 422 | `VALIDATION_ERROR` | バリデーション失敗 | details 参照 |
| 429 | `RATE_LIMITED` | レート制限 | リトライ |
| 500 | `INTERNAL_ERROR` | サーバーエラー | リトライ |
| 503 | `SERVICE_UNAVAILABLE` | メンテナンス中 | 後でリトライ |

### 7.3 iOS 側のエラーハンドリング

```swift
enum AniccaAPIError: Error {
    case invalidRequest(message: String)
    case unauthorized
    case quotaExceeded
    case notFound
    case validationError(details: [String: Any])
    case rateLimited
    case serverError
    case serviceUnavailable
    
    init(statusCode: Int, body: [String: Any]) {
        switch statusCode {
        case 400: self = .invalidRequest(message: body["message"] as? String ?? "")
        case 401: self = .unauthorized
        case 402: self = .quotaExceeded
        case 404: self = .notFound
        case 422: self = .validationError(details: body["details"] as? [String: Any] ?? [:])
        case 429: self = .rateLimited
        case 503: self = .serviceUnavailable
        default: self = .serverError
        }
    }
}
```

---

## 8. 変更の優先順位

| 優先度 | ファイル/領域 | 理由 |
|-------|---------------|------|
| 1 | `apps/api/prisma/schema.prisma` + マイグレーション | DB テーブルがないと API/クライアントの新フィールドを保存できない |
| 2 | `services/mobile/profileService.js` | traits/big5/nudge をサーバー保存できるようにするため |
| 3 | `routes/mobile/realtime.js` | セッション開始・終了で context/entitlement を返し、クライアントの動作を整合 |
| 4 | `AppState.swift` / `UserProfile.swift` | クライアント状態の土台を拡張し、同期ペイロードを更新 |
| 5 | `VoiceSessionController.swift` | Realtime context/EMA 連携と sticky/nudge 反映 |
| 6 | `OnboardingStep` + 新規 Onboarding Views | traits 取得の入口を作らないとプロファイルが埋まらない |
| 7 | `ProfileView` / `TraitsDetailView` ほか UI | 編集・表示パスを提供するため |
| 8 | `Info.plist` | センサー・権限が無いとリリース不可 |

実装手順（依存順）

1) Prisma/DB（schema.prisma + GIN raw SQL）

2) profileService: traits/big5/nudgeIntensity/stickyMode 保存/取得

3) realtime: /session で context_snapshot/entitlement を返却

4) iOS AppState/Onboarding: enum値シフト対応（旧RawValueを新値にマップ）

5) VoiceSessionController: context送信・EMA受信

6) Sensors/Notifications: デバイス監視・再登録処理


