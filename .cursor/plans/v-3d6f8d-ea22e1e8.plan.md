<!-- ea22e1e8-a782-4aa7-9581-06648747aeff 025734e2-65bc-4586-95d3-343f91d74425 -->
# v3 Complete Fix Plan

> **⚠️ 適用順序**
> 1. **このファイル (v-3d6f8d) を先に適用**（SDP修正、Session/Profile/Talk/Behavior、Backend、新規Manager）
> 2. **v-49d956-fb649cb7.plan.md を後に適用**（Onboarding画面、Localizable.strings、InfoPlist.strings）
>
> 両プランは**異なるファイル**を対象としているため、順番を守れば競合なし。

---

## 問題2: BGTaskSchedulerPermittedIdentifiers 未登録

**エラーメッセージ:**

```
Registration rejected; com.anicca.metrics.daily is not advertised in the application's Info.plist
```

**根本原因:**

[Info.plist](aniccaios/aniccaios/Info.plist) に `BGTaskSchedulerPermittedIdentifiers` キーが存在しない。

**修正パッチ:**

Info.plist に以下を追加:

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.anicca.metrics.daily</string>
</array>
```

---

## 問題3: MetricsUploader 未実装（空スタブ）

**現状:**

[MetricsUploader.swift](aniccaios/aniccaios/Services/MetricsUploader.swift) は空のスタブ状態。

**必要な実装:**

1. `scheduleNextIfPossible()`: BGAppRefreshTaskRequest を登録
2. `runUploadIfDue()`: HealthKit/ScreenTime データを集約して `POST /api/mobile/daily_metrics` に送信

**修正パッチ:**

別途 MetricsUploader の実装が必要（HealthKit/ScreenTime 連携含む）

---

## 問題4: Data Integration トグルが遊び状態

**現状:**

[ProfileView.swift](aniccaios/aniccaios/Views/Profile/ProfileView.swift) 207-230行目で、トグルは `@AppStorage` に保存されるだけで、OS権限ダイアログも出ず、実際のデータ取得も行われていない。

**v3-stack.md仕様:**

- Screen Time: FamilyControls entitlement + DeviceActivity 
- Sleep/Steps: HealthKit
- Movement: CoreMotion

**必要な実装:**

1. トグルON時にOS権限ダイアログを表示
2. 権限取得成功時にデータ収集開始
3. 収集データをバックエンドに送信

**問題点:**

現状のコードでは HealthKit/DeviceActivity/CoreMotion の import すら存在しない。

**修正パッチ:**

1. HealthKitManager, ScreenTimeManager, MotionManager のサービスクラスを新規作成
2. toggleRow を改修して権限リクエストを実行
3. バックグラウンドでのデータ収集ロジックを実装

---

## 問題5: Profile - Language 行削除

**現状:**

[ProfileView.swift](aniccaios/aniccaios/Views/Profile/ProfileView.swift) 85行目に Language 行がある。

**ユーザー要望:**

OSの言語設定から自動取得するため不要。

**修正パッチ:**

```swift
// 削除: 84-85行目
divider
row(label: String(localized: "profile_row_language"), value: appState.userProfile.preferredLanguage.languageLine)
```

---

## 問題6: Profile - Your Traits キーワードチップ削除

**現状:**

[ProfileView.swift](aniccaios/aniccaios/Views/Profile/ProfileView.swift) 105-110行目に Openness/Agreeableness/Conscientiousness がハードコード。

**ユーザー要望:**

キーワードチップのみ削除（サマリーテキストと View Full リンクは残す）。

**修正パッチ:**

```swift
// 削除: 104-110行目
                    // keywords はフェーズ3で AppState/UserProfile に導入（ここでは見た目だけ固定）
                    HStack(spacing: 8) {
                        chip("Openness")
                        chip("Agreeableness")
                        chip("Conscientiousness")
                    }
                    .frame(maxWidth: .infinity, alignment: .center)
```

---

## 問題7: Profile - Ideal Self / Current Struggles のUI

**現状:**

[ProfileView.swift](aniccaios/aniccaios/Views/Profile/ProfileView.swift) 138-154行目で `FlowChips` を使用しているが、選択状態の管理がなく、バックエンドのプロフィールデータ（ideals/struggles）と連携していない。

**v3-stack.md仕様:**

- ユーザーが選択した Ideals/Struggles を表示
- タップで選択/解除可能
- 変更はバックエンドに同期

**修正パッチ:**

1. `FlowChips` を改修して `@Binding` で選択状態を受け取る
2. `appState.userProfile.ideals` / `appState.userProfile.struggles` と連携
3. 変更時に `ProfileSyncService` でバックエンドに同期

---

## 問題8: Behavior 画面 - ストリークがハードコード

**現状:**

[BehaviorHighlightsStreakStore](aniccaios/aniccaios/Views/Behavior/BehaviorView.swift) 97-166行目で、ストリークをローカルの UserDefaults で管理。初期値0ではなく、画面を開くたびに加算される可能性あり。

**問題:**

- サーバーからのデータではなくローカル計算
- 「データ連携開始時から全部0であるべき」という要件を満たしていない

**修正パッチ:**

1. ストリークをバックエンドAPIから取得するように変更
2. 初回は全て0で開始
3. サーバー側で日次計算

---

## 問題9: Plan 画面の動作確認

**確認結果:**

[ManageSubscriptionSheet.swift](aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift) はメインブランチと同一コード。

**しかし:**

ユーザーはプランに入っているはずなのに正しく表示されていないとのこと。

**調査ポイント:**

1. RevenueCat SDK の初期化タイミング
2. `SubscriptionManager.syncNow()` が正しく呼ばれているか
3. `appState.subscriptionInfo` が正しく更新されているか

**対応:**

デバッグログを追加して原因を特定（コード自体はメインブランチと同一なので、設定やAPIキーの問題の可能性）

---

## 問題10: Talk 画面 - タイトル表示

**現状:**

`navigationTitle(String(localized: "talk_nav_title"))` で .large スタイル表示。長いと折り返される。

**スクショ仕様:**

「How are you feeling now?」をカード上部に中央寄せで表示。

**修正パッチ:**

[TalkView.swift](aniccaios/aniccaios/Views/Talk/TalkView.swift) を修正:

```swift
// .navigationTitle を削除し、ScrollView 内のヘッダとして配置
VStack(spacing: AppTheme.Spacing.xl) {
    Text(String(localized: "talk_nav_title"))
        .font(.system(size: 30, weight: .bold))
        .foregroundStyle(AppTheme.Colors.label)
        .multilineTextAlignment(.center)
        .padding(.top, AppTheme.Spacing.lg)
    
    QuoteCard(quote: QuoteProvider.shared.todayQuote())
    // ... 残りのコンテンツ
}
```

---

## 問題11: Session 画面 - デザイン未反映

**現状:**

[SessionView.swift](aniccaios/aniccaios/Views/Session/SessionView.swift) と [OrbView.swift](aniccaios/aniccaios/Views/Session/OrbView.swift) はシンプルな実装。

**スクショ仕様（session.html）:**

- 上部に小さなラベル（丸角pill）「Talking about self-loathing」
- 青い丸オーブ（グラデーション）
- 状態テキスト「Anicca is listening...」
- 左下: マイクボタン（大きい丸）
- 右下: 終了ボタン（赤い丸）

**修正パッチ:**

session.html のデザインをそのまま SwiftUI に反映（オーブのグラデーション、ボタンサイズ、配置を調整）

---

## 問題12: Quote - ローカルハードコード

**現状:**

[QuoteProvider.swift](aniccaios/aniccaios/Services/QuoteProvider.swift) に30件の固定文がハードコード。day-of-year で選択。

**v3-stack.md仕様:**

「固定ストック30個から1日1つ表示」→ 現状で仕様通り。

**対応:** 変更不要（仕様通りの実装）

---

## 問題13: タブバーのデザイン

**現状:**

標準の `TabView` + `.tabItem` を使用。

**スクショ仕様（talk.html）:**

固定のカスタムタブバー（アイコン + テキスト）

**対応:**

現状の標準 TabView で機能的には問題なし。デザイン調整が必要な場合は CustomTabBar を有効化。

---

## 修正対象ファイルまとめ

| ファイル | 修正内容 |

|---------|---------|

| `aniccaios/aniccaios/VoiceSessionController.swift` | SDP エンドポイントを `/v1/realtime/calls` に変更 |

| `aniccaios/aniccaios/Info.plist` | BGTaskSchedulerPermittedIdentifiers 追加 |

| `aniccaios/aniccaios/Services/MetricsUploader.swift` | 実装を完成させる |

| `aniccaios/aniccaios/Views/Profile/ProfileView.swift` | Language行削除、Traitsキーワード削除、Ideals/Struggles連携 |

| `aniccaios/aniccaios/Views/Talk/TalkView.swift` | タイトル表示をヘッダに変更 |

| `aniccaios/aniccaios/Views/Session/SessionView.swift` | session.htmlデザイン反映 |

| `aniccaios/aniccaios/Views/Session/OrbView.swift` | グラデーション調整 |

| `aniccaios/aniccaios/Views/Behavior/BehaviorView.swift` | ストリーク計算をサーバーベースに |

| 新規: `aniccaios/aniccaios/Services/HealthKitManager.swift` | HealthKit 連携 |

| 新規: `aniccaios/aniccaios/Services/ScreenTimeManager.swift` | ScreenTime 連携 |

| 新規: `aniccaios/aniccaios/Services/MotionManager.swift` | CoreMotion 連携 |

---

## 優先順位

1. **P0 (即座に修正必須):**

   - 問題1: SDP 400エラー（セッション動作不能）
   - 問題2: BGTaskSchedulerPermittedIdentifiers

2. **P1 (重要):**

   - 問題5: Language行削除
   - 問題6: Traitsキーワード削除
   - 問題10: Talkタイトル表示
   - 問題11: Session画面デザイン

3. **P2 (追加実装):**

   - 問題3: MetricsUploader実装
   - 問題4: Data Integration連携
   - 問題7: Ideals/Struggles連携
   - 問題8: ストリークサーバー連携

---

# 完全なパッチ一覧（そのまま適用可能）

---

## パッチ1: SDP エンドポイント修正

**ファイル:** `aniccaios/aniccaios/VoiceSessionController.swift`

**old_string:**
```swift
    private func fetchRemoteSDP(secret: ClientSecret, localSdp: String) async throws -> String {
        guard !secret.value.isEmpty else {
            throw VoiceSessionError.missingClientSecret
        }

        var components = URLComponents(string: "https://api.openai.com/v1/realtime")
        components?.queryItems = [URLQueryItem(name: "model", value: sessionModel)]
        guard let url = components?.url else {
            throw VoiceSessionError.remoteSDPFailed
        }
```

**new_string:**
```swift
    private func fetchRemoteSDP(secret: ClientSecret, localSdp: String) async throws -> String {
        guard !secret.value.isEmpty else {
            throw VoiceSessionError.missingClientSecret
        }

        // GA endpoint: POST /v1/realtime/calls (model already set in client_secret)
        guard let url = URL(string: "https://api.openai.com/v1/realtime/calls") else {
            throw VoiceSessionError.remoteSDPFailed
        }
```

---

## パッチ2: Info.plist に BGTaskSchedulerPermittedIdentifiers 追加

**ファイル:** `aniccaios/aniccaios/Info.plist`

**old_string:**
```xml
	<key>UIBackgroundModes</key>
	<array>
		<string>audio</string>
		<string>remote-notification</string>
	</array>
```

**new_string:**
```xml
	<key>BGTaskSchedulerPermittedIdentifiers</key>
	<array>
		<string>com.anicca.metrics.daily</string>
	</array>
	<key>UIBackgroundModes</key>
	<array>
		<string>audio</string>
		<string>remote-notification</string>
		<string>processing</string>
	</array>
```

---

## パッチ3: Profile - Language 行削除

**ファイル:** `aniccaios/aniccaios/Views/Profile/ProfileView.swift`

**old_string:**
```swift
                .buttonStyle(.plain)
                divider
                row(label: String(localized: "profile_row_language"), value: appState.userProfile.preferredLanguage.languageLine)
            }
        }
    }

    private var traitsCard: some View {
```

**new_string:**
```swift
                .buttonStyle(.plain)
            }
        }
    }

    private var traitsCard: some View {
```

---

## パッチ4: Profile - Traits キーワードチップ削除

**ファイル:** `aniccaios/aniccaios/Views/Profile/ProfileView.swift`

**old_string:**
```swift
                    Text(String(localized: "profile_traits_summary_placeholder"))
                        .font(.system(size: 16))
                        .foregroundStyle(AppTheme.Colors.label)
                        .multilineTextAlignment(.center)

                    // keywords はフェーズ3で AppState/UserProfile に導入（ここでは見た目だけ固定）
                    HStack(spacing: 8) {
                        chip("Openness")
                        chip("Agreeableness")
                        chip("Conscientiousness")
                    }
                    .frame(maxWidth: .infinity, alignment: .center)

                    NavigationLink {
```

**new_string:**
```swift
                    Text(String(localized: "profile_traits_summary_placeholder"))
                        .font(.system(size: 16))
                        .foregroundStyle(AppTheme.Colors.label)
                        .multilineTextAlignment(.center)

                    NavigationLink {
```

---

## パッチ5: Talk 画面タイトルをヘッダに変更（その1）

**ファイル:** `aniccaios/aniccaios/Views/Talk/TalkView.swift`

**old_string:**
```swift
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.xl) {
                    QuoteCard(quote: QuoteProvider.shared.todayQuote())

                    VStack(spacing: AppTheme.Spacing.lg) {
                        ForEach(topics, id: \.self) { topic in
```

**new_string:**
```swift
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.xl) {
                    // v3-ui: タイトルをヘッダとして表示（navigationTitleではなく）
                    Text(String(localized: "talk_nav_title"))
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.label)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.top, AppTheme.Spacing.md)

                    QuoteCard(quote: QuoteProvider.shared.todayQuote())

                    VStack(spacing: AppTheme.Spacing.lg) {
                        ForEach(topics, id: \.self) { topic in
```

---

## パッチ6: Talk 画面タイトルをヘッダに変更（その2）

**ファイル:** `aniccaios/aniccaios/Views/Talk/TalkView.swift`

**old_string:**
```swift
            .background(AppBackground())
            .navigationTitle(String(localized: "talk_nav_title"))
            .navigationBarTitleDisplayMode(.large)
            .navigationDestination(for: FeelingTopic.self) { topic in
```

**new_string:**
```swift
            .background(AppBackground())
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: FeelingTopic.self) { topic in
```

---

## パッチ7: Session 画面 - 完全なデザイン反映（session.html 準拠）

### 仕様（session.html より）

| 要素 | 仕様 |
|------|------|
| Topic Pill | `px-4 py-2 bg-accent rounded-full text-sm font-medium text-muted-foreground` |
| Orb | `size-72` (288x288px), gradient `from-[#e6f5ff] via-[#b3d9ff] to-[#4da6ff]`, `shadow-xl` |
| Status Text | `text-base font-medium text-foreground/70` → "Anicca is listening…" |
| Mic Button | `size-20` (80x80px), `bg-card rounded-full shadow-lg border border-border/20` |
| Close Button | `size-20` (80x80px), `bg-destructive rounded-full shadow-lg` |
| Spacing | Topic→Orb: `mb-12` (48pt), Orb→Status: `mb-12` (48pt), Status→Bottom: `mb-16` (64pt) |

---

### パッチ7-A: OrbView 完全修正

**ファイル:** `aniccaios/aniccaios/Views/Session/OrbView.swift`

**old_string:**
```swift
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color(red: 0.22, green: 0.50, blue: 0.95).opacity(0.95),
                        Color(red: 0.10, green: 0.32, blue: 0.85).opacity(0.95)
                    ],
                    center: .center,
                    startRadius: 10,
                    endRadius: 160
                )
            )
            .frame(width: 190, height: 190)
```

**new_string:**
```swift
        // session.html: size-72 (288px), gradient from-[#e6f5ff] via-[#b3d9ff] to-[#4da6ff], shadow-xl
        Circle()
            .fill(
                LinearGradient(
                    colors: [
                        Color(red: 0.90, green: 0.96, blue: 1.0),   // #e6f5ff
                        Color(red: 0.70, green: 0.85, blue: 1.0),   // #b3d9ff
                        Color(red: 0.30, green: 0.65, blue: 1.0)    // #4da6ff
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 288, height: 288)
            .shadow(color: .black.opacity(0.15), radius: 20, x: 0, y: 10)
```

---

### パッチ7-B: SessionView body 完全修正（レイアウト・間隔・スタイル）

**ファイル:** `aniccaios/aniccaios/Views/Session/SessionView.swift`

**old_string:**
```swift
    var body: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            topicPill

            Spacer(minLength: AppTheme.Spacing.xl)

            OrbView()

            Text(statusText)
                .font(AppTheme.Typography.bodyDynamic)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)

            Spacer(minLength: AppTheme.Spacing.xl)

            controlsRow
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.top, AppTheme.Spacing.lg)
        .padding(.bottom, AppTheme.Spacing.xxl)
```

**new_string:**
```swift
    var body: some View {
        VStack(spacing: 0) {
            // session.html: mb-12 (48pt) after topic pill
            topicPill
                .padding(.bottom, 48)

            // session.html: mb-12 (48pt) after orb
            OrbView()
                .padding(.bottom, 48)

            // session.html: text-base font-medium text-foreground/70, mb-16 (64pt)
            Text(statusText)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(AppTheme.Colors.label.opacity(0.7))
                .padding(.bottom, 64)

            Spacer()

            controlsRow
        }
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .padding(.bottom, 48)
```

---

### パッチ7-C: Topic Pill スタイル調整

**ファイル:** `aniccaios/aniccaios/Views/Session/SessionView.swift`

**old_string:**
```swift
    private var topicPill: some View {
        Text(topicLabel)
            .font(AppTheme.Typography.caption1Dynamic)
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.sm)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous)
                    .fill(AppTheme.Colors.buttonUnselected)
            )
    }
```

**new_string:**
```swift
    private var topicPill: some View {
        // session.html: px-4 py-2 bg-accent rounded-full text-sm font-medium text-muted-foreground
        Text(topicLabel)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(AppTheme.Colors.accent)
            )
    }
```

---

### パッチ7-D: Controls Row 完全修正（80x80px + shadow-lg）

**ファイル:** `aniccaios/aniccaios/Views/Session/SessionView.swift`

**old_string:**
```swift
    private var controlsRow: some View {
        HStack {
            Button {
                controller.toggleMicMuted()
            } label: {
                Image(systemName: controller.isMicMuted ? "mic.slash.fill" : "mic.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(AppTheme.Colors.cardBackground))
                    .overlay(Circle().stroke(AppTheme.Colors.borderLight, lineWidth: 1))
            }

            Spacer()

            Button {
                endSessionAndMaybeAskEMA()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(Color.red))
            }
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
    }
```

**new_string:**
```swift
    private var controlsRow: some View {
        // session.html: size-20 (80px), shadow-lg, border-border/20
        HStack {
            Button {
                controller.toggleMicMuted()
            } label: {
                Image(systemName: controller.isMicMuted ? "mic.slash.fill" : "mic.fill")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .frame(width: 80, height: 80)
                    .background(Circle().fill(AppTheme.Colors.cardBackground))
                    .overlay(Circle().stroke(AppTheme.Colors.border.opacity(0.2), lineWidth: 1))
                    .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 6)
            }

            Spacer()

            Button {
                endSessionAndMaybeAskEMA()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 80, height: 80)
                    .background(Circle().fill(Color.red))
                    .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 6)
            }
        }
        .padding(.horizontal, 24)
    }
```

---

## パッチ8: MetricsUploader 完全実装

**ファイル:** `aniccaios/aniccaios/Services/MetricsUploader.swift`

**old_string:**
```swift
import Foundation

/// Sends daily aggregates to backend (daily_metrics).
/// Target time: ~03:00 UTC, but iOS scheduling is best-effort.
///
/// Primary sources for scheduling constraints:
/// - BGTask registration must finish by app launch end:
///   https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler/register(fortaskwithidentifier:using:launchhandler:)/
/// - earliestBeginDate is NOT guaranteed:
///   https://developer.apple.com/documentation/backgroundtasks/bgtaskrequest/earliestbegindate/
/// - Background tasks overview:
///   https://developer.apple.com/documentation/uikit/using-background-tasks-to-update-your-app/
@MainActor
final class MetricsUploader {
    static let shared = MetricsUploader()
    private init() {}

    /// BGTask identifier (must be in BGTaskSchedulerPermittedIdentifiers).
    static let taskId = "com.anicca.metrics.daily"

    func scheduleNextIfPossible() {
        // import BackgroundTasks
        // BGAppRefreshTaskRequest(identifier: Self.taskId).earliestBeginDate = ...
        // BGTaskScheduler.shared.submit(request)
    }

    func runUploadIfDue() async {
        // Quiet fallback: if not signed-in, return.
        // Gather cached data from sensors (only enabled ones).
        // POST /api/mobile/daily_metrics (endpoint name from ios-sensors-spec-v3.md; server side to implement)
    }
}
```

**new_string:**
```swift
import Foundation
import BackgroundTasks
import os

/// Sends daily aggregates to backend (daily_metrics).
/// Target time: ~03:00 UTC, but iOS scheduling is best-effort.
@MainActor
final class MetricsUploader {
    static let shared = MetricsUploader()
    private init() {}

    private let logger = Logger(subsystem: "com.anicca.ios", category: "MetricsUploader")
    
    /// BGTask identifier (must be in BGTaskSchedulerPermittedIdentifiers).
    static let taskId = "com.anicca.metrics.daily"
    
    private let lastUploadKey = "com.anicca.metrics.lastUploadDate"
    
    /// Register the background task handler (call once at app launch in AppDelegate)
    func registerBGTask() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskId, using: nil) { task in
            Task { @MainActor in
                await self.handleBGTask(task as! BGProcessingTask)
            }
        }
    }

    func scheduleNextIfPossible() {
        let request = BGProcessingTaskRequest(identifier: Self.taskId)
        // Target ~03:00 UTC next day
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        if let tomorrow3am = calendar.nextDate(after: Date(), matching: DateComponents(hour: 3, minute: 0), matchingPolicy: .nextTime) {
            request.earliestBeginDate = tomorrow3am
        } else {
            request.earliestBeginDate = Date().addingTimeInterval(3600 * 6)
        }
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        
        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("Scheduled daily metrics upload for \(request.earliestBeginDate?.description ?? "unknown")")
        } catch {
            logger.error("Failed to schedule metrics upload: \(error.localizedDescription)")
        }
    }
    
    private func handleBGTask(_ task: BGProcessingTask) async {
        task.expirationHandler = { [weak self] in
            self?.logger.warning("BGTask expired before completion")
        }
        
        await runUploadIfDue()
        task.setTaskCompleted(success: true)
        scheduleNextIfPossible()
    }

    func runUploadIfDue() async {
        // Skip if not signed in
        guard case .signedIn(let credentials) = AppState.shared.authStatus else {
            logger.info("Skipping metrics upload: not signed in")
            return
        }
        
        // Check if already uploaded today
        let lastUpload = UserDefaults.standard.object(forKey: lastUploadKey) as? Date
        if let last = lastUpload, Calendar.current.isDateInToday(last) {
            logger.info("Already uploaded today, skipping")
            return
        }
        
        // Gather data from enabled sensors
        var payload: [String: Any] = [
            "date": ISO8601DateFormatter().string(from: Date()),
            "timezone": TimeZone.current.identifier
        ]
        
        // Sleep/Steps from HealthKit (if enabled)
        if UserDefaults.standard.bool(forKey: "com.anicca.dataIntegration.sleepEnabled") ||
           UserDefaults.standard.bool(forKey: "com.anicca.dataIntegration.stepsEnabled") {
            let healthData = await HealthKitManager.shared.fetchDailySummary()
            if let sleep = healthData.sleepMinutes {
                payload["sleep_minutes"] = sleep
            }
            if let steps = healthData.steps {
                payload["steps"] = steps
            }
        }
        
        // Screen Time (if enabled)
        if UserDefaults.standard.bool(forKey: "com.anicca.dataIntegration.screenTimeEnabled") {
            let screenData = await ScreenTimeManager.shared.fetchDailySummary()
            if let minutes = screenData.totalMinutes {
                payload["screen_time_minutes"] = minutes
            }
        }
        
        // Movement/Sedentary (if enabled)
        if UserDefaults.standard.bool(forKey: "com.anicca.dataIntegration.motionEnabled") {
            let motionData = await MotionManager.shared.fetchDailySummary()
            if let sedentary = motionData.sedentaryMinutes {
                payload["sedentary_minutes"] = sedentary
            }
        }
        
        // POST to backend
        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("mobile/daily_metrics"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                UserDefaults.standard.set(Date(), forKey: lastUploadKey)
                logger.info("Daily metrics uploaded successfully")
            }
        } catch {
            logger.error("Failed to upload metrics: \(error.localizedDescription)")
        }
    }
}
```

---

## パッチ10: HealthKitManager 新規作成

**ファイル:** `aniccaios/aniccaios/Services/HealthKitManager.swift` (新規作成)

**new_file:**
```swift
import Foundation
import HealthKit
import os

@MainActor
final class HealthKitManager {
    static let shared = HealthKitManager()
    private init() {}
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "HealthKitManager")
    private let healthStore = HKHealthStore()
    
    struct DailySummary {
        var sleepMinutes: Int?
        var steps: Int?
    }
    
    var isAuthorized: Bool {
        HKHealthStore.isHealthDataAvailable()
    }
    
    func requestAuthorization() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else {
            logger.warning("HealthKit not available on this device")
            return false
        }
        
        let typesToRead: Set<HKObjectType> = [
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
            HKObjectType.quantityType(forIdentifier: .stepCount)!
        ]
        
        do {
            try await healthStore.requestAuthorization(toShare: [], read: typesToRead)
            logger.info("HealthKit authorization granted")
            return true
        } catch {
            logger.error("HealthKit authorization failed: \(error.localizedDescription)")
            return false
        }
    }
    
    func fetchDailySummary() async -> DailySummary {
        var summary = DailySummary()
        
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
        
        // Fetch sleep
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay, options: .strictStartDate)
            let sleepSamples = try? await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKCategorySample], Error>) in
                let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: samples as? [HKCategorySample] ?? [])
                    }
                }
                healthStore.execute(query)
            }
            
            if let samples = sleepSamples {
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
                ]
                let totalSleepSeconds = samples
                    .filter { asleepValues.contains($0.value) }
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                summary.sleepMinutes = Int(totalSleepSeconds / 60)
            }
        }
        
        // Fetch steps
        if let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) {
            let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay, options: .strictStartDate)
            let steps = try? await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Double, Error>) in
                let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else {
                        let sum = result?.sumQuantity()?.doubleValue(for: .count()) ?? 0
                        continuation.resume(returning: sum)
                    }
                }
                healthStore.execute(query)
            }
            
            if let steps = steps {
                summary.steps = Int(steps)
            }
        }
        
        return summary
    }
}
```

---

## パッチ11: ScreenTimeManager 新規作成

**ファイル:** `aniccaios/aniccaios/Services/ScreenTimeManager.swift` (新規作成)

**new_file:**
```swift
import Foundation
import os

// NOTE: Full Screen Time API requires FamilyControls entitlement (com.apple.developer.family-controls)
// and cannot be used without it. This is a placeholder for future implementation.
// For now, we'll provide a stub that returns nil.

@MainActor
final class ScreenTimeManager {
    static let shared = ScreenTimeManager()
    private init() {}
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "ScreenTimeManager")
    
    struct DailySummary {
        var totalMinutes: Int?
    }
    
    /// Request Screen Time authorization
    /// NOTE: Requires com.apple.developer.family-controls entitlement
    func requestAuthorization() async -> Bool {
        // FamilyControls entitlement is required for DeviceActivityMonitor
        // Without it, we cannot access Screen Time data
        logger.warning("ScreenTime API requires FamilyControls entitlement - not yet configured")
        return false
    }
    
    func fetchDailySummary() async -> DailySummary {
        // Placeholder - will be implemented when FamilyControls entitlement is added
        return DailySummary(totalMinutes: nil)
    }
}
```

---

## パッチ12: MotionManager 新規作成

**ファイル:** `aniccaios/aniccaios/Services/MotionManager.swift` (新規作成)

**new_file:**
```swift
import Foundation
import CoreMotion
import os

@MainActor
final class MotionManager {
    static let shared = MotionManager()
    private init() {}
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "MotionManager")
    private let activityManager = CMMotionActivityManager()
    private let pedometer = CMPedometer()
    
    struct DailySummary {
        var sedentaryMinutes: Int?
    }
    
    var isAuthorized: Bool {
        CMMotionActivityManager.isActivityAvailable()
    }
    
    func requestAuthorization() async -> Bool {
        guard CMMotionActivityManager.isActivityAvailable() else {
            logger.warning("Motion activity not available on this device")
            return false
        }
        
        // Request by starting a query - this triggers the permission dialog
        return await withCheckedContinuation { continuation in
            let now = Date()
            let oneHourAgo = now.addingTimeInterval(-3600)
            
            activityManager.queryActivityStarting(from: oneHourAgo, to: now, to: .main) { [weak self] activities, error in
                if let error = error as? CMError, error.code == .motionActivityNotAuthorized {
                    self?.logger.error("Motion authorization denied")
                    continuation.resume(returning: false)
                } else {
                    self?.logger.info("Motion authorization granted")
                    continuation.resume(returning: true)
                }
            }
        }
    }
    
    func fetchDailySummary() async -> DailySummary {
        guard CMMotionActivityManager.isActivityAvailable() else {
            return DailySummary(sedentaryMinutes: nil)
        }
        
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        
        return await withCheckedContinuation { continuation in
            activityManager.queryActivityStarting(from: startOfDay, to: now, to: .main) { [weak self] activities, error in
                if let error = error {
                    self?.logger.error("Failed to fetch motion data: \(error.localizedDescription)")
                    continuation.resume(returning: DailySummary(sedentaryMinutes: nil))
                    return
                }
                
                guard let activities = activities, !activities.isEmpty else {
                    continuation.resume(returning: DailySummary(sedentaryMinutes: nil))
                    return
                }
                
                // Calculate sedentary time (stationary activities)
                var sedentarySeconds: TimeInterval = 0
                for i in 0..<(activities.count - 1) {
                    let current = activities[i]
                    let next = activities[i + 1]
                    if current.stationary {
                        sedentarySeconds += next.startDate.timeIntervalSince(current.startDate)
                    }
                }
                
                // Handle last activity to now
                if let last = activities.last, last.stationary {
                    sedentarySeconds += now.timeIntervalSince(last.startDate)
                }
                
                continuation.resume(returning: DailySummary(sedentaryMinutes: Int(sedentarySeconds / 60)))
            }
        }
    }
}
```

---

## パッチ13: ProfileView - Data Integration トグルに権限リクエストを接続

**ファイル:** `aniccaios/aniccaios/Views/Profile/ProfileView.swift`

**old_string:**
```swift
    private var dataIntegrationSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_data_integration"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            Text(String(localized: "profile_data_integration_hint"))
                .font(AppTheme.Typography.caption1Dynamic)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)

            CardView(cornerRadius: 28) {
                VStack(spacing: 0) {
                    toggleRow(String(localized: "profile_toggle_screen_time"), isOn: $screenTimeEnabled)
                    divider
                    toggleRow(String(localized: "profile_toggle_sleep"), isOn: $sleepEnabled)
                    divider
                    toggleRow(String(localized: "profile_toggle_steps"), isOn: $stepsEnabled)
                    divider
                    toggleRow(String(localized: "profile_toggle_movement"), isOn: $motionEnabled)
                }
            }
        }
    }
```

**new_string:**
```swift
    private var dataIntegrationSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_data_integration"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            Text(String(localized: "profile_data_integration_hint"))
                .font(AppTheme.Typography.caption1Dynamic)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)

            CardView(cornerRadius: 28) {
                VStack(spacing: 0) {
                    dataToggleRow(
                        title: String(localized: "profile_toggle_screen_time"),
                        isOn: $screenTimeEnabled,
                        onEnable: { Task { await ScreenTimeManager.shared.requestAuthorization() } }
                    )
                    divider
                    dataToggleRow(
                        title: String(localized: "profile_toggle_sleep"),
                        isOn: $sleepEnabled,
                        onEnable: { Task { await HealthKitManager.shared.requestAuthorization() } }
                    )
                    divider
                    dataToggleRow(
                        title: String(localized: "profile_toggle_steps"),
                        isOn: $stepsEnabled,
                        onEnable: { Task { await HealthKitManager.shared.requestAuthorization() } }
                    )
                    divider
                    dataToggleRow(
                        title: String(localized: "profile_toggle_movement"),
                        isOn: $motionEnabled,
                        onEnable: { Task { await MotionManager.shared.requestAuthorization() } }
                    )
                }
            }
        }
    }
    
    private func dataToggleRow(title: String, isOn: Binding<Bool>, onEnable: @escaping () -> Void) -> some View {
        Toggle(title, isOn: Binding(
            get: { isOn.wrappedValue },
            set: { newValue in
                if newValue && !isOn.wrappedValue {
                    onEnable()
                }
                isOn.wrappedValue = newValue
            }
        ))
        .tint(AppTheme.Colors.accent)
        .padding(.vertical, 14)
        .padding(.horizontal, 2)
    }
```

---

## パッチ14: ProfileView - Ideals/Struggles をバックエンドと連携

**ファイル:** `aniccaios/aniccaios/Views/Profile/ProfileView.swift`

**old_string:**
```swift
    private var idealsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_ideal_self"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            FlowChips(options: [
                "Kind", "Altruistic", "Confident", "Mindful", "Honest", "Open", "Courageous"
            ])
        }
    }

    private var strugglesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_current_struggles"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            FlowChips(options: [
                "Rumination", "Jealousy", "Self-Criticism", "Anxiety", "Loneliness", "Irritation"
            ])
        }
    }
```

**new_string:**
```swift
    private var idealsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_ideal_self"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            ProfileFlowChips(
                options: ["Kind", "Altruistic", "Confident", "Mindful", "Honest", "Open", "Courageous"],
                selected: Binding(
                    get: { Set(appState.userProfile.ideals) },
                    set: { newValue in
                        var profile = appState.userProfile
                        profile.ideals = Array(newValue)
                        appState.updateUserProfile(profile, sync: true)
                    }
                )
            )
        }
    }

    private var strugglesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_current_struggles"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            ProfileFlowChips(
                options: ["Rumination", "Jealousy", "Self-Criticism", "Anxiety", "Loneliness", "Irritation"],
                selected: Binding(
                    get: { Set(appState.userProfile.struggles) },
                    set: { newValue in
                        var profile = appState.userProfile
                        profile.struggles = Array(newValue)
                        appState.updateUserProfile(profile, sync: true)
                    }
                )
            )
        }
    }
```

---

## パッチ15: ProfileView - FlowChips を ProfileFlowChips に改修

**ファイル:** `aniccaios/aniccaios/Views/Profile/ProfileView.swift`

**old_string:**
```swift
/// v0.3: pill 風のチップ群（実装は最小。フェーズ4/3の traits 保存に接続する）
private struct FlowChips: View {
    let options: [String]
    @State private var selected: Set<String> = []

    var body: some View {
        // LazyVGrid で擬似的に折り返し
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 10)], spacing: 10) {
            ForEach(options, id: \.self) { item in
                let isOn = selected.contains(item)
                Button {
                    if isOn { selected.remove(item) } else { selected.insert(item) }
                    // NOTE: 本保存（AppState.updateTraits）はフェーズ3のフィールド追加後に接続する
                } label: {
                    Text(item)
                        .font(.system(size: 14, weight: .medium))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .background(isOn ? AppTheme.Colors.buttonSelected : AppTheme.Colors.cardBackground)
                        .foregroundStyle(isOn ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.label)
                        .overlay(
                            RoundedRectangle(cornerRadius: 999, style: .continuous)
                                .stroke(AppTheme.Colors.border.opacity(0.2), lineWidth: 1)
                        )
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
```

**new_string:**
```swift
/// v0.3: pill 風のチップ群 - バックエンドと連携
private struct ProfileFlowChips: View {
    let options: [String]
    @Binding var selected: Set<String>

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 10)], spacing: 10) {
            ForEach(options, id: \.self) { item in
                let isOn = selected.contains(item)
                Button {
                    if isOn { selected.remove(item) } else { selected.insert(item) }
                } label: {
                    Text(item)
                        .font(.system(size: 14, weight: .medium))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .background(isOn ? AppTheme.Colors.buttonSelected : AppTheme.Colors.cardBackground)
                        .foregroundStyle(isOn ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.label)
                        .overlay(
                            RoundedRectangle(cornerRadius: 999, style: .continuous)
                                .stroke(AppTheme.Colors.border.opacity(0.2), lineWidth: 1)
                        )
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
```

---

## パッチ16: BehaviorView - ストリークをサーバーベースに変更

**ファイル:** `aniccaios/aniccaios/Views/Behavior/BehaviorView.swift`

**old_string:**
```swift
                    if let summary = summary {
                        insightsCard(text: summary.todayInsight)

                        TimelineView(segments: summary.timeline)

                        HighlightsCard(
                            highlights: summary.highlights,
                            streaks: BehaviorHighlightsStreakStore.shared.streaks(for: summary.highlights)
                        )

                        FutureScenarioView(future: summary.futureScenario)
                    }
```

**new_string:**
```swift
                    if let summary = summary {
                        insightsCard(text: summary.todayInsight)

                        TimelineView(segments: summary.timeline)

                        HighlightsCard(
                            highlights: summary.highlights,
                            streaks: summary.streaks ?? BehaviorHighlightsStreakStore.Streaks(wake: 0, screen: 0, workout: 0, rumination: 0)
                        )

                        FutureScenarioView(future: summary.futureScenario)
                    }
```

---

## パッチ17: BehaviorSummary にストリーク追加

**ファイル:** `aniccaios/aniccaios/Services/BehaviorSummaryService.swift`

**変更内容:** BehaviorSummary 構造体に `streaks` フィールドを追加（サーバーから取得）

※ 既存の BehaviorSummary 構造体に以下を追加:

```swift
var streaks: BehaviorHighlightsStreakStore.Streaks?
```

---

## パッチ18: Info.plist に HealthKit 使用説明を追加

**ファイル:** `aniccaios/aniccaios/Info.plist`

**追加内容:**
```xml
<key>NSHealthShareUsageDescription</key>
<string>Anicca uses your sleep and step data to provide personalized insights and help you build better habits.</string>
<key>NSMotionUsageDescription</key>
<string>Anicca uses motion data to detect sedentary periods and encourage healthy movement.</string>
```

---

メインブランチの課金関連実装とバックエンド API を確認します。

[10 tools called]

理解しました。`SettingsView.swift` に正しい実装パターンがあります。`ProfileView.swift` で `ManageSubscriptionSheet` を使用していますが、これを `SettingsView.swift` と同じ `subscriptionSheetContent` パターンに変更すべきです。

バックエンド API も確認します。

[7 tools called]

全て把握しました。チャットで残り2つのパッチを示します。

---

# 追加パッチ（チャット回答）

---

## パッチ19: ProfileView - Plan 画面を SettingsView と同じ実装に修正

**問題**: `ManageSubscriptionSheet` がカスタム実装になっているが、`SettingsView.swift` と同じ `PaywallContainerView` / `CustomerCenterView` パターンを使うべき。

**ファイル:** `aniccaios/aniccaios/Views/Profile/ProfileView.swift`

**old_string:**
```swift
        .sheet(isPresented: $showingManageSubscription) {
            // v3: Planタップは設定画面ではなく「Manage Plan（Customer Center / Paywall）」へ
            ManageSubscriptionSheet()
                .environmentObject(appState)
        }
```

**new_string:**
```swift
        .sheet(isPresented: $showingManageSubscription) {
            subscriptionSheetContent
                .environmentObject(appState)
        }
```

さらに、`ProfileView` の末尾（`deleteAccount` 関数の後）に以下を追加:

**追加:**
```swift
    @ViewBuilder
    private var subscriptionSheetContent: some View {
        if appState.subscriptionInfo.plan == .free {
            PaywallContainerView(
                forcePresent: true,
                onDismissRequested: { showingManageSubscription = false }
            )
            .environment(\.locale, Locale(identifier: appState.userProfile.preferredLanguage.rawValue))
            .task { await SubscriptionManager.shared.refreshOfferings() }
        } else {
            RevenueCatUI.CustomerCenterView()
                .environment(\.locale, Locale(identifier: appState.userProfile.preferredLanguage.rawValue))
                .onCustomerCenterRestoreCompleted { customerInfo in
                    Task {
                        let subscription = SubscriptionInfo(info: customerInfo)
                        await MainActor.run { appState.updateSubscriptionInfo(subscription) }
                        await SubscriptionManager.shared.syncNow()
                    }
                }
        }
    }
```

さらに、ファイル先頭に import を追加:

**old_string:**
```swift
import SwiftUI
import Combine
import Foundation
```

**new_string:**
```swift
import SwiftUI
import Combine
import Foundation
import RevenueCatUI
```

---

## パッチ20: ManageSubscriptionSheet.swift を削除

**問題**: カスタム実装は不要。SettingsView と同じパターンを ProfileView で使用するため削除。

**ファイル:** `aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift`

**操作:** ファイル削除

---

## パッチ21: バックエンド - POST /api/mobile/daily_metrics エンドポイント追加

**ファイル:** `apps/api/src/routes/mobile/dailyMetrics.js` (新規作成)

**new_file:**
```javascript
import express from 'express';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
import prisma from '../../prisma/client.js';

const router = express.Router();
const logger = baseLogger.withContext('DailyMetrics');

// POST /api/mobile/daily_metrics
router.post('/', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = await extractUserId(req, res);
  if (!userId) return;

  try {
    const {
      date,
      timezone,
      sleep_minutes,
      steps,
      screen_time_minutes,
      sedentary_minutes
    } = req.body;

    // Upsert daily_metrics for this user + date
    const parsedDate = new Date(date);
    const startOfDay = new Date(parsedDate.toISOString().split('T')[0] + 'T00:00:00Z');

    await prisma.dailyMetrics.upsert({
      where: {
        userId_date: {
          userId,
          date: startOfDay
        }
      },
      update: {
        timezone: timezone || 'UTC',
        sleepMinutes: sleep_minutes ?? null,
        steps: steps ?? null,
        screenTimeMinutes: screen_time_minutes ?? null,
        sedentaryMinutes: sedentary_minutes ?? null,
        updatedAt: new Date()
      },
      create: {
        userId,
        deviceId,
        date: startOfDay,
        timezone: timezone || 'UTC',
        sleepMinutes: sleep_minutes ?? null,
        steps: steps ?? null,
        screenTimeMinutes: screen_time_minutes ?? null,
        sedentaryMinutes: sedentary_minutes ?? null
      }
    });

    logger.info(`Saved daily_metrics for user ${userId} on ${date}`);
    return res.status(200).json({ success: true });
  } catch (e) {
    logger.error('Failed to save daily_metrics', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

---

## パッチ22: バックエンド - mobile/index.js に dailyMetrics ルーター追加

**ファイル:** `apps/api/src/routes/mobile/index.js`

**old_string:**
```javascript
import express from 'express';
import realtimeRouter from './realtime.js';
import profileRouter from './profile.js';
import entitlementRouter from './entitlement.js';
import accountRouter from './account.js';
import behaviorRouter from './behavior.js';
import feelingRouter from './feeling.js';
import nudgeRouter from './nudge.js';

const router = express.Router();

router.use('/realtime', realtimeRouter);
router.use('/profile', profileRouter);
router.use('/entitlement', entitlementRouter);
router.use('/account', accountRouter);
router.use('/behavior', behaviorRouter);
router.use('/feeling', feelingRouter);
router.use('/nudge', nudgeRouter);

export default router;
```

**new_string:**
```javascript
import express from 'express';
import realtimeRouter from './realtime.js';
import profileRouter from './profile.js';
import entitlementRouter from './entitlement.js';
import accountRouter from './account.js';
import behaviorRouter from './behavior.js';
import feelingRouter from './feeling.js';
import nudgeRouter from './nudge.js';
import dailyMetricsRouter from './dailyMetrics.js';

const router = express.Router();

router.use('/realtime', realtimeRouter);
router.use('/profile', profileRouter);
router.use('/entitlement', entitlementRouter);
router.use('/account', accountRouter);
router.use('/behavior', behaviorRouter);
router.use('/feeling', feelingRouter);
router.use('/nudge', nudgeRouter);
router.use('/daily_metrics', dailyMetricsRouter);

export default router;
```

---

## パッチ23: バックエンド - behavior/summary に streaks フィールド追加

**ファイル:** `apps/api/src/routes/mobile/behavior.js`

**old_string:**
```javascript
    return res.json({
      todayInsight,
      highlights,
      futureScenario,
      timeline
    });
```

**new_string:**
```javascript
    // Calculate streaks from recent daily_metrics
    const streaks = await calculateStreaks(userId);
    
    return res.json({
      todayInsight,
      highlights,
      futureScenario,
      timeline,
      streaks
    });
```

さらに、ファイル末尾に以下の関数を追加:

**追加:**
```javascript
async function calculateStreaks(userId) {
  const prisma = (await import('../../prisma/client.js')).default;
  
  try {
    // Get last 30 days of metrics
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const metrics = await prisma.dailyMetrics.findMany({
      where: {
        userId,
        date: { gte: thirtyDaysAgo }
      },
      orderBy: { date: 'desc' }
    });
    
    // Calculate consecutive days for each category
    let wake = 0, screen = 0, workout = 0, rumination = 0;
    
    for (const m of metrics) {
      // Wake streak: has wakeAt recorded
      if (m.wakeAt) wake++;
      else break;
    }
    
    // Reset and calculate screen streak
    for (const m of metrics) {
      if (m.screenTimeMinutes !== null && m.screenTimeMinutes < 180) screen++;
      else break;
    }
    
    // Workout streak: steps >= 5000
    for (const m of metrics) {
      if (m.steps !== null && m.steps >= 5000) workout++;
      else break;
    }
    
    // Rumination streak: low rumination proxy (placeholder)
    for (const m of metrics) {
      if (m.ruminationProxy !== null && m.ruminationProxy < 0.5) rumination++;
      else break;
    }
    
    return { wake, screen, workout, rumination };
  } catch (e) {
    logger.warn('Failed to calculate streaks', e);
    return { wake: 0, screen: 0, workout: 0, rumination: 0 };
  }
}
```

---

## パッチ24: iOS - BehaviorSummary に streaks フィールド追加

**ファイル:** `aniccaios/aniccaios/Models/BehaviorSummary.swift`

**old_string:**
```swift
struct BehaviorSummary: Codable, Equatable {
    let todayInsight: String
    let highlights: Highlights
    let futureScenario: FutureScenario
    let timeline: [TimelineSegment]
```

**new_string:**
```swift
struct BehaviorSummary: Codable, Equatable {
    let todayInsight: String
    let highlights: Highlights
    let futureScenario: FutureScenario
    let timeline: [TimelineSegment]
    let streaks: Streaks?
    
    struct Streaks: Codable, Equatable {
        let wake: Int
        let screen: Int
        let workout: Int
        let rumination: Int
    }
```

---

## パッチ25: Prisma スキーマに dailyMetrics モデル追加（既存確認が必要）

**ファイル:** `apps/api/prisma/schema.prisma`

**追加（もし存在しない場合）:**
```prisma
model DailyMetrics {
  id                String   @id @default(cuid())
  userId            String
  deviceId          String?
  date              DateTime
  timezone          String   @default("UTC")
  sleepMinutes      Int?
  steps             Int?
  screenTimeMinutes Int?
  sedentaryMinutes  Int?
  wakeAt            DateTime?
  ruminationProxy   Float?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([userId, date])
  @@map("daily_metrics")
}
```

---

## パッチ26: TabBar 固定・背景付き

**ファイル:** `aniccaios/aniccaios/MainTabView.swift`

**変更内容:** TabBarを「下部固定＋背景付き」にしてスクショ通りに

**追加:**
```swift
// body の TabView の後に追加
.onAppear {
    let appearance = UITabBarAppearance()
    appearance.configureWithOpaqueBackground()
    appearance.backgroundColor = UIColor(AppTheme.Colors.background)
    UITabBar.appearance().standardAppearance = appearance
    UITabBar.appearance().scrollEdgeAppearance = appearance
}
```

---

# 完全なパッチ一覧（最終確認）

| 番号 | 対象 | 内容 |
|------|------|------|
| 1 | iOS | SDP エンドポイントを `/v1/realtime/calls` に修正 |
| 2 | iOS | Info.plist に BGTaskSchedulerPermittedIdentifiers 追加 |
| 3-4 | iOS | Profile: Language行削除、Traitsキーワード削除 |
| 5-6 | iOS | Talk: タイトルをヘッダに変更 |
| 7A-D | iOS | **Session: 完全なデザイン反映（Orb/Body/TopicPill/Controls）** |
| 8-11 | iOS | MetricsUploader、HealthKit/ScreenTime/Motion Manager |
| 12-14 | iOS | Data Integration 権限連携、Ideals/Struggles 連携 |
| 15-16 | iOS | ストリークをサーバーベースに |
| 17 | iOS | Info.plist に HealthKit/Motion 使用説明追加 |
| 18-19 | iOS | Plan 画面修正（SettingsView パターンに統一、ManageSubscriptionSheet 削除） |
| 20-21 | バックエンド | daily_metrics エンドポイント追加 |
| 22 | バックエンド | behavior/summary に streaks 追加 |
| 23 | iOS | BehaviorSummary に streaks 追加 |
| 24 | バックエンド | Prisma スキーマ追加 |
| 25 | iOS | MainTabView に TabBar appearance 設定 |

---

### To-dos（実装順）

**P0: 最優先（アプリ動作不能を解消）**
- [ ] パッチ1: VoiceSessionController - SDP エンドポイントを `/v1/realtime/calls` に修正
- [ ] パッチ2: Info.plist - BGTaskSchedulerPermittedIdentifiers を追加

**P1: UI完全一致（スクショ通りに）**
- [ ] パッチ3-4: ProfileView - Language行削除、Traitsキーワード削除
- [ ] パッチ5-6: TalkView - タイトル表示をヘッダに変更
- [ ] パッチ7A-D: **Session完全反映（OrbView/Body/TopicPill/ControlsRow）** ← session.html準拠
- [ ] パッチ25: MainTabView - TabBar appearance 設定（固定・背景付き）

**P2: Data Integration・バックエンド連携**
- [ ] パッチ8: MetricsUploader - BGTaskスケジュールとアップロード実装
- [ ] パッチ9-11: HealthKitManager/ScreenTimeManager/MotionManager 新規作成
- [ ] パッチ12-14: ProfileView - Data Integration トグルに権限リクエスト接続、Ideals/Struggles連携
- [ ] パッチ15-16: BehaviorView - ストリークをサーバーベースに変更
- [ ] パッチ17: Info.plist - HealthKit/Motion 使用説明を追加
- [ ] パッチ18-19: Plan 画面修正（SettingsView パターンに統一）
- [ ] パッチ20-21: バックエンド - /api/mobile/daily_metrics エンドポイント実装
- [ ] パッチ22-24: バックエンド/iOS - streaks 追加