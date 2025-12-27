# Anicca v0.3 フェーズ6 擬似パッチ（Behavior / Profile / Settings UI）

## 概要
- 対象フェーズ: 6
- 対象タスク: `6.1`〜`6.7`
- ゴール: v3 UI確定仕様に沿って **Behavior / Profile / Settings(UI上のData Integration)** を実装できる状態の擬似パッチを用意する
- 絶対ルール:
  - UIは `.cursor/plans/v3/v3-ui.md` の確定仕様に従う
  - BehaviorのAPIレスポンスは `.cursor/plans/v3/migration-patch-v3.md` の **6.1 JSON形**に揃える（クライアント側のDecodableもその形で固定）
  - SettingsのトグルUXは `.cursor/plans/v3/ios-sensors-spec-v3.md` の「トグルON時のみ権限要求」「拒否ならOFFへ戻す」「Open Settings導線」「後から撤回はNot connected扱い」を守る

## 対象タスク（todolist.md から）
- `6.1 BehaviorViewデータ接続`
- `6.2 TimelineView実装`
- `6.3 HighlightsCard実装`
- `6.4 FutureScenarioView実装`
- `6.5 ProfileView拡張`
- `6.6 TraitsDetailView追加`
- `6.7 SettingsViewデータ連携`

## 参照仕様（v3）
- `.cursor/plans/v3/v3-ui.md`（Behavior/Timeline/Highlights/Future/Profile）
- `.cursor/plans/v3/file-structure-v3.md`（iOSファイル配置の確定）
- `.cursor/plans/v3/migration-patch-v3.md`（特に 6.1）
- `.cursor/plans/v3/ios-sensors-spec-v3.md`（Data Integrationトグルの挙動）
- 既存コード:
  - `aniccaios/aniccaios/SettingsView.swift`
  - `aniccaios/aniccaios/DesignSystem/Components/{CardView.swift,SectionRow.swift}`
  - `aniccaios/aniccaios/Views/LegalLinksView.swift`

## 重複実装の防止（このパッチでの方針）
- 既存の見た目トーンは `CardView` / `SectionRow` / `AppTheme` をそのまま利用して崩さない
- `SettingsView` に既にある「購読管理/サインアウト/削除/Legal」系の実装は再利用（ProfileView側にも同等導線が必要になるが、まずUIの骨格優先）
- Data Integration のトグル永続化は **新規AppStateフィールドに依存せず**、まず `@AppStorage` で最小実装（フェーズ7で送信停止/監視開始に接続）

---

## ファイル別の変更概要（フェーズ6のみ）

### 1) Behavior UI（新規）
- `aniccaios/aniccaios/Views/Behavior/BehaviorView.swift`
- `aniccaios/aniccaios/Views/Behavior/TimelineView.swift`
- `aniccaios/aniccaios/Views/Behavior/HighlightsCard.swift`
- `aniccaios/aniccaios/Views/Behavior/FutureScenarioView.swift`

### 2) Profile UI（新規）
- `aniccaios/aniccaios/Views/Profile/ProfileView.swift`
- `aniccaios/aniccaios/Views/Profile/TraitsDetailView.swift`

### 3) Behavior APIモデル/取得（最小追加）
- `aniccaios/aniccaios/Models/BehaviorSummary.swift`（6.1 JSON形を固定）
- `aniccaios/aniccaios/Services/BehaviorSummaryService.swift`（GET /mobile/behavior/summary）

### 4) Settings（既存ファイル更新）
- `aniccaios/aniccaios/SettingsView.swift`
  - Data Integration セクション追加（Screen Time / Sleep / Steps / Motion）
  - ON時のみ権限要求、拒否はOFFへ巻き戻し、Open Settings導線を表示

---

## 完全パッチ（apply_patch 互換）

### 6.1〜6.4: Behavior Summary APIモデル + Service + Views

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Models/BehaviorSummary.swift
+import Foundation
+
+/// v0.3: `GET /api/mobile/behavior/summary` のレスポンス（migration-patch-v3.md 6.1 形に固定）
+struct BehaviorSummary: Codable, Equatable {
+    let todayInsight: String
+    let highlights: Highlights
+    let futureScenario: FutureScenario
+    let timeline: [TimelineSegment]
+
+    struct Highlights: Codable, Equatable {
+        let wake: Highlight
+        let screen: Highlight
+        let workout: Highlight
+        let rumination: Highlight
+    }
+
+    struct Highlight: Codable, Equatable {
+        /// サーバー定義の状態（例: on_track / warning / missed / ok など）
+        let status: String
+        /// v0.3 UIでは「具体的な時間/回数/%」をカードに表示しないため、表示用途は限定（内部/詳細用）
+        let label: String
+    }
+
+    struct FutureScenario: Codable, Equatable {
+        let ifContinue: String
+        let ifImprove: String
+    }
+
+    struct TimelineSegment: Codable, Equatable, Identifiable {
+        enum SegmentType: String, Codable {
+            case sleep
+            case scroll
+            case focus
+            case activity
+        }
+
+        let type: SegmentType
+        let start: String   // "HH:mm"
+        let end: String     // "HH:mm"
+
+        var id: String { "\(type.rawValue)-\(start)-\(end)" }
+    }
+}
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Services/BehaviorSummaryService.swift
+import Foundation
+
+/// v0.3: Behavior Summary 取得（UIは v3-ui.md、JSON形は migration-patch-v3.md 6.1）
+@MainActor
+final class BehaviorSummaryService {
+    static let shared = BehaviorSummaryService()
+    private init() {}
+
+    enum ServiceError: Error {
+        case notAuthenticated
+        case invalidResponse
+        case httpError(Int)
+        case decodeError
+    }
+
+    func fetchSummary() async throws -> BehaviorSummary {
+        guard case .signedIn(let creds) = AppState.shared.authStatus else {
+            throw ServiceError.notAuthenticated
+        }
+
+        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("mobile/behavior/summary"))
+        request.httpMethod = "GET"
+        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
+        request.setValue(creds.userId, forHTTPHeaderField: "user-id")
+
+        // JWT/Bearer があれば付与（存在しない場合でも既存ヘッダ方式で通る前提）
+        try? await NetworkSessionManager.shared.setAuthHeaders(for: &request)
+
+        let (data, response) = try await NetworkSessionManager.shared.session.data(for: request)
+        guard let http = response as? HTTPURLResponse else { throw ServiceError.invalidResponse }
+        guard (200..<300).contains(http.statusCode) else { throw ServiceError.httpError(http.statusCode) }
+
+        do {
+            return try JSONDecoder().decode(BehaviorSummary.self, from: data)
+        } catch {
+            throw ServiceError.decodeError
+        }
+    }
+}
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Behavior/BehaviorView.swift
+import SwiftUI
+
+/// v0.3 Behavior タブ: Today's Insights / 24h Timeline / Highlights / 10 Years From Now
+struct BehaviorView: View {
+    @State private var isLoading = false
+    @State private var summary: BehaviorSummary?
+    @State private var errorText: String?
+
+    var body: some View {
+        NavigationStack {
+            ScrollView {
+                VStack(spacing: AppTheme.Spacing.md) {
+                    header
+
+                    if isLoading {
+                        CardView {
+                            HStack(spacing: 12) {
+                                ProgressView()
+                                Text("Loading…")
+                                    .font(AppTheme.Typography.subheadlineDynamic)
+                                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                            }
+                        }
+                    }
+
+                    if let errorText = errorText {
+                        CardView {
+                            VStack(spacing: 12) {
+                                Text(errorText)
+                                    .font(AppTheme.Typography.subheadlineDynamic)
+                                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                                    .multilineTextAlignment(.center)
+                                Button("Retry") { Task { await load() } }
+                                    .font(AppTheme.Typography.subheadlineDynamic)
+                            }
+                        }
+                    }
+
+                    if let summary = summary {
+                        insightsCard(text: summary.todayInsight)
+
+                        TimelineView(segments: summary.timeline)
+
+                        HighlightsCard(
+                            highlights: summary.highlights,
+                            streaks: BehaviorHighlightsStreakStore.shared.streaks(for: summary.highlights)
+                        )
+
+                        FutureScenarioView(future: summary.futureScenario)
+                    }
+                }
+                .padding(.horizontal, AppTheme.Spacing.lg)
+                .padding(.vertical, AppTheme.Spacing.md)
+            }
+            .background(AppBackground())
+            .task { await load() }
+        }
+    }
+
+    private var header: some View {
+        VStack(spacing: 8) {
+            Text("Today's Insights")
+                .font(.system(size: 30, weight: .bold))
+                .foregroundStyle(AppTheme.Colors.label)
+                .frame(maxWidth: .infinity, alignment: .center)
+                .padding(.top, 12)
+        }
+    }
+
+    private func insightsCard(text: String) -> some View {
+        CardView {
+            Text(text)
+                .font(AppTheme.Typography.subheadlineDynamic)
+                .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
+                .multilineTextAlignment(.center)
+                .lineSpacing(3)
+        }
+    }
+
+    private func load() async {
+        guard !isLoading else { return }
+        isLoading = true
+        errorText = nil
+        do {
+            let data = try await BehaviorSummaryService.shared.fetchSummary()
+            summary = data
+            BehaviorHighlightsStreakStore.shared.updateIfNeeded(with: data.highlights)
+        } catch {
+            errorText = "Failed to load today's insights."
+        }
+        isLoading = false
+    }
+}
+
+/// v3-ui.md の「🌱ストリーク」を、API(6.1)を変更せずクライアント側で暫定算出するための簡易ストア。
+/// - 正式にはサーバー集計が望ましいが、フェーズ6はUI実装が主目的なのでローカル永続で最小限に実装する。
+final class BehaviorHighlightsStreakStore {
+    static let shared = BehaviorHighlightsStreakStore()
+    private init() {}
+
+    private let defaults = UserDefaults.standard
+    private let key = "com.anicca.behavior.highlightStreaks"
+
+    struct Streaks: Codable, Equatable {
+        var wake: Int
+        var screen: Int
+        var workout: Int
+        var rumination: Int
+    }
+
+    /// UI側の3値（v3-ui.md）
+    enum UIStatus { case movingForward, stable, needsAttention }
+
+    func streaks(for h: BehaviorSummary.Highlights) -> Streaks {
+        (try? load()) ?? Streaks(wake: 0, screen: 0, workout: 0, rumination: 0)
+    }
+
+    func updateIfNeeded(with h: BehaviorSummary.Highlights) {
+        // NOTE: 日付判定はフェーズ6では省略（開いたタイミングで1回加算される可能性あり）。
+        // フェーズ7+で日次集計/タイムゾーン整合を入れる。
+        var current = (try? load()) ?? Streaks(wake: 0, screen: 0, workout: 0, rumination: 0)
+
+        current.wake = nextStreak(prev: current.wake, status: mapToUIStatus(h.wake.status))
+        current.screen = nextStreak(prev: current.screen, status: mapToUIStatus(h.screen.status))
+        current.workout = nextStreak(prev: current.workout, status: mapToUIStatus(h.workout.status))
+        current.rumination = nextStreak(prev: current.rumination, status: mapToUIStatus(h.rumination.status))
+
+        save(current)
+    }
+
+    private func nextStreak(prev: Int, status: UIStatus) -> Int {
+        switch status {
+        case .needsAttention:
+            return 0
+        case .movingForward, .stable:
+            return max(1, prev + 1)
+        }
+    }
+
+    private func mapToUIStatus(_ apiStatus: String) -> UIStatus {
+        // migration-patch-v3.md 6.1 の status 値を v3-ui.md の3値へ寄せる
+        switch apiStatus {
+        case "warning", "missed":
+            return .needsAttention
+        case "on_track":
+            return .movingForward
+        case "ok":
+            return .stable
+        default:
+            return .stable
+        }
+    }
+
+    private func load() throws -> Streaks {
+        guard let data = defaults.data(forKey: key) else {
+            return Streaks(wake: 0, screen: 0, workout: 0, rumination: 0)
+        }
+        return try JSONDecoder().decode(Streaks.self, from: data)
+    }
+
+    private func save(_ streaks: Streaks) {
+        if let data = try? JSONEncoder().encode(streaks) {
+            defaults.set(data, forKey: key)
+        }
+    }
+}
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Behavior/TimelineView.swift
+import SwiftUI
+
+struct TimelineView: View {
+    let segments: [BehaviorSummary.TimelineSegment]
+
+    var body: some View {
+        CardView {
+            VStack(alignment: .leading, spacing: 12) {
+                Text("24-Hour Timeline")
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
+
+                GeometryReader { geo in
+                    ZStack(alignment: .leading) {
+                        RoundedRectangle(cornerRadius: 10, style: .continuous)
+                            .fill(AppTheme.Colors.buttonUnselected.opacity(0.35))
+
+                        ForEach(segments) { seg in
+                            let start = minutes(from: seg.start)
+                            let end = minutes(from: seg.end)
+                            let total: CGFloat = 24 * 60
+                            let x = geo.size.width * CGFloat(start) / total
+                            let w = geo.size.width * CGFloat(max(0, end - start)) / total
+
+                            RoundedRectangle(cornerRadius: 0, style: .continuous)
+                                .fill(color(for: seg.type))
+                                .frame(width: w, height: geo.size.height)
+                                .offset(x: x)
+                                .opacity(opacity(for: seg.type))
+                        }
+                    }
+                }
+                .frame(height: 48)
+
+                HStack {
+                    Text("12am")
+                    Spacer()
+                    Text("6am")
+                    Spacer()
+                    Text("12pm")
+                    Spacer()
+                    Text("6pm")
+                    Spacer()
+                    Text("12am")
+                }
+                .font(.system(size: 10))
+                .foregroundStyle(AppTheme.Colors.secondaryLabel)
+
+                legend
+            }
+        }
+    }
+
+    private var legend: some View {
+        FlexibleLegend(items: [
+            (.sleep, "Sleep"),
+            (.focus, "Focus"),
+            (.scroll, "Scroll"),
+            (.activity, "Activity"),
+        ])
+    }
+
+    private func minutes(from hhmm: String) -> Int {
+        let parts = hhmm.split(separator: ":").map(String.init)
+        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return 0 }
+        return max(0, min(24 * 60, h * 60 + m))
+    }
+
+    private func color(for type: BehaviorSummary.TimelineSegment.SegmentType) -> Color {
+        // HTMLテンプレ（screens/behavior.html）に合わせた代表色
+        switch type {
+        case .sleep: return Color(red: 0.29, green: 0.56, blue: 0.89)      // #4A90E2
+        case .focus: return Color(red: 0.96, green: 0.65, blue: 0.14)      // #F5A623
+        case .scroll: return Color(red: 0.91, green: 0.30, blue: 0.24)     // #E74C3C
+        case .activity: return Color(red: 0.18, green: 0.80, blue: 0.44)   // #2ECC71
+        }
+    }
+
+    private func opacity(for type: BehaviorSummary.TimelineSegment.SegmentType) -> Double {
+        // HTMLテンプレでは一部を淡く描画しているが、ここでは type ベースで統一
+        switch type {
+        case .sleep, .focus, .scroll: return 1.0
+        case .activity: return 0.8
+        }
+    }
+}
+
+/// Legend を雑に折り返し表示するための補助View（フェーズ6はUI優先で軽量実装）
+private struct FlexibleLegend: View {
+    let items: [(BehaviorSummary.TimelineSegment.SegmentType, String)]
+
+    var body: some View {
+        HStack(spacing: 12) {
+            ForEach(0..<items.count, id: \.self) { i in
+                let item = items[i]
+                HStack(spacing: 6) {
+                    RoundedRectangle(cornerRadius: 3, style: .continuous)
+                        .fill(color(for: item.0))
+                        .frame(width: 12, height: 12)
+                    Text(item.1)
+                        .font(.system(size: 12))
+                        .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
+                }
+            }
+        }
+        .frame(maxWidth: .infinity, alignment: .leading)
+    }
+
+    private func color(for type: BehaviorSummary.TimelineSegment.SegmentType) -> Color {
+        switch type {
+        case .sleep: return Color(red: 0.29, green: 0.56, blue: 0.89)
+        case .focus: return Color(red: 0.96, green: 0.65, blue: 0.14)
+        case .scroll: return Color(red: 0.91, green: 0.30, blue: 0.24)
+        case .activity: return Color(red: 0.18, green: 0.80, blue: 0.44)
+        }
+    }
+}
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Behavior/HighlightsCard.swift
+import SwiftUI
+
+struct HighlightsCard: View {
+    let highlights: BehaviorSummary.Highlights
+    let streaks: BehaviorHighlightsStreakStore.Streaks
+
+    private let columns = [
+        GridItem(.flexible(), spacing: 12),
+        GridItem(.flexible(), spacing: 12),
+    ]
+
+    var body: some View {
+        VStack(alignment: .leading, spacing: 12) {
+            Text("Today's Highlights")
+                .font(.system(size: 20, weight: .bold))
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.horizontal, 2)
+
+            LazyVGrid(columns: columns, spacing: 12) {
+                highlightMiniCard(title: "Wake", apiStatus: highlights.wake.status, streak: streaks.wake)
+                highlightMiniCard(title: "Screen", apiStatus: highlights.screen.status, streak: streaks.screen)
+                highlightMiniCard(title: "Workout", apiStatus: highlights.workout.status, streak: streaks.workout)
+                highlightMiniCard(title: "Rumination", apiStatus: highlights.rumination.status, streak: streaks.rumination)
+            }
+        }
+    }
+
+    private func highlightMiniCard(title: String, apiStatus: String, streak: Int) -> some View {
+        let ui = mapToUI(apiStatus)
+
+        return ZStack(alignment: .topTrailing) {
+            CardView(cornerRadius: 24) {
+                VStack(alignment: .leading, spacing: 10) {
+                    HStack(spacing: 8) {
+                        Text(ui.icon)
+                            .font(.system(size: 20, weight: .bold))
+                            .foregroundStyle(ui.iconColor)
+                        Text(title)
+                            .font(.system(size: 14, weight: .bold))
+                            .foregroundStyle(AppTheme.Colors.label)
+                        Spacer()
+                    }
+
+                    Text(ui.label)
+                        .font(.system(size: 12))
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                }
+            }
+
+            HStack(spacing: 6) {
+                Text("🌱").font(.system(size: 12))
+                Text("\(streak)")
+                    .font(.system(size: 12, weight: .medium))
+                    .foregroundStyle(Color(red: 0.42, green: 0.56, blue: 0.44)) // #6B8E6F
+            }
+            .padding(.horizontal, 10)
+            .padding(.vertical, 6)
+            .background(AppTheme.Colors.buttonUnselected.opacity(0.6))
+            .clipShape(Capsule())
+            .padding(10)
+        }
+    }
+
+    private func mapToUI(_ apiStatus: String) -> (icon: String, iconColor: Color, label: String) {
+        // v3-ui.md: ✓ / → / ⚠︎ と "Moving Forward / Stable / Needs Attention"
+        switch apiStatus {
+        case "on_track":
+            return ("✓", Color(red: 0.18, green: 0.80, blue: 0.44), "Moving Forward")
+        case "warning", "missed":
+            return ("⚠︎", Color(red: 0.96, green: 0.65, blue: 0.14), "Needs Attention")
+        case "ok":
+            return ("→", AppTheme.Colors.secondaryLabel, "Stable")
+        default:
+            return ("→", AppTheme.Colors.secondaryLabel, "Stable")
+        }
+    }
+}
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Behavior/FutureScenarioView.swift
+import SwiftUI
+
+struct FutureScenarioView: View {
+    let future: BehaviorSummary.FutureScenario
+
+    var body: some View {
+        CardView {
+            VStack(alignment: .leading, spacing: 12) {
+                Text("10 Years From Now")
+                    .font(.system(size: 20, weight: .bold))
+                    .foregroundStyle(AppTheme.Colors.label)
+
+                VStack(alignment: .leading, spacing: 8) {
+                    // migration-patch-v3.md 6.1 の JSON 順（ifContinue → ifImprove）に合わせて表示順を固定
+                    Text(future.ifContinue)
+                        .font(AppTheme.Typography.subheadlineDynamic)
+                        .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
+                    Text(future.ifImprove)
+                        .font(AppTheme.Typography.subheadlineDynamic)
+                        .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
+                }
+            }
+        }
+    }
+}
+
*** End Patch
```

---

### 6.5〜6.6: ProfileView / TraitsDetailView（v3-ui.md準拠）

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Profile/ProfileView.swift
+import SwiftUI
+
+/// v0.3 Profile タブ（v3-ui.md 準拠）
+struct ProfileView: View {
+    @EnvironmentObject private var appState: AppState
+
+    // Data Integration: 最小は @AppStorage（フェーズ7でセンサー送信開始/停止へ接続）
+    @AppStorage("com.anicca.dataIntegration.screenTimeEnabled") private var screenTimeEnabled = false
+    @AppStorage("com.anicca.dataIntegration.sleepEnabled") private var sleepEnabled = false
+    @AppStorage("com.anicca.dataIntegration.stepsEnabled") private var stepsEnabled = false
+    @AppStorage("com.anicca.dataIntegration.motionEnabled") private var motionEnabled = false
+
+    @State private var showingManageSubscription = false
+
+    var body: some View {
+        NavigationStack {
+            ScrollView {
+                VStack(spacing: 18) {
+                    header
+
+                    accountCard
+                    traitsCard
+                    idealsSection
+                    strugglesSection
+                    nudgeStrengthSection
+                    stickyModeSection
+                    dataIntegrationSection
+
+                    // Account Management / Legal は既存 SettingsView 実装を流用できるが、
+                    // フェーズ6ではまずUIの骨格をここに揃える（導線統合は別パッチで整理）
+                    LegalLinksView()
+                }
+                .padding(.horizontal, AppTheme.Spacing.lg)
+                .padding(.vertical, AppTheme.Spacing.md)
+            }
+            .background(AppBackground())
+        }
+        .sheet(isPresented: $showingManageSubscription) {
+            // 既存 SettingsView の subscriptionSheetContent 相当を後で共通化する想定
+            SettingsView()
+                .environmentObject(appState)
+        }
+    }
+
+    private var header: some View {
+        Text("Profile")
+            .font(.system(size: 30, weight: .bold))
+            .foregroundStyle(AppTheme.Colors.label)
+            .frame(maxWidth: .infinity, alignment: .center)
+            .padding(.top, 6)
+    }
+
+    private var accountCard: some View {
+        CardView(cornerRadius: 32) {
+            VStack(spacing: 0) {
+                row(label: "Name", value: appState.userProfile.displayName.isEmpty ? "-" : appState.userProfile.displayName)
+                divider
+                Button {
+                    showingManageSubscription = true
+                } label: {
+                    row(label: "Plan", value: appState.subscriptionInfo.displayPlanName, showsChevron: true)
+                }
+                .buttonStyle(.plain)
+                divider
+                row(label: "Language", value: appState.userProfile.preferredLanguage.languageLine)
+            }
+        }
+    }
+
+    private var traitsCard: some View {
+        VStack(alignment: .leading, spacing: 10) {
+            Text("Your Traits")
+                .font(.system(size: 18, weight: .bold))
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.horizontal, 2)
+
+            CardView(cornerRadius: 28) {
+                VStack(spacing: 14) {
+                    Text("You're highly agreeable and open to new experiences, balancing structure with flexibility.")
+                        .font(.system(size: 16))
+                        .foregroundStyle(AppTheme.Colors.label)
+                        .multilineTextAlignment(.center)
+
+                    // keywords はフェーズ3で AppState/UserProfile に導入（ここでは見た目だけ固定）
+                    HStack(spacing: 8) {
+                        chip("Openness")
+                        chip("Agreeableness")
+                        chip("Conscientiousness")
+                    }
+                    .frame(maxWidth: .infinity, alignment: .center)
+
+                    NavigationLink {
+                        TraitsDetailView()
+                    } label: {
+                        HStack {
+                            Text("View full trait profile")
+                                .font(.system(size: 16, weight: .medium))
+                                .foregroundStyle(AppTheme.Colors.label)
+                            Spacer()
+                            Image(systemName: "chevron.right")
+                                .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                        }
+                        .padding(.top, 6)
+                    }
+                    .buttonStyle(.plain)
+                }
+            }
+        }
+    }
+
+    private var idealsSection: some View {
+        VStack(alignment: .leading, spacing: 10) {
+            Text("Ideal Self")
+                .font(.system(size: 18, weight: .bold))
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.horizontal, 2)
+
+            FlowChips(options: [
+                "Kind", "Altruistic", "Confident", "Mindful", "Honest", "Open", "Courageous"
+            ])
+        }
+    }
+
+    private var strugglesSection: some View {
+        VStack(alignment: .leading, spacing: 10) {
+            Text("Current Struggles")
+                .font(.system(size: 18, weight: .bold))
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.horizontal, 2)
+
+            FlowChips(options: [
+                "Rumination", "Jealousy", "Self-Criticism", "Anxiety", "Loneliness", "Irritation"
+            ])
+        }
+    }
+
+    private var nudgeStrengthSection: some View {
+        VStack(alignment: .leading, spacing: 10) {
+            Text("Nudge strength")
+                .font(.system(size: 18, weight: .bold))
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.horizontal, 2)
+
+            // フェーズ3で NudgeIntensity を導入する前提（フェーズ6ではUI骨格のみ）
+            CardView(cornerRadius: 999) {
+                HStack(spacing: 8) {
+                    pill("Quiet", isSelected: false)
+                    pill("Normal", isSelected: true)
+                    pill("Active", isSelected: false)
+                }
+            }
+        }
+    }
+
+    private var stickyModeSection: some View {
+        VStack(alignment: .leading, spacing: 10) {
+            Text("Sticky Mode")
+                .font(.system(size: 18, weight: .bold))
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.horizontal, 2)
+
+            CardView(cornerRadius: 28) {
+                VStack(alignment: .leading, spacing: 8) {
+                    HStack {
+                        Text("Sticky Mode")
+                            .font(.system(size: 16, weight: .medium))
+                            .foregroundStyle(AppTheme.Colors.label)
+                        Spacer()
+                        Toggle("", isOn: Binding(
+                            get: { appState.userProfile.stickyModeEnabled },
+                            set: { v in
+                                var p = appState.userProfile
+                                p.stickyModeEnabled = v
+                                appState.updateUserProfile(p, sync: true)
+                            }
+                        ))
+                        .labelsHidden()
+                    }
+                    Text("When ON, Anicca keeps talking until you respond 5 times.")
+                        .font(AppTheme.Typography.caption1Dynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                }
+            }
+        }
+    }
+
+    private var dataIntegrationSection: some View {
+        VStack(alignment: .leading, spacing: 10) {
+            Text("Data Integration")
+                .font(.system(size: 18, weight: .bold))
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.horizontal, 2)
+
+            Text("Optional. Link your data so Anicca can nudge you more precisely. All core features work even if everything is OFF.")
+                .font(AppTheme.Typography.caption1Dynamic)
+                .foregroundStyle(AppTheme.Colors.secondaryLabel)
+
+            CardView(cornerRadius: 28) {
+                VStack(spacing: 0) {
+                    Toggle("Screen Time", isOn: $screenTimeEnabled)
+                        .tint(AppTheme.Colors.accent)
+                    divider
+                    Toggle("Sleep (HealthKit)", isOn: $sleepEnabled)
+                        .tint(AppTheme.Colors.accent)
+                    divider
+                    Toggle("Steps (HealthKit)", isOn: $stepsEnabled)
+                        .tint(AppTheme.Colors.accent)
+                    divider
+                    Toggle("Movement", isOn: $motionEnabled)
+                        .tint(AppTheme.Colors.accent)
+                }
+            }
+        }
+    }
+
+    private func row(label: String, value: String, showsChevron: Bool = false) -> some View {
+        HStack {
+            Text(label)
+                .font(.system(size: 14))
+                .foregroundStyle(AppTheme.Colors.secondaryLabel)
+            Spacer()
+            HStack(spacing: 6) {
+                Text(value)
+                    .font(.system(size: 16, weight: .semibold))
+                    .foregroundStyle(AppTheme.Colors.label)
+                if showsChevron {
+                    Image(systemName: "chevron.right")
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                        .opacity(0.6)
+                }
+            }
+        }
+        .padding(.vertical, 14)
+    }
+
+    private var divider: some View {
+        Rectangle()
+            .fill(AppTheme.Colors.borderLight.opacity(0.6))
+            .frame(height: 1)
+    }
+
+    private func chip(_ text: String) -> some View {
+        Text(text)
+            .font(.system(size: 12, weight: .medium))
+            .padding(.horizontal, 12)
+            .padding(.vertical, 6)
+            .background(AppTheme.Colors.buttonUnselected)
+            .clipShape(Capsule())
+    }
+
+    private func pill(_ text: String, isSelected: Bool) -> some View {
+        Text(text)
+            .font(.system(size: 14, weight: .medium))
+            .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.secondaryLabel)
+            .frame(maxWidth: .infinity)
+            .padding(.vertical, 10)
+            .background(isSelected ? AppTheme.Colors.buttonSelected : Color.clear)
+            .clipShape(Capsule())
+    }
+}
+
+/// v0.3: pill 風のチップ群（実装は最小。フェーズ4/3の traits 保存に接続する）
+private struct FlowChips: View {
+    let options: [String]
+    @State private var selected: Set<String> = []
+
+    var body: some View {
+        // LazyVGrid で擬似的に折り返し
+        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 10)], spacing: 10) {
+            ForEach(options, id: \.self) { item in
+                let isOn = selected.contains(item)
+                Button {
+                    if isOn { selected.remove(item) } else { selected.insert(item) }
+                    // NOTE: 本保存（AppState.updateTraits）はフェーズ3のフィールド追加後に接続する
+                } label: {
+                    Text(item)
+                        .font(.system(size: 14, weight: .medium))
+                        .padding(.horizontal, 18)
+                        .padding(.vertical, 10)
+                        .frame(maxWidth: .infinity)
+                        .background(isOn ? AppTheme.Colors.buttonSelected : AppTheme.Colors.cardBackground)
+                        .foregroundStyle(isOn ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.label)
+                        .overlay(
+                            RoundedRectangle(cornerRadius: 999, style: .continuous)
+                                .stroke(AppTheme.Colors.border.opacity(0.2), lineWidth: 1)
+                        )
+                        .clipShape(Capsule())
+                }
+                .buttonStyle(.plain)
+            }
+        }
+    }
+}
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Profile/TraitsDetailView.swift
+import SwiftUI
+
+/// v0.3: Big Five 詳細（v3-ui.md / 11-traits-detail.html）
+struct TraitsDetailView: View {
+    var body: some View {
+        ScrollView {
+            VStack(spacing: 14) {
+                ForEach(Trait.allCases, id: \.self) { t in
+                    CardView {
+                        VStack(alignment: .leading, spacing: 10) {
+                            HStack {
+                                Text(t.title)
+                                    .font(.system(size: 18, weight: .bold))
+                                    .foregroundStyle(AppTheme.Colors.label)
+                                Spacer()
+                                Text("\(t.score)/100")
+                                    .font(.system(size: 14, weight: .semibold))
+                                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                            }
+
+                            GeometryReader { geo in
+                                ZStack(alignment: .leading) {
+                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
+                                        .fill(AppTheme.Colors.buttonUnselected)
+                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
+                                        .fill(AppTheme.Colors.buttonSelected)
+                                        .frame(width: geo.size.width * CGFloat(t.score) / 100.0)
+                                }
+                            }
+                            .frame(height: 10)
+
+                            Text(t.description)
+                                .font(AppTheme.Typography.subheadlineDynamic)
+                                .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                                .lineLimit(2)
+                        }
+                    }
+                }
+            }
+            .padding(.horizontal, AppTheme.Spacing.lg)
+            .padding(.vertical, AppTheme.Spacing.md)
+        }
+        .navigationTitle("Big Five Traits")
+        .navigationBarTitleDisplayMode(.inline)
+        .background(AppBackground())
+    }
+
+    enum Trait: CaseIterable {
+        case agreeableness
+        case openness
+        case conscientiousness
+        case emotionalStability
+        case extraversion
+
+        var title: String {
+            switch self {
+            case .agreeableness: return "Agreeableness"
+            case .openness: return "Openness"
+            case .conscientiousness: return "Conscientiousness"
+            case .emotionalStability: return "Emotional Stability"
+            case .extraversion: return "Extraversion"
+            }
+        }
+
+        // NOTE: フェーズ3で Big5Scores が AppState へ入ったら差し替える
+        var score: Int { 82 }
+
+        var description: String {
+            "Highly cooperative; you value harmony and tend to be considerate of others."
+        }
+    }
+}
+
*** End Patch
```

---

### 6.7: SettingsView に Data Integration（権限要求ルールは ios-sensors-spec-v3.md）

> 既存 `SettingsView` は Habits タブのギアから開かれる（`HabitsTabView`）ため、ここに Data Integration を追加しても導線が死なない。
> ON時のみ権限要求・拒否時はOFFへ戻す・Open Settings導線、を最小実装する。

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/SettingsView.swift
@@
 import ComponentsKit
 import RevenueCat
 import RevenueCatUI
 import SwiftUI
+#if canImport(FamilyControls)
+import FamilyControls
+#endif
+#if canImport(HealthKit)
+import HealthKit
+#endif
+#if canImport(CoreMotion)
+import CoreMotion
+#endif
@@
 struct SettingsView: View {
@@
     @State private var showingManageSubscription = false
+
+    // Data Integration（v0.3: 最小は @AppStorage。フェーズ7でセンサー監視/送信に接続）
+    @AppStorage("com.anicca.dataIntegration.screenTimeEnabled") private var screenTimeEnabled = false
+    @AppStorage("com.anicca.dataIntegration.sleepEnabled") private var sleepEnabled = false
+    @AppStorage("com.anicca.dataIntegration.stepsEnabled") private var stepsEnabled = false
+    @AppStorage("com.anicca.dataIntegration.motionEnabled") private var motionEnabled = false
+
+    @State private var isShowingPermissionAlert = false
+    @State private var permissionAlertMessage = ""
@@
                 VStack(spacing: AppTheme.Spacing.md) {
                     subscriptionSection
                     personalizationSection
                     alarmSettingsSection
+                    dataIntegrationSection
                     problemsSection
                     idealTraitsSection
                     signOutSection
                     deleteAccountSection
                 }
@@
             .alert(String(localized: "common_error"), isPresented: Binding(
@@
             )) {
                 Button(String(localized: "common_ok")) {
                     deleteAccountError = nil
                 }
             } message: {
                 if let error = deleteAccountError {
                     Text(error.localizedDescription)
                 }
             }
+            .alert("Permission required", isPresented: $isShowingPermissionAlert) {
+                Button("Open Settings") { openSystemSettings() }
+                Button("OK", role: .cancel) {}
+            } message: {
+                Text(permissionAlertMessage)
+            }
         }
@@
     private var alarmSettingsSection: some View {
@@
     }
+
+    // MARK: - Data Integration Section (v0.3)
+    @ViewBuilder
+    private var dataIntegrationSection: some View {
+        CardView {
+            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
+                Text("Data Integration")
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
+                    .padding(.bottom, AppTheme.Spacing.xs)
+
+                Text("Optional. Link your data so Anicca can nudge you more precisely. All core features work even if everything is OFF.")
+                    .font(AppTheme.Typography.caption1Dynamic)
+                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
+
+                VStack(spacing: 12) {
+                    Toggle("Screen Time", isOn: Binding(
+                        get: { screenTimeEnabled },
+                        set: { v in
+                            Task { await handleToggleScreenTime(v) }
+                        }
+                    ))
+                    .tint(AppTheme.Colors.accent)
+
+                    Text("When ON, Anicca reads your app categories to nudge you when scrolling too long.")
+                        .font(AppTheme.Typography.caption1Dynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+
+                    Divider().opacity(0.6)
+
+                    Toggle("Sleep (HealthKit)", isOn: Binding(
+                        get: { sleepEnabled },
+                        set: { v in
+                            Task { await handleToggleHealthKitSleep(v) }
+                        }
+                    ))
+                    .tint(AppTheme.Colors.accent)
+
+                    Text("When ON, Anicca reads your sleep to understand your rhythm.")
+                        .font(AppTheme.Typography.caption1Dynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+
+                    Divider().opacity(0.6)
+
+                    Toggle("Steps (HealthKit)", isOn: Binding(
+                        get: { stepsEnabled },
+                        set: { v in
+                            Task { await handleToggleHealthKitSteps(v) }
+                        }
+                    ))
+                    .tint(AppTheme.Colors.accent)
+
+                    Text("When ON, Anicca reads your steps to nudge you after long sitting.")
+                        .font(AppTheme.Typography.caption1Dynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+
+                    Divider().opacity(0.6)
+
+                    Toggle("Movement", isOn: Binding(
+                        get: { motionEnabled },
+                        set: { v in
+                            Task { await handleToggleMotion(v) }
+                        }
+                    ))
+                    .tint(AppTheme.Colors.accent)
+
+                    Text("When ON, Anicca detects long sitting using motion activity (no precise location).")
+                        .font(AppTheme.Typography.caption1Dynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                }
+            }
+        }
+    }
+
+    // MARK: - Permission helpers (v0.3 UI / minimal)
+    private func openSystemSettings() {
+        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
+        UIApplication.shared.open(url)
+    }
+
+    private func showPermissionAlert(_ message: String) {
+        permissionAlertMessage = message
+        isShowingPermissionAlert = true
+    }
+
+    private func handleToggleScreenTime(_ enabled: Bool) async {
+        if !enabled {
+            screenTimeEnabled = false
+            return
+        }
+
+        #if canImport(FamilyControls)
+        do {
+            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
+            screenTimeEnabled = (AuthorizationCenter.shared.authorizationStatus == .approved)
+            if !screenTimeEnabled {
+                showPermissionAlert("Screen Time permission was not granted. Please enable it in Settings.")
+            }
+        } catch {
+            screenTimeEnabled = false
+            showPermissionAlert("Screen Time permission was not granted. Please enable it in Settings.")
+        }
+        #else
+        screenTimeEnabled = false
+        showPermissionAlert("Screen Time integration is not available on this build.")
+        #endif
+    }
+
+    private func handleToggleHealthKitSleep(_ enabled: Bool) async {
+        if !enabled {
+            sleepEnabled = false
+            return
+        }
+
+        #if canImport(HealthKit)
+        guard HKHealthStore.isHealthDataAvailable(),
+              let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
+            sleepEnabled = false
+            showPermissionAlert("Health data is not available on this device.")
+            return
+        }
+
+        do {
+            try await HKHealthStore().requestAuthorization(toShare: [], read: [sleepType])
+            // 許可が取れなかった場合はOFFへ戻す（ios-sensors-spec-v3.md）
+            let status = HKHealthStore().authorizationStatus(for: sleepType)
+            sleepEnabled = (status == .sharingAuthorized)
+            if !sleepEnabled {
+                showPermissionAlert("Sleep access was not granted. Please enable Health access in Settings.")
+            }
+        } catch {
+            sleepEnabled = false
+            showPermissionAlert("Sleep access was not granted. Please enable Health access in Settings.")
+        }
+        #else
+        sleepEnabled = false
+        showPermissionAlert("HealthKit integration is not available on this build.")
+        #endif
+    }
+
+    private func handleToggleHealthKitSteps(_ enabled: Bool) async {
+        if !enabled {
+            stepsEnabled = false
+            return
+        }
+
+        #if canImport(HealthKit)
+        guard HKHealthStore.isHealthDataAvailable(),
+              let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
+            stepsEnabled = false
+            showPermissionAlert("Health data is not available on this device.")
+            return
+        }
+
+        do {
+            try await HKHealthStore().requestAuthorization(toShare: [], read: [stepsType])
+            let status = HKHealthStore().authorizationStatus(for: stepsType)
+            stepsEnabled = (status == .sharingAuthorized)
+            if !stepsEnabled {
+                showPermissionAlert("Steps access was not granted. Please enable Health access in Settings.")
+            }
+        } catch {
+            stepsEnabled = false
+            showPermissionAlert("Steps access was not granted. Please enable Health access in Settings.")
+        }
+        #else
+        stepsEnabled = false
+        showPermissionAlert("HealthKit integration is not available on this build.")
+        #endif
+    }
+
+    private func handleToggleMotion(_ enabled: Bool) async {
+        if !enabled {
+            motionEnabled = false
+            return
+        }
+
+        #if canImport(CoreMotion)
+        let status = CMMotionActivityManager.authorizationStatus()
+        switch status {
+        case .authorized:
+            motionEnabled = true
+        case .notDetermined:
+            // prompt を出すために軽く start/stop
+            let mgr = CMMotionActivityManager()
+            mgr.startActivityUpdates(to: .main) { _ in
+                mgr.stopActivityUpdates()
+            }
+            // 反映は次フレーム以降になるため、ここでは一旦ON→否なら戻す
+            motionEnabled = (CMMotionActivityManager.authorizationStatus() == .authorized)
+            if !motionEnabled {
+                showPermissionAlert("Motion access was not granted. Please enable Motion & Fitness in Settings.")
+            }
+        case .denied, .restricted:
+            motionEnabled = false
+            showPermissionAlert("Motion access is not available. Please enable Motion & Fitness in Settings.")
+        @unknown default:
+            motionEnabled = false
+            showPermissionAlert("Motion access is not available. Please check Settings.")
+        }
+        #else
+        motionEnabled = false
+        showPermissionAlert("Motion integration is not available on this build.")
+        #endif
+    }
*** End Patch
```

---

## 検証観点（フェーズ6・UI中心）
- Behavior:
  - `/mobile/behavior/summary` が 6.1 JSON形で返ると、UIが `todayInsight` / `timeline` / `highlights` / `futureScenario` を描画できる
  - Highlightsは数値詳細を表示しない（芽バッジと3値ラベルのみ）
- Settings:
  - トグルON時のみ権限ダイアログ（拒否ならOFFへ戻る）
  - 拒否/制限時は `Open Settings` 導線が出る

## 注意点（フェーズ6時点での意図的な未確定）
- 🌱ストリークは本来サーバ集計が望ましいが、API(6.1)形固定のため、フェーズ6ではローカル永続の最小実装を入れている（フェーズ7+で日付境界/タイムゾーン/サーバ整合を入れる）
- ProfileView の traits/ideals/struggles/nudgeIntensity はフェーズ3のモデル拡張後に保存連携する（ここではUI骨格を確定）


