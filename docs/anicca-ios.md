# Anicca iOS 現行仕様ドキュメント

## 1. コンセプトとアプリ構成
- **プロダクト名**: Anicca iOS
- **タグライン**: 声で目覚め、声で整える24時間伴走コーチ
- **ビジョン**: 音声対話を通じて生活リズムと習慣を整え、最終的に自律状態へ導く
- **主要コンポーネント**
  - `AppState`: 認証・プロフィール・習慣スケジュール・オンボーディング進捗・通知トリガーなどアプリ全体の状態を単一インスタンスで管理
  - `NotificationScheduler`: 習慣別に通知と再通知を登録・解除するスケジューラ
  - `VoiceSessionController`: OpenAI Realtime API への WebRTC 接続と音声セッション維持を制御
  - `AudioSessionCoordinator`: AVAudioSession 設定を一元管理し、リアルタイム音声向けに最適化
  - `ProfileSyncService`: プロフィール更新をバックエンドと同期
  - `AuthCoordinator`: Sign in with Apple フローとバックエンド検証を仲介
  - UI レイヤー: SwiftUI でオンボーディング・セッション・設定画面を構成

## 2. ユーザーフロー概要
1. **初回起動**
   - `AppState` が UserDefaults から既存情報を読み込み、オンボーディング未完了なら `OnboardingFlowView` に遷移。
2. **オンボーディング**
   - ステップ構成: Welcome → Microphone 許可 → Notifications 許可 → Sign in with Apple → プロフィール入力 → 習慣選択・時刻設定 → 必要に応じフォローアップ質問 → Completion。
   - `OnboardingStep` を用いて画面を切り替え、進捗は `AppState.setOnboardingStep` で永続化。
   - 選択習慣に応じて起床/就寝場所やトレーニング重点などのフォローアップを自動挿入。
3. **サインイン後**
   - `SessionView` を表示。音声セッション開始/終了ボタンと、起床習慣設定済みの場合の注意文を提供。
   - `VoiceSessionController` が音声セッションの開始・終了を担当。
4. **設定画面**
   - `SettingsView` でプロフィール（名前・言語・睡眠場所・トレーニング重点）と習慣スケジュールを編集。
   - Sign out ボタンで `AuthCoordinator.signOut` → `AppState.resetState` を実行。
5. **バックグラウンド動作**
   - 通知アクションから音声セッションを即時開始、再通知の停止が可能。
   - VOIP トリガーや AppIntent（iOS 26 以降）からも音声セッションを直接開始。

## 3. アプリ状態管理 (`AppState`)
- シングルトン `AppState.shared` が以下を Publish:
  - `authStatus`: `signedOut` / `signingIn` / `signedIn(UserCredentials)`
  - `userProfile`: 表示名・言語・睡眠場所・トレーニング重点
  - `habitSchedules`: `HabitType` ごとの `DateComponents`
  - `isOnboardingComplete`, `onboardingStep`, `pendingHabitTrigger`, `pendingHabitFollowUps`
- 永続化キー:
  - `com.anicca.userCredentials`, `com.anicca.userProfile`, `com.anicca.habitSchedules`, `com.anicca.onboardingComplete`, `com.anicca.onboardingStep`
- 主なメソッド:
  - `updateHabits` / `updateHabit`: サインイン済みであれば習慣時刻を保存し、`NotificationScheduler.applySchedules` を呼び出す。
  - `prepareForImmediateSession` / `handleHabitTrigger`: `HabitPromptBuilder` でプロンプトを生成し、セッション開始要求フラグを設定。
  - `consumePendingPrompt` / `clearPendingHabitTrigger`: 通知または VOIP トリガー後のセッション状態を管理。
  - `updateUserCredentials`, `updateUserProfile`: 永続化し、必要に応じ `ProfileSyncService` に同期を依頼。
  - `prepareHabitFollowUps` / `consumeNextHabitFollowUp`: 習慣詳細質問を順次処理。
  - `getNextHabitSchedule`: 次回予定の習慣とメッセージを算出し、Completion 画面で表示。

## 4. 認証フロー
- `AuthenticationStepView` に Sign in with Apple ボタンを表示。タップで `AuthCoordinator.configure` が nonce を設定し ASAuthorizationController を実行。
- 認証成功時:
  - `AuthCoordinator.handleAuthorization` が ID トークンと nonce を取得。
  - `AuthCoordinator.verifyWithBackend` が `AppConfig.appleAuthURL`（`proxyBaseURL/appendingPathComponent("auth/apple")`）へ POST。ペイロード: `identity_token`, `nonce`, `user_id`。
  - レスポンスの `userId` で `AppState.updateUserCredentials` を更新。
- 失敗時は `authStatus` を `signedOut` に戻す。
- サインアウトは `AuthCoordinator.signOut` → `AppState.clearUserCredentials` + `resetState`。

## 5. プロフィールと同期
- オンボーディング/設定で入力したプロフィールは `AppState.updateUserProfile` で保存。
- `ProfileSyncService.enqueue` がサインイン状態を確認し、`AppConfig.profileSyncURL`（`proxyBaseURL/appendingPathComponent("mobile/profile")`）へ PUT。
  - ヘッダー: `device-id`（`UIDevice.identifierForVendor`）と `user-id`。
  - ボディ: `displayName`, `preferredLanguage`, `sleepLocation`, `trainingFocus`。
  - 成功するまでキューで保持し、失敗時は再試行可能。

## 6. 習慣設定と通知
- 対応習慣: `wake`, `training`, `bedtime`。
- オンボーディング・設定画面で習慣を有効化し、時刻を指定。
- `NotificationScheduler.applySchedules`:
  - 既存通知（`HABIT_` プレフィックス）を削除。
  - メイン通知: `UNCalendarNotificationTrigger`（毎日指定時刻）を登録。
  - フォローアップ: 60 秒間隔で最大 10 件の再通知を追加。
  - 通知カテゴリ `HABIT_ALARM` を登録（アクション: 今すぐ対話、止める）。
  - サウンド `AniccaWake.caf` を同梱。存在しない場合は `UNNotificationSound.default` にフォールバック。
- 通知アクション処理 (`AppDelegate.userNotificationCenter`):
  - `START_CONVERSATION` またはデフォルトタップでフォローアップを解除し、音声セッションを即時準備。
  - `DISMISS_ALL` でフォローアップ通知を削除。

## 7. 音声セッション (OpenAI Realtime)
- `SessionView` のボタンまたは通知経由で `VoiceSessionController.start` を呼び出し、接続を開始。
- 手順:
  1. `obtainClientSecret`: サインイン済みを確認し、`AppConfig.realtimeSessionURL`（`proxyBaseURL/appendingPathComponent("mobile/realtime/session")`）へ GET。ヘッダーに `device-id` と `user-id` を付与し、`client_secret` を取得。
  2. `AudioSessionCoordinator.configureForRealtime`: `.playAndRecord` カテゴリ、`.videoChat` モード、Bluetooth 対応、スピーカー出力などを設定。
  3. `setupPeerConnection` / `setupLocalAudio`: Google WebRTC で `RTCPeerConnection` と音声トラックを構築。
  4. `negotiateWebRTC`: SDP offer を生成し、`https://api.openai.com/v1/realtime?model=gpt-realtime` へ POST（Authorization: Bearer `client_secret`）。応答 SDP を設定。
  5. `sendSessionUpdate`: DataChannel `oai-events` に `session.update` を送信。`AppState.consumePendingPrompt` が指示文を返した場合は `instructions` に設定し、`response.create` を送信。
- 接続状態 (`ConnectionState`) により UI ボタン表示を制御。
- `stop` で接続破棄・AudioSession 解除。

## 8. プロンプト生成
- `HabitPromptBuilder` が `Resources/Prompts/common.txt` と習慣別ファイル（`wake_up`, `training`, `bedtime`）を読み込み。
- プレースホルダー `${USER_NAME}`, `${LANGUAGE_LINE}`, `${TASK_TIME}`, `${TASK_DESCRIPTION}`, `${SLEEP_LOCATION}`, `${TRAINING_FOCUS_LIST}` をプロフィール・習慣時刻で置換。
- テンプレートが空の場合は言語別フォールバックメッセージを返す。

## 9. オンボーディング各ステップ
- `WelcomeStepView`: タイトル・サブタイトル表示、CTA ボタンで進行。
- `MicrophonePermissionStepView`: AVAudio(17.0 以降) / AVAudioSession でマイク許可を要求。許可済みなら自動遷移。
- `NotificationPermissionStepView`: `NotificationScheduler` 経由で通知設定を確認・要求。許可済みなら自動遷移。
- `AuthenticationStepView`: Sign in with Apple を実行し、進捗インジケータを表示。
- `ProfileInfoStepView`: 表示名入力。既存値が "User" または空の場合は未入力扱い。
- `HabitSetupStepView`: 習慣カードを一覧表示し、選択と時刻設定を行う。保存時に `AppState.updateHabits` とフォローアップ準備を実行。
- `HabitWakeLocationStepView` / `HabitSleepLocationStepView`: 起床・就寝場所を入力。重複しないよう条件分岐。
- `HabitTrainingFocusStepView`: 事前定義の選択肢から 1 つ選択。
- `CompletionStepView`: 次回習慣の予定を表示し、完了ボタンで `AppState.markOnboardingComplete`。

## 10. 設定画面 (`SettingsView`)
- `NavigationView` 内でプロフィールと習慣スケジュールを編集。
- 言語は日本語/English のセグメントで切り替え。
- トレーニング重点はメニューから単一選択。空文字なら未設定。
- 保存処理:
  - `AppState.updateHabits` で有効な習慣と時刻を更新。
  - `AppState.updateUserProfile` でプロフィールをアップデートし、同期処理をキューへ投入。
  - 画面を閉じる。
- サインアウトは即座に画面を閉じ、アプリ状態を初期化。

## 11. ローカライゼーション
- 文言は `Resources/ja.lproj/Localizable.strings` と `Resources/en.lproj/Localizable.strings` で管理。
- `AuthRequiredPlaceholderView` など一部英語固定文言は未ローカライズ。

## 12. AppIntent（iOS 26 以降）
- `StartConversationIntent`（AlarmKit が利用可能な場合のみビルド）。
- `habitType` パラメータを `HabitType` に変換し、`AudioSessionCoordinator.configureForRealtime` → `AppState.prepareForImmediateSession` で音声セッションを準備。

## 13. 開発用オプション
- `AppDelegate.application(_:didFinishLaunchingWithOptions:)` で `-resetOnLaunch` 引数が存在すれば UserDefaults をクリアし、`AppState.resetState` を実行。
- 起動時に `ANICCA_PROXY_BASE_URL` をログ出力（Info.plist に必須）。

## 14. 既知の制約・備考
- `AppState.updateHabit(s)` は `authStatus` が `signedIn` の場合のみ有効。サインアウト時の操作は無視される。
- Realtime 接続は回線状況と OpenAI API 応答に依存し、失敗時は `stop` で自動リセット。
- 通知フォローアップは固定で 10 件・60 秒間隔。運用で調整する場合は `NotificationScheduler.scheduleFollowups` の `count` と `intervalSeconds` を変更。
- `AuthRequiredPlaceholderView` は英語文言のまま。プロダクションで表示されるケースは限定的だが、日本語化の検討余地あり。
