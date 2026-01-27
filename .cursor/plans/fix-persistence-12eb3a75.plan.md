---
name: データ永続化問題の修正
overview: ""
todos:
  - id: ac898ec4-5b0e-424f-934f-1f0e14b24aa7
    content: Staging.xcconfigのRESET_ON_LAUNCHをNOに変更
    status: pending
  - id: 0170a165-899d-42b5-8bb7-0bb1295bba59
    content: HealthKitManagerの読み取り権限判定を修正
    status: pending
  - id: 622fd59f-1cde-424a-82ac-977ae18dff35
    content: refreshSensorAccessAuthorizationsでローカル状態を維持する修正
    status: pending
isProject: false
---

# データ永続化問題の修正

## 問題の概要

### デバッグビルドの問題（リリースでは動作）

- オンボーディングが毎回やり直し
- 習慣スケジュールが保存されない
- 習慣チェック状態が保存されない

**原因**: [`Staging.xcconfig`](aniccaios/Configs/Staging.xcconfig) で `RESET_ON_LAUNCH = YES` が設定されており、起動時にUserDefaultsが毎回クリアされる。

### リリースビルドでも発生する問題

- データ連携（就寝・歩数）のトグル状態が保存されない

**原因**: [`HealthKitManager.swift`](aniccaios/aniccaios/Services/HealthKitManager.swift) の `isSleepAuthorized()` と `isStepsAuthorized()` が `authorizationStatus(for:)` を使用しているが、これは書き込み権限用であり、読み取り専用権限では正確な値を返さない。これにより `refreshSensorAccessAuthorizations()` で `sleepAuthorized/stepsAuthorized` が誤って `false` に設定される。

---

## 修正内容

### 1. Staging.xcconfig の修正

[`aniccaios/Configs/Staging.xcconfig`](aniccaios/Configs/Staging.xcconfig)

```diff
- RESET_ON_LAUNCH = YES
+ // 開発時にUserDefaultsをリセットしたい場合は以下をYESに変更
+ // 通常はNOのままにして永続化をテストする
+ RESET_ON_LAUNCH = NO
```

### 2. HealthKitManager の読み取り権限判定修正

[`aniccaios/aniccaios/Services/HealthKitManager.swift`](aniccaios/aniccaios/Services/HealthKitManager.swift)

問題: HealthKitの `authorizationStatus(for:)` は書き込み権限用で、読み取り専用権限には使えない。

修正: 読み取り権限は正確に判定できないため、ユーザーが許可リクエストを完了したかどうかをローカルに保存して信頼する方式に変更。

```swift
/// 睡眠データが既に認可されているかチェック
/// 注意: 読み取り専用権限の場合、authorizationStatusは正確でない可能性がある
/// ローカルに保存されたauthorized状態を優先する
func isSleepAuthorized() -> Bool {
    guard HKHealthStore.isHealthDataAvailable() else { return false }
    // ローカルに保存された状態を信頼（AppState.sensorAccess.sleepAuthorized）
    // refreshSensorAccessAuthorizationsでこの値が使われる
    return AppState.shared.sensorAccess.sleepAuthorized
}

/// 歩数データが既に認可されているかチェック
func isStepsAuthorized() -> Bool {
    guard HKHealthStore.isHealthDataAvailable() else { return false }
    return AppState.shared.sensorAccess.stepsAuthorized
}
```

### 3. AppState.refreshSensorAccessAuthorizations の修正

[`aniccaios/aniccaios/AppState.swift`](aniccaios/aniccaios/AppState.swift) の `refreshSensorAccessAuthorizations` メソッド

問題: HealthKitのステータスで `sleepAuthorized/stepsAuthorized` を上書きしてしまう。

修正: ユーザーが一度許可した状態（ローカル保存済み）を尊重し、HealthKitステータスが `notDetermined` の場合は上書きしない。

```swift
@MainActor
func refreshSensorAccessAuthorizations(forceReauthIfNeeded _: Bool) async {
    // HealthKitの書き込み権限ステータスを確認（参考値として）
    #if canImport(HealthKit)
    // 読み取り権限は正確に判定できないため、ローカルに保存された状態を維持
    // ユーザーがシステム設定から明示的に権限を取り消した場合のみfalseにする
    // しかし、HealthKitはこれを検出する手段を提供していないため、
    // 一度許可された状態は維持する
    let sleepAuthorized = sensorAccess.sleepAuthorized  // ← 既存のローカル状態を使用
    let stepsAuthorized = sensorAccess.stepsAuthorized  // ← 既存のローカル状態を使用
    #else
    let sleepAuthorized = false
    let stepsAuthorized = false
    #endif
    // ... 以下同様
}
```

---

## 影響範囲

- デバッグビルドでのテスト時にデータが永続化される
- リリースビルドでHealthKitトグル状態が正しく維持される
- ユーザーが一度許可した権限状態は、アプリ再起動後も維持される