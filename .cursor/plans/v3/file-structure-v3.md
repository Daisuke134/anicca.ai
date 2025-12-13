# file-structure-v3.md

## 1. iOS アプリ（aniccaios）

### 1.1 ディレクトリツリー（v0.3 追加・変更点を明示）

```
aniccaios/
├── aniccaios/
│   ├── AppState.swift                      # [修正] ideals/struggles・big5・nudgeIntensity追加
│   ├── MainTabView.swift                   # [修正] Talk/Behavior/Profile 3タブに整理
│   ├── AppDelegate.swift                   # [修正] Notification/AlarmKit連携
│   ├── ContentView.swift                   # [修正] v3オンボーディングエントリ調整
│   ├── VoiceSessionController.swift        # [修正] Realtime状態/EMAハンドリング
│   ├── SessionView.swift                   # [再配置/修正] Session/ 配下に移しEMI対応
│   ├── Views/
│   │   ├── Talk/
│   │   │   ├── TalkView.swift              # [新規] Feelingカード＋Quote表示
│   │   │   ├── FeelingCard.swift           # [新規] 感情カードUI
│   │   │   └── QuoteCard.swift             # [新規] 今日の一言
│   │   ├── Session/
│   │   │   ├── SessionView.swift           # [修正] 青オーブ＋EMAモーダル
│   │   │   ├── OrbView.swift               # [新規] RMS連動オーブ
│   │   │   └── EMAModal.swift              # [新規] 「楽になった？」YES/NO
│   │   ├── Behavior/
│   │   │   ├── BehaviorView.swift          # [新規] Today’s Insights＋ハイライト
│   │   │   ├── TimelineView.swift          # [新規] 24hタイムライン
│   │   │   ├── HighlightsCard.swift        # [新規] 4ドメイン芽バッジ
│   │   │   └── FutureScenarioView.swift    # [新規] 10年後シナリオ表示
│   │   ├── Profile/
│   │   │   ├── ProfileView.swift           # [新規] Traits/Nudge設定
│   │   │   └── TraitsDetailView.swift      # [新規] Big5 詳細
│   │   └── Onboarding/
│   │       ├── WelcomeView.swift           # [修正] v3コピー反映
│   │       ├── IdealsView.swift            # [新規] 理想タグ
│   │       ├── StrugglesView.swift         # [新規] 苦しみタグ
│   │       ├── ValueView.swift             # [新規] 3ユースケース提示
│   │       ├── SignInView.swift            # [修正] Skip/Continue整理
│   │       ├── MicPermissionView.swift     # [修正] 権限コピー更新
│   │       └── NotificationPermissionView.swift # [修正] 権限コピー更新
│   ├── Sensors/
│   │   ├── DeviceActivityMonitor.swift     # [新規] Screen Time/FamilyControls監視
│   │   ├── HealthKitManager.swift          # [新規] 睡眠/歩数集計
│   │   └── MotionManager.swift             # [新規] 座位/歩行検知
│   ├── Services/
│   │   ├── NudgeTriggerService.swift       # [新規] JITAIイベント組立て送信
│   │   ├── MetricsUploader.swift           # [新規] 日次メトリクス送信
│   │   ├── QuoteProvider.swift             # [新規] 30固定Quoteローテーション
│   │   ├── NetworkSessionManager.swift     # [既存/修正] APIリトライ＋token更新
│   │   └── SubscriptionManager.swift       # [既存/修正] syncNowトリガ整理
│   ├── Notifications/
│   │   ├── NotificationScheduler.swift     # [修正] Nudgeカテゴリ・フォローアップ
│   │   └── AlarmKitHabitCoordinator.swift  # [修正] 起床DP連携
│   ├── Resources/
│   │   ├── Prompts/                        # [新規/追加] Session/Feeling/Nudge用プロンプト
│   │   └── Sounds/                         # [既存] アラーム音
│   ├── Models/
│   │   ├── UserProfile.swift               # [修正] ideals/struggles/big5/nudgeIntensity
│   │   ├── SubscriptionInfo.swift          # [修正] entitlement拡張
│   │   └── CustomHabitConfiguration.swift  # [既存/修正] 優先習慣設定
│   ├── Settings/
│   │   ├── HabitFollowUpView.swift         # [修正] 優先習慣未達フォロー
│   │   └── SettingsView.swift              # [修正] Data Integrationトグル
│   ├── Session/                            # [新規フォルダ] Session UI部品配置
│   ├── DesignSystem/                       # [既存] カラー/ボタン
│   └── Authentication/                     # [既存] Sign in with Apple
```

### 1.2 各ファイルの役割（1行説明）
- `AppState.swift`：認証・traits・習慣・センサー許可状態を集中管理しUserDefaultsへ永続化。
- `MainTabView.swift`：Talk/Behavior/Profile の3タブルーティング。
- `TalkView.swift`：Feelingカード＋Quote表示、カードタップでSession起動。
- `FeelingCard.swift`：感情別カードUIとタップイベント。
- `QuoteCard.swift`：30固定Quoteから日替わり表示。
- `SessionView.swift`：音声セッション画面。オーブ表示・終了ボタン・状態テキスト。
- `OrbView.swift`：AVAudioEngineのRMSに応じてスケールする青オーブ。

- SessionView/OrbView: マイクRMS連動アニメ（平滑化含む）を実装する責務を明記。
- `EMAModal.swift`：終了時の「楽になった？」Yes/No入力。
- `BehaviorView.swift`：Today’s Insights・24hタイムライン・Highlights・未来カードを表示。
- `TimelineView.swift`：睡眠/スクロール/集中/活動の24h帯状タイムライン。
- `HighlightsCard.swift`：Wake/Screen/Workout/Ruminationのステータス＋芽バッジ。
- `FutureScenarioView.swift`：10年後シナリオテキストを表示（1年後/5年後は削除）。
- `ProfileView.swift`：アカウント/Traits/Ideals/Struggles/Nudge強度/Data連携を編集。
- `TraitsDetailView.swift`：Big5スコアと説明表示。
- `WelcomeView.swift`：v3コピーのウェルカム。
- `IdealsView.swift`：理想タグ選択。
- `StrugglesView.swift`：現在の苦しみタグ選択。
- `ValueView.swift`：Aniccaの3ユースケース紹介。
- `SignInView.swift`：Apple認証（Skip可）。
- `MicPermissionView.swift`：マイク権限取得案内。
- `NotificationPermissionView.swift`：通知権限案内。
- `DeviceActivityMonitor.swift`：Screen Timeカテゴリの連続利用監視。
- `HealthKitManager.swift`：睡眠・歩数の読み取りと日次集計。
- `MotionManager.swift`：座位継続/歩行の検出。
- `NudgeTriggerService.swift`：DP検出→/nudge/trigger 送信。
- `MetricsUploader.swift`：`daily_metrics` 向け日次アップロード。
- `QuoteProvider.swift`：固定Quoteの日替わり取得。
- `NotificationScheduler.swift`：Nudge/フォローアップ通知の登録。
- `AlarmKitHabitCoordinator.swift`：起床ナッジとAlarmKitの連携。
- `UserProfile.swift`：ideals/struggles/big5/nudgeIntensity/stickyModeを保持。
- `SubscriptionInfo.swift`：entitlement残量・プラン情報。
- `HabitFollowUpView.swift`：優先習慣未達フォローUI。
- `SettingsView.swift`：Data Integrationトグル（ScreenTime/HealthKit）。
- `Prompts/*`：Session/Feeling/Nudge用プロンプトテンプレート集。テンプレートIDは `domain_purpose_tone` 形式（例: `sns_break_gentle`, `sleep_prep_soft`）で統一し、iOS/サーバー間で共有する。

## 2. バックエンドAPI（apps/api）

### 2.1 ディレクトリツリー（追加/改修）

```
apps/api/
├── src/
│   ├── routes/
│   │   ├── mobile/
│   │   │   ├── realtime.js            # [修正] context_snapshot拡張・session stop返却
│   │   │   ├── behavior.js            # [新規] summary/highlights/future API
│   │   │   ├── feeling.js             # [新規] Feeling EMI start/end
│   │   │   └── nudge.js               # [新規] nudge trigger/feedback
│   │   └── api/                       # [既存] auth/billing等
│   ├── modules/                       # [新規] ドメイン別ロジック
│   │   ├── memory/
│   │   │   └── mem0Client.ts          # [新規] mem0クライアントラッパ
│   │   ├── nudge/
│   │   │   ├── policy/
│   │   │   │   ├── linTS.ts           # [新規] 汎用LinTS実装
│   │   │   │   ├── wakeBandit.ts      # [新規] 起床/就寝ポリシー
│   │   │   │   └── mentalBandit.ts    # [新規] Feeling EMA bandit
│   │   │   ├── features/stateBuilder.ts # [新規] DPごとのstate生成
│   │   │   └── reward/rewardCalculator.ts # [新規] 成功判定/報酬計算
│   │   ├── simulation/
│   │   │   └── futureScenario.ts      # [新規] 10年後シナリオ生成
│   │   └── metrics/
│   │       └── stateBuilder.ts        # [新規] 日次集計→highlights/timeline用state
│   ├── services/
│   │   ├── mobile/
│   │   │   └── profileService.js      # [修正] traits/big5更新対応
│   │   ├── openaiRealtimeService.js   # [修正] context渡しとtool結果整形
│   │   ├── subscriptionStore.js       # [修正] entitlement返却にmonthly_usage
│   │   └── revenuecat/virtualCurrency.js # [修正] v0.3残量計算
│   ├── prisma/
│   │   └── schema.prisma              # [修正] 新7テーブル反映
│   ├── middleware/                    # [既存]
│   ├── config/environment.js          # [修正] MEM0_API_KEY追加
│   └── utils/logger.js                # [既存] 変更なし
```

### 2.2 各ファイルの役割（1行説明）
- `routes/mobile/realtime.js`：client_secret発行・session stop＋context_snapshot返却。
- `routes/mobile/behavior.js`：今日のサマリ/ハイライト/未来シナリオを返す。
- `routes/mobile/feeling.js`：Feeling EMIの開始・終了・EMA受信。
- `routes/mobile/nudge.js`：JITAIトリガ受信、feedbackでreward記録。
- `modules/memory/mem0Client.ts`：mem0への保存/検索の薄いラッパ。
- `modules/nudge/policy/linTS.ts`：LinTSポリシー共通実装。
- `modules/nudge/policy/wakeBandit.ts`：起床/就寝のaction選択。
- `modules/nudge/policy/mentalBandit.ts`：Feeling用EMA bandit。
- `modules/nudge/features/stateBuilder.ts`：各DPの特徴量生成。
- `modules/nudge/reward/rewardCalculator.ts`：ドメイン別成功判定・報酬化。

- bandit/stateBuilder/reward で featureOrderHash を検証し、不一致時は開発環境では起動エラーとし、本番環境では該当ドメインの bandit 機能のみ無効化してルールベース JITAI にフォールバックする旨を1行追記。
- `modules/simulation/futureScenario.ts`：LLMで10年後テキスト生成。
- `modules/metrics/stateBuilder.ts`：daily_metricsからハイライト/タイムラインを作成。
- `services/mobile/profileService.js`：traits/big5/nudge強度のCRUD。
- `services/openaiRealtimeService.js`：Realtime接続補助、tool結果の整形。
- `services/subscriptionStore.js`：entitlement + monthly_usage算出。
- `services/revenuecat/virtualCurrency.js`：VCデビット/付与ロジック。
- `prisma/schema.prisma`：tech-db-schema-v3.mdの新テーブル反映。
- `config/environment.js`：MEM0_API_KEYと上限値を管理。（Moss/Exaはv0.4以降）

## 3. 変更区分まとめ

| 区分 | iOS | API |
|------|-----|-----|
| 新規作成 | 19 ファイル | 13 ファイル |
| 修正 | 17 ファイル | 8 ファイル |
| 再配置/構成整理 | 1 フォルダ (`Session/`) | 1 フォルダ (`modules/`) |
| 削除 | 0 | 0 |

※ 新規/修正数は本ドキュメントに列挙した対象のみの概数。実装時は既存コード差分を再確認し、不要削除は行わない方針。

