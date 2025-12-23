<!-- e333d0a7-b20f-45e1-a036-8dff4dd67810 63ab03a7-c930-4113-9590-b02b76dd1b95 -->
# iOS v3 画面・永続化・Behavior表示の総合修正計画

## いま何が起きているか（現状の原因）

- **Appleサインイン直後にメインへ飛ぶ**: `AppState.applyRemoteProfilePayload` がサーバーから `habitSchedules` を受け取っただけで `isOnboardingComplete=true` を強制しているため、オンボーディング途中でも `ContentRouterView` がメインへ遷移します（オンボーディングの `microphone/notifications/alarmkit` をスキップ）。
- **Ideal Self / Current Struggles がオンボーディングと揃っていない**: `.cursor/plans/v3/screens/profile.html` は新しい項目（例: altruistic/honest/open/courageous, rumination/jealousy/loneliness/irritation）だが、オンボーディングは旧 `ideals.html/struggles.html` の項目（runner/creative…）を使っておりミスマッチ。
- **オンボーディングで選んだIdeal/Strugglesがログイン後に消える**: サーバーGET `/mobile/profile` のデフォルト値（空配列）で `applyRemoteProfilePayload` がローカル値を上書きしてしまう。
- **Nudge Strengthが選べない**: `ProfileView` が `Quiet/Normal/Active` をハードコード表示しており、`UserProfile.nudgeIntensity` と未接続。
- **Sleep/Steps トグルが連動してONになる**: `ProfileView.requestHealthKitAndUpdateToggles()` が許可成功時に `sleepEnabled` と `stepsEnabled` を同時に `true` にしている。さらに `HealthKitManager.requestAuthorization()` が sleep+steps を同時要求するため、許可シートにも両方出る。
- **Behaviorの24-hour timelineが真っ白**: サーバー側の `buildTimeline()` は `daily_metrics.sleep_start_at/wake_at` や `activity_summary.snsSessions` などが必要だが、iOS `MetricsUploader` は `sleep_minutes/steps/screen_time_minutes/sedentary_minutes` しか送っておらず、`sleep_start_at/wake_at` 等が埋まらない。
- **10 years from now が空になることがある**: `apps/api/src/routes/mobile/behavior.js` の例外時フォールバックが `ifContinue/ifImprove` を空文字で返しておりUIが空になる。
- **OS言語が英語でも日本語になることがある**: `aniccaiosApp.swift` が `.environment(\.locale, Locale(identifier: appState.userProfile.preferredLanguage.rawValue))` で OS ロケールを上書きしている。

## 実装方針（項目ごとに“必ず別パッチ”で出します）

### Patch A: 下部タブをスクショ/Behavior.md準拠に固定

- 変更対象: [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/DesignSystem/Components/FigmaTabBar.swift`](aniccaios/aniccaios/DesignSystem/Components/FigmaTabBar.swift), [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/MainTabView.swift`](aniccaios/aniccaios/MainTabView.swift)
- 内容:
- `FigmaTabBar` の `HStack` を「均等割り」ではなく **Figmaの幅（Talk 80 / Behavior 91 / Profile 80）** と **padding/offset** が一致するレイアウトに変更
- `MainTabView` は `ZStack`直置きではなく `.safeAreaInset(edge: .bottom)` で常に底に固定（全タブ共通の安全な実装）

### Patch B: Appleサインイン後でも必ず 3 画面（Mic/Notifications/Alarm）を通す

- 変更対象: [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/AppState.swift`](aniccaios/aniccaios/AppState.swift), [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift`](aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift), [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift`](aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift)
- 内容:
- `applyRemoteProfilePayload` の **オンボーディング強制完了**ロジック（`habitSchedules`があれば `isOnboardingComplete=true`）を削除
- Mic/Notifications 画面の **自動遷移** を廃止し、既に許可済みでも必ず画面は表示し「Continue」操作で次へ（OSダイアログは出ないが“確認画面”は出す）

### Patch C: Allow Alarms で“押したら遷移”ではなく、許可導線を必ず出す

- 変更対象: [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/Onboarding/AlarmKitPermissionStepView.swift`](aniccaios/aniccaios/Onboarding/AlarmKitPermissionStepView.swift)
- 内容:
- iOS 26+ では `AlarmKitHabitCoordinator.requestAuthorizationIfNeeded()` の結果で UI を更新し、失敗時は設定導線（Open Settings）を表示
- iOS 26 未満は **AlarmKitのOS許可自体が存在しない**ため、ここは「通知(音/Time Sensitive)がONになっているか」をチェックし、足りない場合は設定へ誘導するダイアログを表示（= “必ずダイアログを出す”を満たす）
- いずれも **自動で次へ進まない**（ユーザーが次へ）

### Patch D: Profileの Ideal Self / Current Struggles をスクショ（profile.html）に一致させ、オンボーディングとも統一

- 変更対象:
- [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/Views/Profile/ProfileView.swift`](aniccaios/aniccaios/Views/Profile/ProfileView.swift)
- [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/Onboarding/IdealsStepView.swift`](aniccaios/aniccaios/Onboarding/IdealsStepView.swift)
- [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/Onboarding/StrugglesStepView.swift`](aniccaios/aniccaios/Onboarding/StrugglesStepView.swift)
- `Localizable.strings`（必要なら項目追加）
- 内容:
- Ideal: `kind, altruistic, confident, mindful, honest, open, courageous`
- Struggles: `rumination, jealousy, self_criticism, anxiety, loneliness, irritation`
- チップの見た目を profile.html と同じ（selected=黒/白文字、unselected=白/薄ボーダー）に寄せる

### Patch E: オンボーディングで設定した Ideal/Struggles がログイン後に必ず反映される（上書きバグ解消）

- 変更対象: [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/AppState.swift`](aniccaios/aniccaios/AppState.swift)
- 内容:
- `applyRemoteProfilePayload` のマージ戦略を変更し、**リモートが空配列ならローカルの非空を保持**（オンボーディングで選んだ値が消えない）
- サインイン直後に「ローカルプロフィール（オンボーディング入力済み）をサーバへ同期」するフローを追加（`ProfileSyncService` を利用）

### Patch F: Nudge Strength をタップで選択可能にし、保存・同期されるようにする

- 変更対象: [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/Views/Profile/ProfileView.swift`](aniccaios/aniccaios/Views/Profile/ProfileView.swift)
- 内容:
- `UserProfile.nudgeIntensity` を source-of-truth にして UI を bind
- 選択変更時は `appState.updateUserProfile(..., sync:true)`

### Patch G: Data Integration の順序変更・永続化・トグル反応修正

- 変更対象:
- iOS: [`ProfileView.swift`](aniccaios/aniccaios/Views/Profile/ProfileView.swift), [`SettingsView.swift`](aniccaios/aniccaios/SettingsView.swift), [`Sensors/SensorAccessState.swift`](aniccaios/aniccaios/Sensors/SensorAccessState.swift), [`AppState.swift`](aniccaios/aniccaios/AppState.swift), [`Services/MetricsUploader.swift`](aniccaios/aniccaios/Services/MetricsUploader.swift), [`Services/HealthKitManager.swift`](aniccaios/aniccaios/Services/HealthKitManager.swift)
- API: [`apps/api/src/routes/mobile/profile.js`](apps/api/src/routes/mobile/profile.js)
- 内容:
- Profileで **Data Integration を Plan の直下（Your Traitsより上）に移動**
- `@AppStorage` と `sensorAccess` の二重管理を解消し、**AppState.sensorAccess を唯一の真実**にする
- サーバー `mobile/profile` に `sensorAccess`（または `dataIntegration`）を保存し、再ログイン時に復元
- **Sleep/Stepsを完全に独立**（ONした方だけ許可要求・状態更新）
- 表示文言: `Sleep (HealthKit)`→`Sleep`、`Steps (HealthKit)`→`Steps`

### Patch H: Profileの Name をタップで編集でき、保存・同期されるようにする

- 変更対象: [`ProfileView.swift`](aniccaios/aniccaios/Views/Profile/ProfileView.swift)
- 内容:
- Name行をタップで編集シートを開き、`displayName` を更新→`updateUserProfile(sync:true)`

### Patch I: Behavior の 24-hour timeline と 10 years の「空表示」を潰して“必ず何か出る”状態へ

- 変更対象:
- iOS: [`Services/MetricsUploader.swift`](aniccaios/aniccaios/Services/MetricsUploader.swift), [`Services/HealthKitManager.swift`](aniccaios/aniccaios/Services/HealthKitManager.swift)
- API: [`apps/api/src/routes/mobile/dailyMetrics.js`](apps/api/src/routes/mobile/dailyMetrics.js), [`apps/api/src/routes/mobile/behavior.js`](apps/api/src/routes/mobile/behavior.js)
- 内容:
- iOSがHealthKitから **睡眠の開始/終了（sleepStartAt/wakeAt）** を推定して `daily_metrics` に送る
- サーバー `daily_metrics` で `sleep_start_at/wake_at` を保存
- `behavior.js` の例外時フォールバックで `futureScenario` を空にしない（`generateFutureScenario` のフォールバック同等を返す）

### Patch J: OS言語に必ず追従（英語OSなら英語、ja OSなら日本語）

- 変更対象: [`/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/aniccaiosApp.swift`](aniccaios/aniccaios/aniccaiosApp.swift) ほか `.environment(\.locale, ...)` している箇所
- 内容:
- アプリ全体の `.environment(\.locale, Locale(identifier: ...))` を撤廃し、OSロケールに従う（必要なら `.autoupdatingCurrent`）

### Patch K: オンボーディング順序をサインイン先に変更

- 変更対象:
  - [`OnboardingFlowView.swift`](aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift)
  - [`OnboardingStep.swift`](aniccaios/aniccaios/Onboarding/OnboardingStep.swift)
- 内容:
  - 順序を `Welcome → SignIn → Mic → Notifications → Alarm → Ideals → Struggles → Paywall → 完了` に変更
  - これにより、Ideal/Struggles選択時には既にAppleアカウントと紐付いた状態になる
  - オンボーディングで選んだIdeal/Strugglesは即座にサーバーへPUTされ、既存ユーザーでも上書きされる



### Patch N: futureScenarioのフォールバック修正（「十分なデータがありません」表示）

- 変更対象:
  - API: [`apps/api/src/routes/mobile/behavior.js`](apps/api/src/routes/mobile/behavior.js)
  - API: [`apps/api/src/modules/simulation/futureScenario.js`](apps/api/src/modules/simulation/futureScenario.js)
- 内容:
  - データがない場合やGPT生成に失敗した場合、空文字ではなく「十分なデータがありません」と表示
  - 例外時フォールバックも同様に修正
  - 日本語: `十分なデータがありません`
  - 英語: `Not enough data available`

## 実装後の検証観点（最低限）

- **タブ**: 全タブで同じ高さ/位置/選択背景になり、スクショと視覚的に一致
- **オンボーディング**: 既存ユーザーでもサインイン後に必ず `Mic→Notifications→Allow Alarms` が表示され、勝手にメインへ飛ばない
- **Profile**: Ideal/Struggles がスクショの項目・見た目で、オンボーディングで選んだ内容が必ず反映される
- **Nudge Strength**: 3択がタップで切り替わり、再起動・再ログイン後も保持
- **Data Integration**: Sleep/Steps が連動せず独立、かつ再ログイン後も保持
- **Behavior**: 24h timeline が少なくとも Sleep セグメントを表示し、10 years が空にならない
- **ローカライズ**: OS言語を変えると Talk の4ボタン含めUIが必ず追従

## 実装Todo

- **patch-a-tabbar**: `FigmaTabBar` をスクショ/Behavior.md通りに修正、`MainTabView` を safeAreaInset 化
- **patch-b-onboarding-skip**: `applyRemoteProfilePayload` の onboardingComplete 強制を削除、Mic/Notifications自動遷移撤廃
- **patch-c-alarm-permission**: AlarmKit有無で分岐し、必ず許可導線ダイアログを表示
- **patch-d-profile-traits-ui**: Profile/Onboarding の Ideal/Struggles を profile.html に統一
- **patch-e-profile-merge-sync**: サーバー空値でローカル上書きしない + サインイン後にローカルをサーバへ同期
- **patch-f-nudge-strength**: `nudgeIntensity` をUIに接続し永続化/同期
- **patch-g-data-integration**: Data Integration位置変更 + sensorAccess一本化 + Sleep/Steps独立 + 文言変更 + API保存
- **patch-h-name-edit**: Name編集シート追加 + 同期
- **patch-i-behavior-timeline**: iOS→APIでsleepStartAt/wakeAt送信、behavior fallback修正
- **patch-j-locale**: OSロケール追従に統一
- **patch-k-onboarding-order**: オンボーディング順序を `Welcome → SignIn → Mic → Notifications → Alarm → Ideals → Struggles → Paywall` に変更
- **patch-l-habits-tab**: Habitsタブを復活し、Talk → Habits → Profile の3タブ構成にする
- **patch-m-behavior-hide**: Behaviorタブを非表示（コードは保持）
- **patch-n-future-fallback**: futureScenarioのフォールバックを「十分なデータがありません」に修正

### To-dos

- [ ] `FigmaTabBar`のレイアウトをスクショ/Behavior.md通りにし、`MainTabView`をsafeAreaInsetで常時下固定へ変更する
- [ ] `applyRemoteProfilePayload`のオンボーディング強制完了を削除し、Mic/Notifications画面の自動遷移を廃止する
- [ ] `AlarmKitPermissionStepView`をiOS26+はAlarmKit許可、未満は通知設定誘導のダイアログで“必ず許可導線”を表示する
- [ ] Profile/OnboardingのIdeal/Strugglesの項目と見た目をprofile.html（スクショ）に統一する
- [ ] サーバー復元でローカルの非空値を空配列で上書きしないようにし、サインイン直後にローカルプロフィールを同期する
- [ ] Nudge Strengthを`UserProfile.nudgeIntensity`と接続し、タップ選択・永続化・同期を実装する
- [ ] Data IntegrationをProfile上部へ移動し、sensorAccess一本化・Sleep/Steps独立・文言変更・サーバ保存/復元を実装する
- [ ] ProfileのNameをタップ編集可能にし、保存・同期する
- [ ] HealthKitからsleepStartAt/wakeAtを推定してdaily_metricsへ送信し、サーバ保存とBehavior fallback空表示を修正する
- [ ] UI言語をOSロケールに必ず追従させる（全体locale override撤廃）
- [ ] オンボーディング順序を `Welcome → SignIn → Mic → Notifications → Alarm → Ideals → Struggles → Paywall` に変更する
- [ ] Habitsタブを復活し、Talk → Habits → Profile の3タブ構成にする
- [ ] Behaviorタブを非表示にする（コードは保持）
- [ ] futureScenarioのフォールバックを「十分なデータがありません」に修正する

