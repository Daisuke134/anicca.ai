# ios-sensors-spec-v3.md

DeviceActivity / FamilyControls / HealthKit / CoreMotion を v3 で実装するための手順・制約・運用フロー。実装用の Swift コード断片と、拡張/権限/審査の注意点を網羅する。  
前提: iOS 17+（DeviceActivity/FamilyControls は 16.0+ だが最新ガイドに合わせる）、SwiftUI。実装は `Sensors/` 配下（file-structure-v3.md 参照）。

---

## 0. 依存ファイルと責務の整理
- `Sensors/DeviceActivityMonitor.swift`：Screen Time カテゴリ監視（閾値通知→NudgeTriggerService）
- `Sensors/HealthKitManager.swift`：睡眠/歩数の読み取り、日次集計、BG デリバリー
- `Sensors/MotionManager.swift`：座位/歩行検知、間欠フェッチで電池最適化
- `Services/NudgeTriggerService.swift`：各 DP を `/nudge/trigger` に送信
- `Services/MetricsUploader.swift`：日次メトリクスを 03:00 UTC にまとめて送信
- `Notifications/NotificationScheduler.swift`：ローカル通知カテゴリ定義（Nudge/フォローアップ）

---

## 1. DeviceActivity / FamilyControls

### 1.1 entitlement 申請と構成
- 必須 entitlement: `com.apple.developer.family-controls`（Family Controls）。Xcode「Signing & Capabilities」で追加し、App Store Connect で申請・有効化。
- 拡張: `Device Activity Monitor Extension` を作成し、`NSExtensionPrincipalClass` をエントリに設定。
- Managed Settings 用: `ManagedSettings` フレームワークは extension でのみ利用（本体は UI のみ）。
- 審査メモ: 目的を明記（例:「SNS 長時間利用をユーザー自身が把握し、休憩を促すため」）、データは端末内でのみ処理しカテゴリ名を収集しないことを強調。

### 1.2 FamilyActivityPicker 実装（本体アプリ）
```swift
import FamilyControls
import SwiftUI

struct ActivityPickerView: View {
  @State private var selection = FamilyActivitySelection()
  @Environment(\.dismiss) var dismiss

  var body: some View {
    FamilyActivityPicker(selection: $selection)
      .onChange(of: selection) { newValue in
        // 選択カテゴリ/アプリを AppGroup 経由で共有し、DeviceActivityMonitorExtension で参照
        SharedSelectionStore.shared.save(selection: newValue)
      }
      .toolbar {
        Button("Done") { dismiss() }
      }
  }
}
```
- App Group を用意し、`FamilyActivitySelection` を `Data` で保存（`NSKeyedArchiver`）→ extension で復元。

### 1.3 監視 threshold 設定（例）
- 30 分連続使用で軽い通知、60 分で強い警告。`DeviceActivityEvent` に `threshold` を設定。
- イベント名: `sns30`, `sns60` など分け、`DeviceActivityEvent.Name("sns30")`。
- スケジュール: 常時監視するため `DeviceActivitySchedule(intervalStart: DateComponents(hour:0), intervalEnd: DateComponents(hour:24), repeats: true)`。

### 1.4 DeviceActivityMonitor 実装（Extension）
```swift
import DeviceActivity
import ManagedSettings

class AniccaDeviceActivityMonitor: DeviceActivityMonitor {
  override func intervalDidStart(for activity: DeviceActivityName) {
    // 監視開始ログ
  }
  override func intervalDidEnd(for activity: DeviceActivityName) {
    // 終了ログ
  }
  override func eventWillReachThresholdWarning(_ event: DeviceActivityEvent, activity: DeviceActivityName) {
    // 例: 25分警告などを入れる場合に使用（任意）
  }
  override func eventDidReachThreshold(_ event: DeviceActivityEvent, activity: DeviceActivityName) {
    // threshold 到達 → App Group 経由で本体へシグナル
    NudgeSignalBridge.shared.send(.snsThresholdReached(name: event.name.rawValue,
                                                       duration: event.threshold))
  }
}
```
- `DeviceActivityCenter().startMonitoring(_:during:events:)` を本体アプリ起動時に一度だけ呼ぶ。
- アプリが kill されても extension が監視を継続。イベント到達時は extension → App Group/通知で本体が起床。

### 1.5 Extension ↔ 本体アプリ通信の実装詳細

- App Group: 例 group.com.anicca.shared

- Darwin通知名: com.anicca.threshold.reached

- 起動時に UserDefaults(App Group) から未処理イベントを再取得し Nudge 送信

- 端末再起動/アプリ起動で DeviceActivityCenter.startMonitoring を idempotent に再登録

#### 通信フロー概要

```
[DeviceActivity Extension（別プロセス）]
    │
    ├─(1) しきい値到達を検知（eventDidReachThreshold）
    │
    ├─(2) App Group の UserDefaults に書き込み
    │     Key: "com.anicca.lastThresholdEvent"
    │     Value: { type: "sns_30min", timestamp: Date, activity: "sns" }
    │
    ├─(3) Darwin Notification を発火（ペイロードなし）
    │     Name: "com.anicca.threshold.reached"
    │
    └─(4) 本体アプリが Darwin Notification を受信
          → UserDefaults を読み取り
          → NudgeTriggerService へ送信
```

#### なぜこの方法なのか
- **Extension は本体アプリと別プロセス**で動作するため、直接のメモリ共有やメソッド呼び出しができない
- **App Group**: 同じ開発者が作ったアプリ間でファイル/UserDefaultsを共有できる仕組み
- **Darwin Notification**: OS レベルの通知機構。「何か起きたよ」だけを伝える（データは送れない）
- **UserDefaults**: アプリの設定や小さなデータを保存する仕組み。App Group 経由で共有可能

#### 実装コード（Swift）

##### Extension側（DeviceActivityMonitor）

```swift
import DeviceActivity
import os.log

class AniccaDeviceActivityMonitor: DeviceActivityMonitor {
    // App Group の UserDefaults（本体アプリと共有）
    private let sharedDefaults = UserDefaults(suiteName: "group.com.anicca.shared")!
    private let logger = Logger(subsystem: "com.anicca.extension", category: "DeviceActivity")
    
    override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
        logger.info("Threshold reached: \(event.rawValue)")
        
        // 1. App Group UserDefaults に書き込み
        let eventData: [String: Any] = [
            "type": event.rawValue,              // 例: "sns_30min"
            "timestamp": Date().timeIntervalSince1970,
            "activity": activity.rawValue       // 例: "sns_monitoring"
        ]
        sharedDefaults.set(eventData, forKey: "lastThresholdEvent")
        sharedDefaults.synchronize()  // 即座に書き込み
        
        // 2. Darwin Notification で本体に「更新あり」を通知
        let notificationName = CFNotificationName("com.anicca.threshold.reached" as CFString)
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            notificationName,
            nil,    // object: nil（Darwin は指定不可）
            nil,    // userInfo: nil（Darwin はペイロードなし）
            true    // deliverImmediately
        )
        
        logger.info("Darwin notification posted")
    }
}
```

##### 本体アプリ側（起動時に登録）

```swift
import Foundation

class ThresholdObserver {
    static let shared = ThresholdObserver()
    private let sharedDefaults = UserDefaults(suiteName: "group.com.anicca.shared")!
    
    private init() {
        // Darwin Notification を監視開始
        let name = CFNotificationName("com.anicca.threshold.reached" as CFString)
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            Unmanaged.passUnretained(self).toOpaque(),  // observer
            { center, observer, name, object, userInfo in
                // コールバック（C関数スタイル）
                // Swift の NotificationCenter に転送
                NotificationCenter.default.post(name: .thresholdReached, object: nil)
            },
            name.rawValue,
            nil,
            .deliverImmediately
        )
    }
    
    /// UserDefaults から最新イベントを読み取り
    func getLatestEvent() -> ThresholdEvent? {
        guard let data = sharedDefaults.dictionary(forKey: "lastThresholdEvent"),
              let type = data["type"] as? String,
              let timestamp = data["timestamp"] as? TimeInterval else {
            return nil
        }
        return ThresholdEvent(
            type: type,
            timestamp: Date(timeIntervalSince1970: timestamp),
            activity: data["activity"] as? String
        )
    }
}

extension Notification.Name {
    static let thresholdReached = Notification.Name("com.anicca.thresholdReached")
}

struct ThresholdEvent {
    let type: String        // "sns_30min", "sns_60min" など
    let timestamp: Date
    let activity: String?
}
```

##### 利用側（NudgeTriggerService）

```swift
class NudgeTriggerService {
    init() {
        // Darwin 経由の通知を購読
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleThresholdReached),
            name: .thresholdReached,
            object: nil
        )
    }
    
    @objc private func handleThresholdReached() {
        guard let event = ThresholdObserver.shared.getLatestEvent() else { return }
        
        // サーバーに Nudge トリガーを送信
        Task {
            await sendNudgeTrigger(eventType: event.type, timestamp: event.timestamp)
        }
    }
}
```

#### ユーザー体験の流れ

1. **ユーザーが Instagram を 30分使う**
2. **Extension が検知**（アプリが閉じていても動く）
3. **本体アプリに通知が届く**（バックグラウンドでも受信可能）
4. **サーバーに「SNS 30分超過」を送信**
5. **サーバーが Nudge を決定**
6. **プッシュ通知でユーザーに届く**: 「ここで一度、手を離そう。目と心を休める 5 分にしよう。」

#### 制約事項
- **Darwin Notification はペイロードを持てない**: 「何か起きた」しか伝えられないので、詳細データは必ず App Group UserDefaults 経由
- **Extension のメモリ制限**: 約 6MB。重い処理は本体アプリに任せる
- **アプリ kill 状態**: Extension は動作するが、本体アプリの Darwin observer は起動しない → 次回起動時に UserDefaults から未処理イベントを拾う設計にする

### 1.6 イベントハンドリングとプライバシー
- FamilyControls は選択内容をアプリに開示しない。得られるのは「カテゴリ名/ドメイン/アプリ bundleID の集合」までで、実利用ログはなし。
- 送信データは「イベント種別 + 閾値到達時刻」のみ。個別サイトや閲覧内容を送らない。

### 1.7 制約とテスト
- 子どもデバイスでのテストは Family Sharing が必要。審査用に動画キャプチャを準備。
- シミュレータ不可。実機で `Settings > Screen Time` が ON であることを確認。
- 端末再起動時にスケジュールを再登録（`applicationDidBecomeActive` で idempotent に設定）。

---

## 2. HealthKit

### 2.1 必要な HKSampleType
| Type | 用途 |
| --- | --- |
| `HKCategoryType.sleepAnalysis` | 睡眠時間、入眠/起床時刻 |
| `HKQuantityType.stepCount` | 歩数 |
| `HKQuantityType.activeEnergyBurned` | 活動量（オプション、v3 は任意） |

### 2.2 認可フロー（読取のみ）
```swift
func requestHealthKitAuthorization() async throws {
  let typesToRead: Set<HKObjectType> = [
    HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
    HKObjectType.quantityType(forIdentifier: .stepCount)!
  ]
  try await HKHealthStore().requestAuthorization(toShare: [], read: typesToRead)
}
```
- 初回起動オンボーディングで実行。失敗時は後で Settings から再要求できる導線を UI に置く。

### 2.3 バックグラウンド読み取り
- `HKObserverQuery` で睡眠/歩数を監視し、`enableBackgroundDelivery(for:frequency:.hourly)`（睡眠は `.immediate` に近い `.hourly` 推奨、審査リスクを下げる）。
```swift
func startObservers() {
  let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
  let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount)!

  let observer = HKObserverQuery(sampleType: sleepType, predicate: nil) { _, completion, error in
    Task { await self.fetchSleepIfNeeded() }
    completion() // 必須
  }
  healthStore.execute(observer)
  try? healthStore.enableBackgroundDelivery(for: sleepType, frequency: .hourly) { _, _ in }
  try? healthStore.enableBackgroundDelivery(for: stepsType, frequency: .hourly) { _, _ in }
}
```
- iOS はバックグラウンド実行時間が短いので、observer コールで即座に最新分のみフェッチ→ローカル保存→次回バッチ送信。

### 2.4 取得・集計ポリシー
- 睡眠: `HKCategoryValueSleepAnalysis.asleepUnspecified` / `inBed` をフィルタし、入眠〜起床の最新区間を抽出。日次では「終了時刻がその日のもの」を当日睡眠として扱う。
- 歩数: `HKStatisticsCollectionQuery` で 1 日単位に集計し、UTC 0:00 境界で切る（バックエンドも UTC バッチ）。
- 失敗時: ローカルにアンカーを保持し、次回起動時に差分取得。

---

## 3. CoreMotion

### 3.1 CMMotionActivityManager 基本
```swift
let activityManager = CMMotionActivityManager()

func startActivityUpdates() {
  activityManager.startActivityUpdates(to: .main) { activity in
    guard let a = activity else { return }
    if a.stationary {
      SedentaryStore.shared.markStationary()
    } else if a.walking || a.running {
      SedentaryStore.shared.resetIfNeeded()
    }
  }
}
```
- `stationary`/`walking`/`running`/`automotive` を使用。
- 精度: `confidence` が `.low` のときは判定を保留。

### 3.2 座位判定ロジック
- 1 分ごとにフロント（AppState）で状態更新、バックグラウンドは 5 分間隔で `startActivityUpdates` を再起動するタイマーを使い、連続 90 分 stationary を検知。
- 歩数が +300 以上増加、もしくは `walking/running` が検出されたら座位カウンタをリセット。
- 90 分連続 stationary → `NudgeTriggerService` へ `eventType=sedentary_long` を送信。

### 3.3 電池消費対策
- `CMMotionActivityManager` は低電力だが、常時ハンドラ稼働を避けるため:
  - フォアグラウンド: 1 分間隔の lightweight 判定
  - バックグラウンド: 5 分間隔で短時間開始→即停止（`startActivityUpdates` → `DispatchQueue.main.asyncAfter` で `stopActivityUpdates()`）
- バックアップ: 1 日合計 `sedentaryMinutes` を HealthKit からも取得し、二重計測を避ける。

---

## 4. データ送信とスケジュール

### 4.1 タイミング
- 日次メトリクス: 毎日 03:00 UTC にバッチ送信（`MetricsUploader`）。前日分の睡眠/歩数/SNS 合計/座位合計をまとめる。
- リアルタイム: Nudge DP 発火時に即時送信（例: `sns_threshold_exceeded`, `sedentary_long`）。サーバが Nudge Policy を決定。

### 4.2 JSON 例
```json
{
  "userId": "uuid",
  "date": "2025-01-15",
  "sleepDurationMin": 420,
  "wakeAt": "2025-01-15T07:30:00Z",
  "snsMinutesTotal": 180,
  "steps": 8500,
  "sedentaryMinutes": 300
}
```
- リアルタイムイベントは `{ eventType, eventPayload, timestamp }` を `/nudge/trigger` に送る。

### 4.3 送信前のフィルタリング
- ユーザーが「Data Integration トグル」を OFF にした場合、該当ドメインの DP/送信を停止。
- 端末内キャッシュは最長 7 日分。再ログイン時に未送信分をまとめて送信。

---

## 5. Info.plist 追加キー

- FamilyControls entitlement 申請文言例を追記する。

| Key | Value (例) |
| --- | --- |
| `NSMotionUsageDescription` | "Anicca uses motion data to detect when you've been sitting too long." |
| `NSHealthShareUsageDescription` | "Anicca reads your sleep and step data to provide personalized insights." |
| `NSUserTrackingUsageDescription` | 追加しない（不要な場合は空でなく削除） |
| `FamilyControls` capability | Xcode Capabilities で追加（Entitlement） |

審査文言は具体的ユースケースを記載（「座りすぎ検知」「睡眠/歩数の可視化」「SNS 長時間利用の休憩リマインド」）。

---

## 6. 実装ステップ（Checklist）
1) Capabilities: Family Controls + App Group を追加、Device Activity Monitor Extension を生成。  
2) `SharedSelectionStore` を作り、FamilyActivityPicker の選択を App Group に保存。  
3) `DeviceActivityCenter.startMonitoring` で `sns30`/`sns60` を常時登録。  
4) Extension の `eventDidReachThreshold` で App Group 経由で本体へシグナル → `NudgeTriggerService`.  
5) HealthKit 認可フロー実装→ObserverQuery + BackgroundDelivery を登録。  
6) 睡眠/歩数を日次集計し、03:00 UTC に `/daily_metrics` 送信。  
7) CoreMotion の間欠監視を実装（1分/5分モード切替）、90 分 stationary で DP 送信。  
8) Data Integration トグルと再権限要求導線を Profile/Settings に配置（UI 変更なしで文言のみ）。

- TestFlight/審査用の実機動画を用意する。  

---

## 7. 既知の制約・落とし穴
- DeviceActivity はシミュレータ不可。選択できるのはカテゴリ/アプリ集合のみで、詳細ログは取得不可。
- `enableBackgroundDelivery` はユーザーが「ヘルスケア > データアクセスとデバイス」で OFF にすると無効化される。UI で状態チェックを提供。
- CoreMotion はドライバ的に安定だが、バックグラウンドで長時間保持すると稀にハンドラが止まるため、再起動タイマー必須。
- FamilyControls / DeviceActivity は TestFlight でのみ動作可（Ad-hoc でも可）。審査用ビルドで必ず entitlement を有効化。

---

## 8. 参考リンク（確認済み）
- DeviceActivityMonitor / eventDidReachThreshold: https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor/eventdidreachthreshold(_:activity:)  
- DeviceActivitySchedule: https://developer.apple.com/documentation/deviceactivity/deviceactivityschedule/  
- FamilyActivityPicker: https://developer.apple.com/documentation/familycontrols/familyactivitypicker/  
- Family Controls entitlement 設定: https://developer.apple.com/documentation/xcode/configuring-family-controls/  
- HKObserverQuery: https://developer.apple.com/documentation/healthkit/hkobserverquery/  
- enableBackgroundDelivery: https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)  
- CMMotionActivityManager: https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager/  


