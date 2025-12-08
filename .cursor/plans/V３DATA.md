<!-- a0390b6c-ac86-414d-ab1e-e17076de20c7 e5ba2b37-0bee-4a51-be49-eaaa9ab06f73 -->
# iOS行動データ活用機能の実装計画

## 調査結果サマリー

### 取得可能な行動データ

#### 1. DeviceActivity API（ScreenBreakから確認）

- **アプリごとの使用時間**: 各アプリの1日の使用時間（秒単位）
- **ピックアップ回数**: デバイスを起こした回数（`numberOfPickups`）
- **通知数**: アプリごとの通知受信数（`numberOfNotifications`）
- **最初のピックアップ時刻**: 1日の最初にデバイスを起こした時刻（`firstPickup`）
- **最長アクティビティ時間**: 連続使用時間の最長（`longestActivity`）
- **カテゴリ情報**: Social、Productivity、Entertainmentなど

#### 2. HealthKit（追加で取得可能）

- **歩数**: 1日の歩数
- **移動距離**: 移動した距離
- **階段の上り下り**: 階段を上った階数
- **睡眠データ**: 就寝時刻、起床時刻、睡眠時間（ユーザーが許可した場合）

#### 3. CoreMotion（追加で取得可能）

- **活動状態**: 静止、歩行、ランニング、サイクリングなど
- **加速度データ**: デバイスの動きの強度

#### 4. 位置情報（追加で取得可能）

- **頻繁に訪れる場所**: よく行く場所と滞在時間
- **移動パターン**: 特定の曜日・時間帯の移動パターン

### Aniccaの現状

- 現在はユーザーから教えてもらった情報（起床時刻、就寝時刻など）でNudgeしている
- 行動データを自動取得する機能はまだ実装されていない
- 習慣サジェスト機能は未実装

---

## 実装する機能

### 機能1: 行動データ収集サービス（ActivityDataService）

**目的**: iOSの各種行動データを定期的に収集・保存

**実装内容**:

- `aniccaios/aniccaios/Services/ActivityDataService.swift`を新規作成
- DeviceActivity APIを使用してアプリ使用時間・ピックアップ回数を取得
- HealthKitを使用して歩数・睡眠データを取得（権限が必要）
- CoreMotionを使用して活動状態を取得（権限が必要）
- データをローカル（UserDefaultsまたはCoreData）に保存
- バックエンドAPIに送信（`/api/mobile/activity`エンドポイント）

**取得データ例**:

```swift
struct ActivityData {
    let date: Date
    let appUsage: [AppUsage] // アプリごとの使用時間
    let totalPickups: Int
    let firstPickupTime: Date?
    let longestActivityDuration: TimeInterval?
    let stepCount: Int?
    let sleepStartTime: Date?
    let sleepEndTime: Date?
    let activityType: ActivityType? // 静止、歩行など
}
```

### 機能2: 行動パターン分析エンジン（BehaviorPatternAnalyzer）

**目的**: 収集した行動データからパターンを分析し、問題点を特定

**実装内容**:

- `aniccaios/aniccaios/Services/BehaviorPatternAnalyzer.swift`を新規作成
- 過去7日間のデータを分析
- 以下のパターンを検出:
  - **夜更かしパターン**: 就寝時刻が遅い日が3日以上続いている
  - **スクリーンタイム過多**: 1日のスクリーンタイムが6時間以上
  - **SNS依存**: 特定のSNSアプリ（Twitter、Instagramなど）の使用時間が長い
  - **運動不足**: 歩数が少ない日が続いている
  - **朝のスマホ依存**: 起床直後に長時間スマホを使用している

**分析結果例**:

```swift
struct BehaviorPattern {
    let type: PatternType
    let severity: Severity // .low, .medium, .high
    let description: String
    let suggestedHabit: HabitType?
    let suggestedTime: DateComponents?
}

enum PatternType {
    case lateBedtime
    case excessiveScreenTime
    case socialMediaAddiction
    case lackOfExercise
    case morningPhoneAddiction
}
```

### 機能3: 習慣サジェスト機能（HabitSuggestionService）

**目的**: 行動パターン分析結果に基づいて習慣をサジェスト

**実装内容**:

- `aniccaios/aniccaios/Services/HabitSuggestionService.swift`を新規作成
- `BehaviorPatternAnalyzer`の結果を受け取り、適切な習慣をサジェスト
- サジェストロジック:
  - **夜更かしパターン検出時**: 「11時に寝る習慣を身につけませんか？」→ `bedtime`習慣をサジェスト
  - **朝のスマホ依存検出時**: 「朝のスマホ時間を減らす習慣を身につけませんか？」→ `wake`習慣の時刻を調整してサジェスト
  - **運動不足検出時**: 「散歩の習慣を身につけませんか？」→ `training`習慣をサジェスト
  - **SNS依存検出時**: 「SNSの使用時間を制限する習慣を身につけませんか？」→ カスタム習慣をサジェスト

**UI実装**:

- `aniccaios/aniccaios/Views/HabitSuggestionView.swift`を新規作成
- サジェストをカード形式で表示
- 「この習慣を追加する」ボタンで習慣を追加
- 「後で」ボタンでスキップ

### 機能4: データ駆動型Nudge機能（DataDrivenNudgeService）

**目的**: 行動データに基づいて適切なタイミングでNudgeを送信

**実装内容**:

- `aniccaios/aniccaios/Services/DataDrivenNudgeService.swift`を新規作成
- リアルタイムで行動データを監視
- 以下のタイミングでNudgeを送信:
  - **SNSアプリを長時間使用中**: 「もう30分使っていますね。一度休憩しませんか？」
  - **就寝時刻が近づいている**: 「もうすぐ就寝時刻です。スマホを置いて準備を始めませんか？」
  - **朝のスマホ使用開始**: 「起きたばかりですね。まずは朝の準備を始めませんか？」
  - **運動不足の日**: 「今日はあまり歩いていませんね。少し散歩してみませんか？」

**実装方法**:

- DeviceActivity Monitor Extensionを使用してリアルタイム監視
- 閾値を超えたら通知を送信
- 通知アクションで音声セッションを開始

### 機能5: バックエンドAPIエンドポイント追加

**目的**: 行動データをサーバーに送信・保存

**実装内容**:

- `apps/api/src/routes/mobile/activity.js`を新規作成
- `POST /api/mobile/activity`: 行動データを送信
- `GET /api/mobile/activity/patterns`: 行動パターン分析結果を取得
- データベースに`user_activity_data`テーブルを作成（マイグレーション）

---

## 実装ファイル一覧

### iOSアプリ側

1. **新規作成**:

   - `aniccaios/aniccaios/Services/ActivityDataService.swift`: 行動データ収集サービス
   - `aniccaios/aniccaios/Services/BehaviorPatternAnalyzer.swift`: 行動パターン分析エンジン
   - `aniccaios/aniccaios/Services/HabitSuggestionService.swift`: 習慣サジェストサービス
   - `aniccaios/aniccaios/Services/DataDrivenNudgeService.swift`: データ駆動型Nudgeサービス
   - `aniccaios/aniccaios/Views/HabitSuggestionView.swift`: 習慣サジェストUI
   - `aniccaios/aniccaios/Models/ActivityData.swift`: 行動データモデル
   - `aniccaios/aniccaios/Models/BehaviorPattern.swift`: 行動パターンモデル

2. **拡張**:

   - `aniccaios/aniccaios/AppState.swift`: 行動データとサジェスト状態を追加
   - `aniccaios/aniccaios/Info.plist`: DeviceActivity、HealthKit、CoreMotionの権限説明を追加
   - `aniccaios/aniccaios.xcodeproj/project.pbxproj`: DeviceActivity Extension、HealthKit、CoreMotionフレームワークを追加

### バックエンドAPI側

1. **新規作成**:

   - `apps/api/src/routes/mobile/activity.js`: 行動データAPIエンドポイント
   - `apps/api/src/services/activityService.js`: 行動データ処理サービス
   - `docs/migrations/009_user_activity_data.sql`: 行動データテーブル作成マイグレーション

2. **拡張**:

   - `apps/api/src/routes/mobile/index.js`: 行動データルーターを追加

---

## 実装の優先順位

### Phase 1: 基礎データ収集（最優先）

1. DeviceActivity APIを使用したアプリ使用時間・ピックアップ回数の取得
2. データのローカル保存
3. バックエンドAPIへの送信

### Phase 2: パターン分析とサジェスト

1. 行動パターン分析エンジンの実装
2. 習慣サジェスト機能の実装
3. サジェストUIの実装

### Phase 3: データ駆動型Nudge

1. リアルタイム監視機能の実装
2. Nudge送信ロジックの実装

### Phase 4: 追加データソース（オプション）

1. HealthKit統合（歩数、睡眠データ）
2. CoreMotion統合（活動状態）
3. 位置情報統合（移動パターン）

---

## 重要な注意点

### プライバシーと権限

- DeviceActivity APIを使用するには`FamilyControls`フレームワークの権限が必要
- HealthKitを使用するには`NSHealthShareUsageDescription`と`NSHealthUpdateUsageDescription`が必要
- CoreMotionを使用するには`NSMotionUsageDescription`が必要
- ユーザーにデータ収集の目的を明確に説明する必要がある

### バッテリー消費

- データ収集は必要最小限の頻度で実行
- バックグラウンドでのデータ収集は適切にスケジュール

### データの保存と同期

- 機密性の高いデータ（位置情報など）は暗号化して保存
- バックエンドへの送信はユーザーの同意を得てから

---

## 参考資料

- ScreenBreak実装: `/Users/cbns03/Downloads/anicca-project/examples/ScreenBreak`
- DeviceActivity API: [Apple Developer Documentation](https://developer.apple.com/documentation/deviceactivity)
- HealthKit: [Apple Developer Documentation](https://developer.apple.com/documentation/healthkit)
- CoreMotion: [Apple Developer Documentation](https://developer.apple.com/documentation/coremotion)

### To-dos

- [ ] ActivityDataServiceを実装: DeviceActivity APIを使用してアプリ使用時間・ピックアップ回数を取得し、ローカル保存とバックエンド送信を行う
- [ ] バックエンドAPIエンドポイントを実装: POST /api/mobile/activityで行動データを受信・保存する
- [ ] BehaviorPatternAnalyzerを実装: 過去7日間のデータから夜更かし・スクリーンタイム過多・SNS依存などのパターンを検出
- [ ] HabitSuggestionServiceを実装: 行動パターン分析結果に基づいて適切な習慣（bedtime、wake、trainingなど）をサジェスト
- [ ] HabitSuggestionViewを実装: サジェストをカード形式で表示し、「この習慣を追加する」ボタンで習慣を追加できるUI
- [ ] DataDrivenNudgeServiceを実装: リアルタイムで行動データを監視し、適切なタイミングでNudge通知を送信
- [ ] HealthKit統合（オプション）: 歩数・睡眠データを取得して行動データに追加
- [ ] CoreMotion統合（オプション）: 活動状態（静止・歩行など）を取得して行動データに追加