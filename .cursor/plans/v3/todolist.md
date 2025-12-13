# Anicca v0.3 実装 TODO リスト

## 概要
- 総タスク数: 38
- 推定実装期間: 4週間
- 依存関係グラフ: 下記参照

## フェーズ 1: 基盤（DB / 環境設定）

### 1.1 Prisma新規モデル定義
- **対象ファイル**: `apps/api/prisma/schema.prisma`
- **依存**: なし
- **概要**: `user_traits/daily_metrics/nudge_events/nudge_outcomes/feeling_sessions/habit_logs/bandit_models` を追加し既存テーブルもPrisma化。
- **詳細仕様**: `tech-db-schema-v3.md` セクション4,3,10.1
- **疑似パッチ**: (後で追加)

### 1.2 JSONB GINインデックス用raw SQL追記
- **対象ファイル**: `apps/api/prisma/migrations/*/migration.sql`
- **依存**: 1.1
- **概要**: `state/shortTerm/mindSummary` 等に `jsonb_path_ops` GIN を追加。
- **詳細仕様**: `tech-db-schema-v3.md` セクション5,10.2
- **疑似パッチ**: (後で追加)

### 1.3 環境変数MEM0追加と削除リスト反映
- **対象ファイル**: `apps/api/src/config/environment.js`
- **依存**: なし
- **概要**: `MEM0_API_KEY` を追加し Moss/Exa を非使用に明記。
- **詳細仕様**: `v3-stack.md` セクション12.2-12.3
- **疑似パッチ**: (後で追加)

### 1.4 UUID移行/バックフィル計画のマイグレーションメモ
- **対象ファイル**: `docs/migrations/uuid-plan.md` (新規)
- **依存**: 1.1
- **概要**: text `user_id` から `profile_id uuid` への二重書き込み手順を文書化。
- **詳細仕様**: `tech-db-schema-v3.md` セクション10.1
- **疑似パッチ**: (後で追加)

## フェーズ 2: API エンドポイント

### 2.1 mem0クライアントラッパ追加
- **対象ファイル**: `apps/api/src/modules/memory/mem0Client.ts`
- **依存**: 1.3
- **概要**: mem0 Node SDK の初期化と profile/behavior/interaction/nudge_meta の CRUD をまとめる。
- **詳細仕様**: `v3-stack.md` セクション4.1, `tech-db-schema-v3.md` セクション6
- **疑似パッチ**: (後で追加)

### 2.2 traits/big5/nudge保存対応
- **対象ファイル**: `apps/api/src/services/mobile/profileService.js`
- **依存**: 1.1, 2.1
- **概要**: `user_traits` 読み書き・旧 `idealTraits/problems` バックフィル・nudgeIntensity/stickyMode 更新。
- **詳細仕様**: `migration-patch-v3.md` セクション2.2, `tech-db-schema-v3.md` セクション3
- **疑似パッチ**: (後で追加)

### 2.3 realtime context_snapshot拡張
- **対象ファイル**: `apps/api/src/routes/mobile/realtime.js`
- **依存**: 2.1, 2.2
- **概要**: `/session` レスポンスに `context_snapshot` + entitlement を含め、`/session/stop` も同返却。
- **詳細仕様**: `migration-patch-v3.md` セクション2.1
- **疑似パッチ**: (後で追加)

### 2.4 BehaviorサマリAPI新設
- **対象ファイル**: `apps/api/src/routes/mobile/behavior.js`
- **依存**: 1.1, 2.7
- **概要**: `GET /behavior/summary` 実装（todayInsight/highlights/futureScenario/timeline）。
- **詳細仕様**: `migration-patch-v3.md` セクション6.1
- **疑似パッチ**: (後で追加)

### 2.5 Feeling EMI API
- **対象ファイル**: `apps/api/src/routes/mobile/feeling.js`
- **依存**: 1.1, 2.9
- **概要**: `POST /feeling/start`/`end` で feeling_sessions 保存・EMA reward 反映。
- **詳細仕様**: `migration-patch-v3.md` セクション6.2-6.3
- **疑似パッチ**: (後で追加)

### 2.6 Nudge trigger/feedback API
- **対象ファイル**: `apps/api/src/routes/mobile/nudge.js`
- **依存**: 1.1, 2.7, 2.9
- **概要**: `POST /nudge/trigger` で DP state→policy、`/nudge/feedback` で outcome 記録。
- **詳細仕様**: `migration-patch-v3.md` セクション6.4-6.5
- **疑似パッチ**: (後で追加)

### 2.7 metrics state builder
- **対象ファイル**: `apps/api/src/modules/metrics/stateBuilder.ts`
- **依存**: 1.1
- **概要**: `daily_metrics` から timeline/highlights/TodaysInsight 素材を生成。
- **詳細仕様**: `v3-stack.md` セクション6.1, `tech-db-schema-v3.md` セクション6
- **疑似パッチ**: (後で追加)

### 2.8 未来シナリオ生成モジュール
- **対象ファイル**: `apps/api/src/modules/simulation/futureScenario.ts`
- **依存**: 2.7
- **概要**: 1/5/10年シナリオ生成の LLM ラッパとプロンプト定義。
- **詳細仕様**: `v3-stack.md` セクション6.2
- **疑似パッチ**: (後で追加)

### 2.9 LinTS/ポリシー実装
- **対象ファイル**: `apps/api/src/modules/nudge/policy/{linTS.ts,wakeBandit.ts,mentalBandit.ts}`
- **依存**: 1.1, 2.7
- **概要**: LinTS 本体と wake/mental 用 policy を実装、featureOrderHash 検証を入れる。
- **詳細仕様**: `v3-stack.md` セクション10, `tech-bandit-v3.md` 参照, `file-structure-v3.md` 2.1
- **疑似パッチ**: (後で追加)

### 2.10 Nudge state/rewardビルダー
- **対象ファイル**: `apps/api/src/modules/nudge/features/stateBuilder.ts`, `apps/api/src/modules/nudge/reward/rewardCalculator.ts`
- **依存**: 1.1, 2.9
- **概要**: DP別特徴量生成と SNS/睡眠/座位/mental reward 判定を共通化。
- **詳細仕様**: `v3-stack.md` セクション5.2-5.3, `tech-state-builder-v3.md`
- **疑似パッチ**: (後で追加)

### 2.11 Realtime tool結果整形
- **対象ファイル**: `apps/api/src/services/openaiRealtimeService.js`
- **依存**: 2.3
- **概要**: `get_context_snapshot`/tool返却の JSON 形とエラー整形を更新。
- **詳細仕様**: `v3-stack.md` セクション2.1,3.2.1
- **疑似パッチ**: (後で追加)

### 2.12 entitlement返却拡張
- **対象ファイル**: `apps/api/src/services/subscriptionStore.js`
- **依存**: 1.1
- **概要**: `monthly_usage_limit/remaining/count` をレスポンスへ追加。
- **詳細仕様**: `migration-patch-v3.md` セクション2.3,8
- **疑似パッチ**: (後で追加)

### 2.13 ルーター登録整理
- **対象ファイル**: `apps/api/src/routes/mobile/index.js`
- **依存**: 2.4-2.6
- **概要**: behavior/feeling/nudge ルートをモジュール登録。
- **詳細仕様**: `file-structure-v3.md` セクション2.1
- **疑似パッチ**: (後で追加)

## フェーズ 3: iOS 基盤（AppState / Models）

### 3.1 UserProfile拡張
- **対象ファイル**: `aniccaios/aniccaios/Models/UserProfile.swift`
- **依存**: 2.2
- **概要**: `ideals/struggles/big5/keywords/summary/nudgeIntensity/stickyMode` 追加と後方互換。
- **詳細仕様**: `migration-patch-v3.md` セクション1.3
- **疑似パッチ**: (後で追加)

### 3.2 AppState同期項目拡張
- **対象ファイル**: `aniccaios/aniccaios/AppState.swift`
- **依存**: 3.1
- **概要**: 新フィールドの保存/同期・profileSyncPayload 更新・traitsアップデートメソッド追加。
- **詳細仕様**: `migration-patch-v3.md` セクション1.1
- **疑似パッチ**: (後で追加)

### 3.3 OnboardingStep値シフト対応
- **対象ファイル**: `aniccaios/aniccaios/Onboarding/OnboardingStep.swift`
- **依存**: 3.2
- **概要**: `.ideals/.struggles/.value` 追加と旧RawValueからのマイグレーション。
- **詳細仕様**: `migration-patch-v3.md` セクション1.4
- **疑似パッチ**: (後で追加)

### 3.4 NetworkSessionManagerエラー整形拡張
- **対象ファイル**: `aniccaios/aniccaios/Services/NetworkSessionManager.swift`
- **依存**: 2.11
- **概要**: 共通エラーコードマップ（quotaExceeded等）を `AniccaAPIError` に合わせる。
- **詳細仕様**: `migration-patch-v3.md` セクション7.3
- **疑似パッチ**: (後で追加)

### 3.5 QuoteProviderサービス追加
- **対象ファイル**: `aniccaios/aniccaios/Services/QuoteProvider.swift`
- **依存**: なし
- **概要**: 固定30 Quote を日替わりで返すシンプルロジックを追加。
- **詳細仕様**: `file-structure-v3.md` セクション1.2, `quotes-v3.md`
- **疑似パッチ**: (後で追加)

### 3.6 MainTabView 3タブ化
- **対象ファイル**: `aniccaios/aniccaios/MainTabView.swift`
- **依存**: 3.2, 3.5
- **概要**: 既存タブ構成を Talk / Behavior / Profile の3タブに整理し、`ContentView` からのルートをこの3タブ構成に揃える。
- **詳細仕様**: `file-structure-v3.md` セクション1.1, `v3-ui.md` メインタブ
- **疑似パッチ**: (後で追加)

### 3.7 SubscriptionInfo entitlement拡張
- **対象ファイル**: `aniccaios/aniccaios/Models/SubscriptionInfo.swift`
- **依存**: 2.12
- **概要**: `subscriptionStore.js` が返す `monthly_usage_limit/remaining/count` を `SubscriptionInfo` に追加し、`AppState.subscriptionInfo` と UI で残量と上限を正しく表示できるようにする。
- **詳細仕様**: `migration-patch-v3.md` セクション2.3, 8
- **疑似パッチ**: (後で追加)

## フェーズ 4: iOS UI（Onboarding）

### 4.1 Ideals/Struggles/Value 画面追加
- **対象ファイル**: `aniccaios/aniccaios/Views/Onboarding/{IdealsView.swift,StrugglesView.swift,ValueView.swift}`
- **依存**: 3.3
- **概要**: タグ選択と3ユースケース表示、選択結果を AppState に保存。
- **詳細仕様**: `migration-patch-v3.md` セクション1.4, `v3-ui.md` Onboarding
- **疑似パッチ**: (後で追加)

### 4.2 既存権限/SignIn文言更新
- **対象ファイル**: `aniccaios/aniccaios/Views/Onboarding/{SignInView.swift,MicPermissionView.swift,NotificationPermissionView.swift,WelcomeView.swift}`
- **依存**: 4.1
- **概要**: v3 コピー反映と Skip/Continue 整理。
- **詳細仕様**: `migration-patch-v3.md` セクション1.4, `v3-ui.md`
- **疑似パッチ**: (後で追加)

### 4.3 Onboardingフロー配線
- **対象ファイル**: `aniccaios/aniccaios/ContentView.swift`
- **依存**: 4.1, 4.2
- **概要**: 新ステップ順 `.welcome→ideals→struggles→value→account→microphone→notifications→habitSetup...` へ変更。
- **詳細仕様**: `migration-patch-v3.md` セクション1.4
- **疑似パッチ**: (後で追加)

## フェーズ 5: iOS UI（Talk / Session）

### 5.1 TalkView/FeelingCard構築
- **対象ファイル**: `aniccaios/aniccaios/Views/Talk/{TalkView.swift,FeelingCard.swift}`
- **依存**: 3.2, 3.5
- **概要**: Feeling3動的+Something else固定カード、タップで SessionView 起動。
- **詳細仕様**: `v3-stack.md` セクション2.2.1, `file-structure-v3.md` 1.2
- **疑似パッチ**: (後で追加)

### 5.2 QuoteCard連携
- **対象ファイル**: `aniccaios/aniccaios/Views/Talk/QuoteCard.swift`
- **依存**: 3.5
- **概要**: QuoteProvider から日替わり取得し TalkView に表示。
- **詳細仕様**: `file-structure-v3.md` セクション1.2, `quotes-v3.md`
- **疑似パッチ**: (後で追加)

### 5.3 SessionView/Orb/EMA UI
- **対象ファイル**: `aniccaios/aniccaios/Views/Session/{SessionView.swift,OrbView.swift,EMAModal.swift}`
- **依存**: 5.1
- **概要**: 青オーブRMS連動・状態表示・終了ボタン・EMA Yes/No モーダルを実装。
- **詳細仕様**: `v3-stack.md` セクション2.2.3, `file-structure-v3.md` 1.2
- **疑似パッチ**: (後で追加)

### 5.4 VoiceSessionController拡張
- **対象ファイル**: `aniccaios/aniccaios/VoiceSessionController.swift`
- **依存**: 5.3, 2.3
- **概要**: `context` 送信・EMA 受信・sticky/nudgeIntensity 反映・entitlement/context_snapshot 保存。
- **詳細仕様**: `migration-patch-v3.md` セクション1.2
- **疑似パッチ**: (後で追加)

### 5.5 Realtimeプロンプト/ツール定義更新
- **対象ファイル**: `aniccaios/aniccaios/Resources/Prompts/*`
- **依存**: 2.3, 2.11
- **概要**: tool schema（get_context_snapshot/choose_nudge/log_nudge/get_behavior_summary）を最新に揃える。
- **詳細仕様**: `v3-stack.md` セクション3.2.1, `prompts-v3.md`
- **疑似パッチ**: (後で追加)

## フェーズ 6: iOS UI（Behavior / Profile）

### 6.1 BehaviorViewデータ接続
- **対象ファイル**: `aniccaios/aniccaios/Views/Behavior/BehaviorView.swift`
- **依存**: 2.4, 3.4
- **概要**: `/behavior/summary` 取得し Today’s Insights/未来/タイムラインを描画。
- **詳細仕様**: `v3-stack.md` セクション2.2.2, `migration-patch-v3.md` セクション6.1
- **疑似パッチ**: (後で追加)

### 6.2 TimelineView実装
- **対象ファイル**: `aniccaios/aniccaios/Views/Behavior/TimelineView.swift`
- **依存**: 6.1
- **概要**: sleep/scroll/focus/activity 帯状表示をタイムラインで描画。
- **詳細仕様**: `file-structure-v3.md` セクション1.2, `v3-ui.md`
- **疑似パッチ**: (後で追加)

### 6.3 HighlightsCard実装
- **対象ファイル**: `aniccaios/aniccaios/Views/Behavior/HighlightsCard.swift`
- **依存**: 6.1
- **概要**: wake/screen/workout/rumination のステータス＋芽バッジを表示。
- **詳細仕様**: `file-structure-v3.md` セクション1.2, `v3-ui.md`
- **疑似パッチ**: (後で追加)

### 6.4 FutureScenarioView実装
- **対象ファイル**: `aniccaios/aniccaios/Views/Behavior/FutureScenarioView.swift`
- **依存**: 6.1
- **概要**: 10年後テキスト表示（1/5年は非表示）。
- **詳細仕様**: `file-structure-v3.md` セクション1.2, `v3-stack.md` セクション6.2
- **疑似パッチ**: (後で追加)

### 6.5 ProfileView拡張
- **対象ファイル**: `aniccaios/aniccaios/Views/Profile/ProfileView.swift`
- **依存**: 3.2, 2.2
- **概要**: ideals/struggles/nudgeIntensity/stickyMode/DataIntegrationトグル編集を追加。
- **詳細仕様**: `migration-patch-v3.md` セクション1.5,2.4
- **疑似パッチ**: (後で追加)

### 6.6 TraitsDetailView追加
- **対象ファイル**: `aniccaios/aniccaios/Views/Profile/TraitsDetailView.swift`
- **依存**: 6.5
- **概要**: Big5レーダーと説明文を表示、override を AppState 経由で反映。
- **詳細仕様**: `file-structure-v3.md` セクション1.2, `v3-stack.md` セクション11
- **疑似パッチ**: (後で追加)

### 6.7 SettingsViewデータ連携
- **対象ファイル**: `aniccaios/aniccaios/Settings/SettingsView.swift`
- **依存**: 7.1-7.3
- **概要**: ScreenTime/HealthKit/Motion トグルと連携状態表示。
- **詳細仕様**: `file-structure-v3.md` セクション1.2, `ios-sensors-spec-v3.md`
- **疑似パッチ**: (後で追加)

## フェーズ 7: センサー連携

### 7.1 DeviceActivityMonitor実装
- **対象ファイル**: `aniccaios/aniccaios/Sensors/DeviceActivityMonitor.swift`
- **依存**: 3.4
- **概要**: SNS/Video カテゴリの連続使用監視としきい値超過イベント生成。
- **詳細仕様**: `v3-stack.md` セクション2.3, `ios-sensors-spec-v3.md`
- **疑似パッチ**: (後で追加)

### 7.2 HealthKitManager実装
- **対象ファイル**: `aniccaios/aniccaios/Sensors/HealthKitManager.swift`
- **依存**: 3.4
- **概要**: 睡眠/歩数の前日集計を取得しローカル保持。
- **詳細仕様**: `v3-stack.md` セクション2.3, `ios-sensors-spec-v3.md`
- **疑似パッチ**: (後で追加)

### 7.3 MotionManager実装
- **対象ファイル**: `aniccaios/aniccaios/Sensors/MotionManager.swift`
- **依存**: 3.4
- **概要**: 座位2h検知・アクティビティ状態のフックを提供。
- **詳細仕様**: `v3-stack.md` セクション2.3, `ios-sensors-spec-v3.md`
- **疑似パッチ**: (後で追加)

### 7.4 MetricsUploader日次送信
- **対象ファイル**: `aniccaios/aniccaios/Services/MetricsUploader.swift`
- **依存**: 7.1-7.3, 2.4
- **概要**: ScreenTime/睡眠/歩数/座位を日次で `/behavior/summary` 用集計として送信。
- **詳細仕様**: `file-structure-v3.md` セクション1.2, `tech-db-schema-v3.md` セクション6
- **疑似パッチ**: (後で追加)

### 7.5 権限状態の AppState 反映
- **対象ファイル**: `aniccaios/aniccaios/AppState.swift`
- **依存**: 7.1-7.3
- **概要**: ScreenTime/HealthKit/Motion 許可フラグを永続化し UI へ露出。
- **詳細仕様**: `v3-stack.md` セクション14.5, `ios-sensors-spec-v3.md`
- **疑似パッチ**: (後で追加)

## フェーズ 8: Nudge システム

### 8.1 NudgeTriggerService実装
- **対象ファイル**: `aniccaios/aniccaios/Services/NudgeTriggerService.swift`
- **依存**: 7.1-7.3, 2.6
- **概要**: DP検知（SNS30/60, sleep前, sedentary2h, morning phone）で `/nudge/trigger` を送信。
- **詳細仕様**: `v3-stack.md` セクション5.2, `tech-nudge-scheduling-v3.md`
- **疑似パッチ**: (後で追加)

### 8.2 NotificationSchedulerフォローアップ拡張
- **対象ファイル**: `aniccaios/aniccaios/Notifications/NotificationScheduler.swift`
- **依存**: 8.1
- **概要**: Nudgeカテゴリ/フォローアップ通知の登録と nudgeIntensity に応じた頻度調整。
- **詳細仕様**: `migration-patch-v3.md` セクション1.5, `tech-nudge-scheduling-v3.md`
- **疑似パッチ**: (後で追加)

### 8.3 AlarmKitHabitCoordinator起床DP連携
- **対象ファイル**: `aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift`
- **依存**: 8.1
- **概要**: 起床検知→DPイベント送信と Session 起動遷移のフック。
- **詳細仕様**: `file-structure-v3.md` セクション1.2, `v3-stack.md` セクション5.2.1
- **疑似パッチ**: (後で追加)

### 8.4 Nudge結果フィードバック取得
- **対象ファイル**: `aniccaios/aniccaios/Services/NudgeTriggerService.swift`
- **依存**: 8.1
- **概要**: 通知開封やスクリーン閉鎖時間を収集し `/nudge/feedback` へ送信。
- **詳細仕様**: `migration-patch-v3.md` セクション6.5, `tech-nudge-scheduling-v3.md`
- **疑似パッチ**: (後で追加)

### 8.5 Talk Feeling bandit連携
- **対象ファイル**: `aniccaios/aniccaios/VoiceSessionController.swift`
- **依存**: 5.4, 2.5
- **概要**: Feeling開始/終了で bandit state/EMA をサーバーへ送信し context_snapshot に反映。
- **詳細仕様**: `v3-stack.md` セクション10, `tech-bandit-v3.md`
- **疑似パッチ**: (後で追加)

## フェーズ 9: 統合テスト / 仕上げ

### 9.1 Info.plist 権限文言更新
- **対象ファイル**: `aniccaios/aniccaios/Info.plist`
- **依存**: 7.1-7.3
- **概要**: Health/Motion/FamilyControls/マイク/通知の目的文言をv3仕様に更新。
- **詳細仕様**: `migration-patch-v3.md` セクション4
- **疑似パッチ**: (後で追加)

### 9.2 手動動作確認チェックリスト作成
- **対象ファイル**: `docs/checklists/v0.3-manual-test.md` (新規)
- **依存**: 全フェーズ
- **概要**: Talk→EMA、Behavior取得、ScreenTime/Sleep/Motion DP送信、Nudge通知までの手動検証項目を列挙。
- **詳細仕様**: `v3-stack.md` セクション9, `tech-ema-v3.md`
- **疑似パッチ**: (後で追加)

### 9.3 Fallback/未許可UX文言確認
- **対象ファイル**: `aniccaios/aniccaios/Views/Settings/SettingsView.swift`
- **依存**: 7.5
- **概要**: センサー未許可時の案内コピーを表示し Talk/Feeling 継続可を明示。
- **詳細仕様**: `v3-stack.md` セクション14.5
- **疑似パッチ**: (後で追加)

### 9.4 Wakeサイレント説明モーダル
- **対象ファイル**: `aniccaios/aniccaios/Views/Behavior/BehaviorView.swift` もしくは 起床DP処理に近い専用View
- **依存**: 8.3, 7.1
- **概要**: 起床DPを初めて有効化するタイミングで一度だけ、「サイレントモード中はアラームが鳴らない可能性がある」旨を説明する Just-in-time モーダルを表示し、了承後は `hasSeenWakeSilentTip` を AppState に記録する。
- **詳細仕様**: `v3-ui.md` セクション「Wake Silent 説明モーダル」
- **疑似パッチ**: (後で追加)

## 依存関係図

フェーズ1 ─→ フェーズ2 ─→ フェーズ3 ─┬→ フェーズ4
                                    ├→ フェーズ5
                                    └→ フェーズ6
フェーズ3 ─→ フェーズ7 ─→ フェーズ8
全フェーズ ─→ フェーズ9

