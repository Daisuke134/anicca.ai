# Anicca v0.3 フェーズ7（Sensors / MetricsUploader / AppState許可フラグ）擬似パッチ

対象: `.cursor/plans/v3/todolist.md` フェーズ7（7.1〜7.5）  
出力先: `.cursor/plans/v3/patches/phase-7/patch.md`  

---

## 概要

- **目的**: Sensors（DeviceActivity/FamilyControls, HealthKit, CoreMotion） + `MetricsUploader` + `AppState` 許可フラグ（フェーズ7）を、既存コードに沿う形で追加するための擬似パッチを固定する。
- **絶対ルール（quiet fallback）**:
  - `v3-stack.md` / `ios-sensors-spec-v3.md` に合わせ、**権限は「トグルON時だけ」要求**し、拒否・撤回時は **該当ドメインのDP/送信を静かに停止**する（Talk等の他機能は継続）。
  - **OSダイアログの連打（Permission bombing）禁止**。  

---

## 対象タスク（todolist.md から）

- **7.1** `DeviceActivityMonitor` 実装（`aniccaios/aniccaios/Sensors/DeviceActivityMonitor.swift`）
- **7.2** `HealthKitManager` 実装（`aniccaios/aniccaios/Sensors/HealthKitManager.swift`）
- **7.3** `MotionManager` 実装（`aniccaios/aniccaios/Sensors/MotionManager.swift`）
- **7.4** `MetricsUploader` 日次送信（`aniccaios/aniccaios/Services/MetricsUploader.swift`）
- **7.5** 権限状態の `AppState` 反映（`aniccaios/aniccaios/AppState.swift`）

---

## 参照仕様（v3 一次情報）

- `.cursor/plans/v3/ios-sensors-spec-v3.md`
- `.cursor/plans/v3/v3-stack.md`（**セクション 14.5**: 失敗時の fallback UX）
- `.cursor/plans/v3/file-structure-v3.md`
- `.cursor/plans/v3/todolist.md`（フェーズ7）

---

## 参照した公式URL一覧（妄想禁止のための一次情報）

> **最低3つ以上**、かつ **DeviceActivity/FamilyControls/HealthKit/CoreMotion** を必ず含める。

### DeviceActivity（Screen Time / 閾値イベント / スケジュール）

- `https://developer.apple.com/documentation/deviceactivity/deviceactivityschedule/`
- `https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor/eventdidreachthreshold(_:activity:)/`

### FamilyControls（認可 / Picker）

- `https://developer.apple.com/documentation/familycontrols/authorizationcenter/requestauthorization(for:)/`
- `https://developer.apple.com/documentation/familycontrols/familyactivitypicker/`

### HealthKit（バックグラウンドデリバリー / Observer）

- `https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)/`
- `https://developer.apple.com/documentation/healthkit/hkobserverquerycompletionhandler/`
- `https://developer.apple.com/documentation/healthkit/executing-observer-queries/`
- `https://developer.apple.com/documentation/healthkit/hkobserverquery/`

### CoreMotion（権限 / バックグラウンド制約）

- `https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager/authorizationstatus()/`
- `https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager/startactivityupdates(to:withhandler:)/`

### BackgroundTasks（MetricsUploader の日次アップロードを「03:00 UTCに近づける」ための根拠）

- `https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler/register(fortaskwithidentifier:using:launchhandler:)/`
- `https://developer.apple.com/documentation/backgroundtasks/bgtaskrequest/earliestbegindate/`
- `https://developer.apple.com/documentation/uikit/using-background-tasks-to-update-your-app/`

---

## 設計上の決定事項（一次情報で裏取りした「権限・バックグラウンド・制約」）

### A) HealthKit バックグラウンド更新は「Observer + enableBackgroundDelivery + completion必須」

- `HKHealthStore.enableBackgroundDelivery(...)` は **最大頻度** を指定し、システムが起動タイミングを決める（頻度は透明に強制される）。  
  さらに、**ObserverQuery の completion handler を呼ばないとバックオフし、3回失敗で停止**される。  
  - 根拠: `enableBackgroundDelivery(for:frequency:withCompletion:)` / `HKObserverQueryCompletionHandler`  
    - `https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)/`
    - `https://developer.apple.com/documentation/healthkit/hkobserverquerycompletionhandler/`
    - `https://developer.apple.com/documentation/healthkit/executing-observer-queries/`

### B) CoreMotion は「best effort」「suspended中は更新が届かない」

- `startActivityUpdates` の handler 実行は **best effort** で、**アプリがsuspended中は更新が配信されない**。  
  suspended中に起きた変化は、復帰時に最後の更新のみが届く。全件が必要なら query API を使う。  
  - 根拠: `startActivityUpdates(to:withHandler:)`  
    - `https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager/startactivityupdates(to:withhandler:)/`

### C) BGTask は「earliestBeginDateは保証されない」「launch handlerは起動シーケンス中に登録完了が必須」

- `BGTaskRequest.earliestBeginDate` は「**それより早く始まらない**」だけで、「**その時刻に始まる保証はない**」。  
  - 根拠: `earliestBeginDate`  
    - `https://developer.apple.com/documentation/backgroundtasks/bgtaskrequest/earliestbegindate/`
- `BGTaskScheduler.register(...)` は `BGTaskSchedulerPermittedIdentifiers` に含まれるIDで、かつ **アプリ起動の最後までに登録完了が必要**。  
  - 根拠: `register(forTaskWithIdentifier:using:launchHandler:)`  
    - `https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler/register(fortaskwithidentifier:using:launchhandler:)/`

### D) FamilyControls / DeviceActivity は「ユーザー選択を秘匿」「イベント到達はシステムがコールバック」

- `FamilyActivityPicker` の選択は **不透明値** として扱われ、アプリは選択内容を生の形では知れない（プライバシー保護）。  
  - 根拠: `FamilyActivityPicker`  
    - `https://developer.apple.com/documentation/familycontrols/familyactivitypicker/`
- `DeviceActivityMonitor.eventDidReachThreshold` は、**システムが閾値到達時に呼ぶ**。  
  - 根拠: `eventDidReachThreshold(_:activity:)`  
    - `https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor/eventdidreachthreshold(_:activity:)/`

---

## 完全パッチ（apply_patch 互換 / iOS側）

> 重要: ここに書くのは **フェーズ7の擬似パッチ**。  
> Xcodeの「Capability追加（Family Controls / App Group）」や「Device Activity Monitor Extension の追加」は **コード差分だけでは表現できない**ため、該当箇所は **コメントで手順を固定**する。

```text
*** Begin Patch

*** Add File: aniccaios/aniccaios/Sensors/SensorAccessState.swift
+import Foundation
+
+/// Sensor permissions / integration toggles for v0.3.
+/// - Source of truth: AppState (persisted to UserDefaults).
+/// - Quiet fallback: when not authorized, keep features off and skip DP/metrics.
+enum SensorPermissionStatus: String, Codable {
+    case unknown
+    case notDetermined
+    case authorized
+    case denied
+    case restricted
+    case unsupported
+}
+
+struct SensorAccessState: Codable, Equatable {
+    // Permission snapshots
+    var screenTime: SensorPermissionStatus
+    var healthKit: SensorPermissionStatus
+    var motion: SensorPermissionStatus
+
+    // Integration toggles (user intent)
+    var screenTimeEnabled: Bool
+    var sleepEnabled: Bool
+    var stepsEnabled: Bool
+    var motionEnabled: Bool
+
+    static let `default` = SensorAccessState(
+        screenTime: .unknown,
+        healthKit: .unknown,
+        motion: .unknown,
+        screenTimeEnabled: false,
+        sleepEnabled: false,
+        stepsEnabled: false,
+        motionEnabled: false
+    )
+}

*** Add File: aniccaios/aniccaios/Sensors/DeviceActivityMonitor.swift
+import Foundation
+
+// NOTE:
+// - Requires adding the "Family Controls" capability + entitlement:
+//   com.apple.developer.family-controls
+// - Requires adding an App Group (e.g. group.com.anicca.shared) to share selection with the extension.
+// - Requires adding a Device Activity Monitor Extension target.
+//
+// Primary sources:
+// - Authorization: https://developer.apple.com/documentation/familycontrols/authorizationcenter/requestauthorization(for:)/
+// - Picker: https://developer.apple.com/documentation/familycontrols/familyactivitypicker/
+// - Schedule: https://developer.apple.com/documentation/deviceactivity/deviceactivityschedule/
+// - Threshold callback: https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor/eventdidreachthreshold(_:activity:)/
+
+@available(iOS 16.0, *)
+final class DeviceActivityMonitorController {
+    static let shared = DeviceActivityMonitorController()
+
+    private init() {}
+
+    /// Quiet fallback:
+    /// - Only request Screen Time authorization when user toggles ON.
+    /// - If denied/cancelled, caller should revert toggle OFF and stop monitoring.
+    func requestAuthorization() async throws {
+        // import FamilyControls
+        // try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
+    }
+
+    /// Starts monitoring with a schedule and events.
+    /// Actual threshold handling is done in Device Activity Monitor Extension (separate target).
+    func startMonitoringIfNeeded() throws {
+        // import DeviceActivity
+        // 1) Build DeviceActivitySchedule
+        // 2) Build DeviceActivityEvent(s) (e.g. sns30/sns60)
+        // 3) DeviceActivityCenter().startMonitoring(...)
+    }
+
+    func stopMonitoring() {
+        // import DeviceActivity
+        // DeviceActivityCenter().stopMonitoring(...)
+    }
+}

*** Add File: aniccaios/aniccaios/Sensors/HealthKitManager.swift
+import Foundation
+
+// NOTE:
+// Primary sources:
+// - enableBackgroundDelivery: https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)/
+// - completion handler MUST be called (backoff; 3 failures stops delivery):
+//   https://developer.apple.com/documentation/healthkit/hkobserverquerycompletionhandler/
+// - Observer queries best practices (set up at app launch):
+//   https://developer.apple.com/documentation/healthkit/executing-observer-queries/
+
+final class HealthKitManager {
+    static let shared = HealthKitManager()
+    private init() {}
+
+    /// Quiet fallback:
+    /// - Only call requestAuthorization when user toggles ON (Sleep/Steps).
+    func requestAuthorizationForSleepAndSteps() async throws {
+        // import HealthKit
+        // guard HKHealthStore.isHealthDataAvailable() else { throw ... }
+        // try await HKHealthStore().requestAuthorization(toShare: [], read: typesToRead)
+    }
+
+    /// If authorized + enabled, set up observer queries and background delivery on launch.
+    /// Call completion handler ASAP (see Apple docs) and do minimal work.
+    func configureOnLaunchIfEnabled() {
+        // import HealthKit
+        // create HKObserverQuery for sleep/steps
+        // healthStore.execute(query)
+        // healthStore.enableBackgroundDelivery(for:..., frequency: .hourly, ...)
+    }
+
+    /// Returns local cached aggregates (yesterday) for MetricsUploader.
+    func loadCachedDailyMetrics(forLocalDate localDate: String) -> (sleepDurationMin: Int?, wakeAtISO8601: String?, steps: Int?) {
+        return (nil, nil, nil)
+    }
+}

*** Add File: aniccaios/aniccaios/Sensors/MotionManager.swift
+import Foundation
+
+// NOTE:
+// Primary sources:
+// - authorizationStatus: https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager/authorizationstatus()/
+// - startActivityUpdates best-effort + no delivery while app suspended:
+//   https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager/startactivityupdates(to:withhandler:)/
+
+final class MotionManager {
+    static let shared = MotionManager()
+    private init() {}
+
+    /// Quiet fallback:
+    /// - Only start updates when user toggles ON.
+    /// - If denied, caller reverts toggle OFF and we stop all motion work.
+    func startIfEnabled() {
+        // import CoreMotion
+        // guard CMMotionActivityManager.isActivityAvailable() else { ... }
+        // check CMMotionActivityManager.authorizationStatus()
+        // startActivityUpdates(to:..., withHandler: ...)
+    }
+
+    func stop() {
+        // activityManager.stopActivityUpdates()
+    }
+
+    /// Returns local cached aggregates (yesterday) for MetricsUploader.
+    func loadCachedDailyMetrics(forLocalDate localDate: String) -> (sedentaryMinutes: Int?) {
+        return (sedentaryMinutes: nil)
+    }
+}

*** Add File: aniccaios/aniccaios/Services/MetricsUploader.swift
+import Foundation
+
+/// Sends daily aggregates to backend (daily_metrics).
+/// Target time: ~03:00 UTC, but iOS scheduling is best-effort.
+///
+/// Primary sources for scheduling constraints:
+/// - BGTask registration must finish by app launch end:
+///   https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler/register(fortaskwithidentifier:using:launchhandler:)/
+/// - earliestBeginDate is NOT guaranteed:
+///   https://developer.apple.com/documentation/backgroundtasks/bgtaskrequest/earliestbegindate/
+/// - Background tasks overview:
+///   https://developer.apple.com/documentation/uikit/using-background-tasks-to-update-your-app/
+@MainActor
+final class MetricsUploader {
+    static let shared = MetricsUploader()
+    private init() {}
+
+    /// BGTask identifier (must be in BGTaskSchedulerPermittedIdentifiers).
+    static let taskId = "com.anicca.metrics.daily"
+
+    func scheduleNextIfPossible() {
+        // import BackgroundTasks
+        // BGAppRefreshTaskRequest(identifier: Self.taskId).earliestBeginDate = ...
+        // BGTaskScheduler.shared.submit(request)
+    }
+
+    func runUploadIfDue() async {
+        // Quiet fallback: if not signed-in, return.
+        // Gather cached data from sensors (only enabled ones).
+        // POST /api/mobile/daily_metrics (endpoint name from ios-sensors-spec-v3.md; server side to implement)
+    }
+}

*** Update File: aniccaios/aniccaios/Config.swift
@@
 enum AppConfig {
@@
     static var profileSyncURL: URL {
         proxyBaseURL.appendingPathComponent("mobile/profile")
     }
+    
+    // v0.3 (phase-7) daily aggregates upload.
+    static var dailyMetricsURL: URL {
+        proxyBaseURL.appendingPathComponent("mobile/daily_metrics")
+    }
@@
 }

*** Update File: aniccaios/aniccaios/AppState.swift
@@
 import UIKit
 import SwiftUI
 import RevenueCat
 
 
 @MainActor
 final class AppState: ObservableObject {
@@
     @Published private(set) var customHabits: [CustomHabitConfiguration] = []
     @Published private(set) var customHabitSchedules: [UUID: DateComponents] = [:]
     private(set) var shouldStartSessionImmediately = false
+
+    // Phase-7: sensor permissions + integration toggles
+    @Published private(set) var sensorAccess: SensorAccessState
@@
     private let userProfileKey = "com.anicca.userProfile"
     private let subscriptionKey = "com.anicca.subscription"
     private let customHabitsKey = "com.anicca.customHabits"
     private let customHabitSchedulesKey = "com.anicca.customHabitSchedules"
+    private let sensorAccessKey = "com.anicca.sensorAccessState"
@@
     private init() {
@@
         self.subscriptionInfo = loadSubscriptionInfo()
         self.customHabit = CustomHabitStore.shared.load()
+
+        // Phase-7: load sensor access state
+        self.sensorAccess = Self.loadSensorAccess(from: defaults, key: sensorAccessKey)
@@
     }
+
+    private static func loadSensorAccess(from defaults: UserDefaults, key: String) -> SensorAccessState {
+        guard let data = defaults.data(forKey: key),
+              let decoded = try? JSONDecoder().decode(SensorAccessState.self, from: data) else {
+            return .default
+        }
+        return decoded
+    }
+
+    private func saveSensorAccess() {
+        if let data = try? JSONEncoder().encode(sensorAccess) {
+            defaults.set(data, forKey: sensorAccessKey)
+        }
+    }
+
+    // MARK: - Phase-7: integration toggles entry points (quiet fallback)
+
+    func setScreenTimeEnabled(_ enabled: Bool) {
+        sensorAccess.screenTimeEnabled = enabled
+        saveSensorAccess()
+    }
+
+    func setSleepEnabled(_ enabled: Bool) {
+        sensorAccess.sleepEnabled = enabled
+        saveSensorAccess()
+    }
+
+    func setStepsEnabled(_ enabled: Bool) {
+        sensorAccess.stepsEnabled = enabled
+        saveSensorAccess()
+    }
+
+    func setMotionEnabled(_ enabled: Bool) {
+        sensorAccess.motionEnabled = enabled
+        saveSensorAccess()
+    }
+
+    func updateScreenTimePermission(_ status: SensorPermissionStatus) {
+        sensorAccess.screenTime = status
+        if status != .authorized { sensorAccess.screenTimeEnabled = false }
+        saveSensorAccess()
+    }
+
+    func updateHealthKitPermission(_ status: SensorPermissionStatus) {
+        sensorAccess.healthKit = status
+        if status != .authorized {
+            sensorAccess.sleepEnabled = false
+            sensorAccess.stepsEnabled = false
+        }
+        saveSensorAccess()
+    }
+
+    func updateMotionPermission(_ status: SensorPermissionStatus) {
+        sensorAccess.motion = status
+        if status != .authorized { sensorAccess.motionEnabled = false }
+        saveSensorAccess()
+    }

*** Update File: aniccaios/aniccaios/AppDelegate.swift
@@
 import UIKit
 import UserNotifications
 import OSLog
+import BackgroundTasks
@@
 class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
@@
     func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
@@
         UNUserNotificationCenter.current().delegate = self
         NotificationScheduler.shared.registerCategories()
         SubscriptionManager.shared.configure()
+
+        // Phase-7: register BGTask handlers (must complete before launch ends).
+        // See Apple docs: BGTaskScheduler.register(...) must finish before end of launch.
+        // NOTE: Requires Info.plist BGTaskSchedulerPermittedIdentifiers entry (done in phase-9 / Info.plist).
+        _ = BGTaskScheduler.shared.register(
+            forTaskWithIdentifier: MetricsUploader.taskId,
+            using: nil
+        ) { task in
+            // task.expirationHandler = { ... }
+            Task { @MainActor in
+                await MetricsUploader.shared.runUploadIfDue()
+                // task.setTaskCompleted(success: true)
+                MetricsUploader.shared.scheduleNextIfPossible()
+            }
+        }
@@
         Task {
@@
             if AppState.shared.isOnboardingComplete {
@@
             _ = await NotificationScheduler.shared.requestAuthorizationIfNeeded()
+                // Phase-7: Configure HealthKit observers if user already enabled + authorized.
+                HealthKitManager.shared.configureOnLaunchIfEnabled()
+                // Phase-7: Schedule daily metrics upload best-effort.
+                MetricsUploader.shared.scheduleNextIfPossible()
             }
@@
         }
         return true
     }
@@
 }

*** Update File: aniccaios/aniccaios/SettingsView.swift
@@
 struct SettingsView: View {
@@
     var body: some View {
         NavigationStack {
             ScrollView {
                 VStack(spacing: AppTheme.Spacing.md) {
                     subscriptionSection
+                    dataIntegrationSection
                     personalizationSection
                     alarmSettingsSection
                     problemsSection
                     idealTraitsSection
                     signOutSection
                     deleteAccountSection
                 }
@@
     }
+
+    // MARK: - Data Integration (Phase-7)
+    @ViewBuilder
+    private var dataIntegrationSection: some View {
+        CardView {
+            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
+                Text("Data Integration")
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
+                    .padding(.bottom, AppTheme.Spacing.xs)
+
+                // Status (v3-stack.md 14.5: not connected message)
+                // Quiet fallback: show status, but don't block Talk.
+                SectionRow.text(label: "Screen Time", text: "\(appState.sensorAccess.screenTime)")
+                Toggle("Enable Screen Time", isOn: Binding(
+                    get: { appState.sensorAccess.screenTimeEnabled },
+                    set: { enabled in
+                        Task { @MainActor in
+                            if enabled {
+                                // Request only on toggle ON (quiet fallback)
+                                // try await DeviceActivityMonitorController.shared.requestAuthorization()
+                                // try DeviceActivityMonitorController.shared.startMonitoringIfNeeded()
+                                appState.setScreenTimeEnabled(true)
+                                appState.updateScreenTimePermission(.authorized)
+                            } else {
+                                // DeviceActivityMonitorController.shared.stopMonitoring()
+                                appState.setScreenTimeEnabled(false)
+                            }
+                        }
+                    }
+                ))
+
+                SectionRow.text(label: "HealthKit", text: "\(appState.sensorAccess.healthKit)")
+                Toggle("Enable Sleep", isOn: Binding(
+                    get: { appState.sensorAccess.sleepEnabled },
+                    set: { enabled in
+                        Task { @MainActor in
+                            if enabled {
+                                // try await HealthKitManager.shared.requestAuthorizationForSleepAndSteps()
+                                appState.setSleepEnabled(true)
+                                appState.updateHealthKitPermission(.authorized)
+                                HealthKitManager.shared.configureOnLaunchIfEnabled()
+                            } else {
+                                appState.setSleepEnabled(false)
+                            }
+                        }
+                    }
+                ))
+                Toggle("Enable Steps", isOn: Binding(
+                    get: { appState.sensorAccess.stepsEnabled },
+                    set: { enabled in
+                        Task { @MainActor in
+                            if enabled {
+                                // try await HealthKitManager.shared.requestAuthorizationForSleepAndSteps()
+                                appState.setStepsEnabled(true)
+                                appState.updateHealthKitPermission(.authorized)
+                                HealthKitManager.shared.configureOnLaunchIfEnabled()
+                            } else {
+                                appState.setStepsEnabled(false)
+                            }
+                        }
+                    }
+                ))
+
+                SectionRow.text(label: "Motion", text: "\(appState.sensorAccess.motion)")
+                Toggle("Enable Motion", isOn: Binding(
+                    get: { appState.sensorAccess.motionEnabled },
+                    set: { enabled in
+                        Task { @MainActor in
+                            if enabled {
+                                MotionManager.shared.startIfEnabled()
+                                appState.setMotionEnabled(true)
+                                appState.updateMotionPermission(.authorized)
+                            } else {
+                                MotionManager.shared.stop()
+                                appState.setMotionEnabled(false)
+                            }
+                        }
+                    }
+                ))
+
+                Text("If sensors are not permitted, Anicca keeps working (Talk/Feeling) and simply skips behavior data.")
+                    .font(AppTheme.Typography.caption1Dynamic)
+                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
+            }
+        }
+    }

*** End Patch
```

---

## 補足（フェーズ7で「コード差分外」に固定すべき手順）

### 1) Xcode Capabilities / Entitlements（必須）

- **Family Controls** capability（`com.apple.developer.family-controls`）を追加（`ios-sensors-spec-v3.md 1.1`）
- **App Group**（例: `group.com.anicca.shared`）を追加（本体アプリ + DeviceActivityMonitorExtension の両方）

### 2) Device Activity Monitor Extension（必須）

- Xcodeで `Device Activity Monitor Extension` ターゲット追加
- Extension側で `DeviceActivityMonitor` をサブクラス化し、`eventDidReachThreshold` を実装  
  - 根拠: `eventDidReachThreshold(_:activity:)`  
    - `https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor/eventdidreachthreshold(_:activity:)/`

### 3) Info.plist（フェーズ9で実施予定だが、フェーズ7の動作に影響）

- `BGTaskSchedulerPermittedIdentifiers` に `com.anicca.metrics.daily` を追加（登録が `false` になるのを防ぐ）  
  - 根拠: `BGTaskScheduler.register(...)` の Return value / Discussion  
    - `https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler/register(fortaskwithidentifier:using:launchhandler:)/`
- Health / Motion の usage description（`NSHealthShareUsageDescription`, `NSMotionUsageDescription`）更新は `todolist.md 9.1` でまとめて実施する（このパッチでは「差分外」扱い）。


