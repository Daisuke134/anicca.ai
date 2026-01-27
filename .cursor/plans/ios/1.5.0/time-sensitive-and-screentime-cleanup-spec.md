# Time Sensitive 通知有効化 & ScreenTimeReport Extension 削除

## 概要（What & Why）

### What

2つの独立した変更を行う：

| # | 変更 | 概要 |
|---|------|------|
| 1 | **Time Sensitive 通知の有効化** | 通知の `interruptionLevel` を `.active` → `.timeSensitive` に変更し、Sleep Focus 中でもNudgeが届くようにする |
| 2 | **AniccaScreenTimeReport Extension の削除** | 未使用の DeviceActivity Report Extension を完全削除する |

### Why

**Time Sensitive 通知:**
- staying_up_late の 23:30 通知は、多くのユーザーが Sleep Focus を有効にしている時間帯
- 現状 `.active` レベルのため、Sleep Focus 中はサイレントに飲み込まれる
- Entitlement は既に取得済み（`com.apple.developer.usernotifications.time-sensitive` = true）だが、コードで活用していない
- ペルソナの「夜更かしでスマホを見続ける」行動を止めるには、Focus 中でも介入が必要

**ScreenTimeReport Extension 削除:**
- Xcode 26 / iOS 26 SDK との互換性問題でビルドエラー（赤エラー）が発生中
- メインアプリの機能として使用していない（Nudgeシステムが中心）
- CLAUDE.md「未使用コードは容赦なく削除」ルールに従う

---

## 受け入れ条件

### Time Sensitive 通知

| # | 条件 | テスト可能 |
|---|------|-----------|
| AC-1 | `requestAuthorization` で `.timeSensitive` オプションを要求する | ✅ |
| AC-2 | Problem Nudge の `interruptionLevel` が `.timeSensitive` になる | ✅ |
| AC-3 | Server-driven Nudge の `interruptionLevel` が `.timeSensitive` になる | ✅ |
| AC-4 | iOS 14 以下では `interruptionLevel` 設定をスキップする（既存の `#available` ガード維持） | ✅ |
| AC-5 | オンボーディングの通知許可チェックが引き続き `timeSensitiveSetting` を検証する | ✅ |

### ScreenTimeReport Extension 削除

| # | 条件 | テスト可能 |
|---|------|-----------|
| AC-6 | `AniccaScreenTimeReport` ターゲットが Xcode プロジェクトから削除されている | ✅ |
| AC-7 | `AniccaScreenTimeReport/` ディレクトリが削除されている | ✅ |
| AC-8 | `ScreenTimeSharedStore.swift` が削除されている（メインアプリ側の共有ストア） | ✅ |
| AC-9 | ScreenTime 関連の参照がメインアプリから除去されている | ✅ |
| AC-10 | ビルドが成功する（`fastlane test`） | ✅ |

---

## As-Is / To-Be

### 変更1: Time Sensitive 通知

#### As-Is

**`NotificationScheduler.swift:43`**
```swift
let notificationsGranted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
```

**`NotificationScheduler.swift:113`**
```swift
content.interruptionLevel = .active
```

**`ProblemNotificationScheduler.swift:235`**
```swift
notificationContent.interruptionLevel = .active
```

**`ProblemNotificationScheduler.swift:175-176`**（テスト通知）
```swift
notificationContent.interruptionLevel = .active
```

#### To-Be

**`NotificationScheduler.swift:43`** — 認可リクエストに `.timeSensitive` 追加
```swift
let notificationsGranted = try await center.requestAuthorization(options: [.alert, .sound, .badge, .timeSensitive])
```

**`NotificationScheduler.swift:113`** — interruptionLevel 変更
```swift
content.interruptionLevel = .timeSensitive
```

**`ProblemNotificationScheduler.swift:235`** — interruptionLevel 変更
```swift
notificationContent.interruptionLevel = .timeSensitive
```

**`ProblemNotificationScheduler.swift:175-176`** — テスト通知も同様
```swift
notificationContent.interruptionLevel = .timeSensitive
```

### 変更2: ScreenTimeReport Extension 削除

#### As-Is

```
aniccaios/
├── AniccaScreenTimeReport/
│   └── ScreenTimeReportExtension.swift    ← DeviceActivity Report Extension
├── aniccaios/
│   └── Shared/
│       └── ScreenTimeSharedStore.swift    ← App Groups 共有ストア
└── aniccaios.xcodeproj                    ← AniccaScreenTimeReport ターゲット含む
```

#### To-Be

```
aniccaios/
├── aniccaios/
│   └── Shared/                            ← ScreenTimeSharedStore.swift 削除済み
└── aniccaios.xcodeproj                    ← AniccaScreenTimeReport ターゲット削除済み
```

**削除対象ファイル:**

| ファイル/ディレクトリ | 理由 |
|----------------------|------|
| `AniccaScreenTimeReport/` ディレクトリ全体 | Extension 本体 |
| `aniccaios/Shared/ScreenTimeSharedStore.swift` | Extension との共有ストア（メインアプリで未使用） |
| Xcode ターゲット `AniccaScreenTimeReport` | ビルドターゲット |
| 関連する Embed Extension 設定 | ビルドフェーズ |

---

## テストマトリックス

| # | To-Be | テスト名 | カバー |
|---|-------|----------|--------|
| 1 | requestAuthorization に `.timeSensitive` 含む | `test_requestAuthorization_includesTimeSensitive()` | ✅ |
| 2 | Problem Nudge の interruptionLevel が `.timeSensitive` | `test_problemNudge_interruptionLevel_isTimeSensitive()` | ✅ |
| 3 | Server-driven Nudge の interruptionLevel が `.timeSensitive` | `test_serverNudge_interruptionLevel_isTimeSensitive()` | ✅ |
| 4 | ScreenTimeSharedStore がプロジェクトに存在しない | `test_screenTimeSharedStore_removed()`（ビルド成功で暗黙的に検証） | ✅ |
| 5 | ビルド成功（Extension 削除後） | `fastlane test` 通過 | ✅ |

---

## 境界

### やること

| # | 内容 |
|---|------|
| 1 | `requestAuthorization` に `.timeSensitive` オプション追加 |
| 2 | 全通知の `interruptionLevel` を `.timeSensitive` に変更 |
| 3 | `AniccaScreenTimeReport` ターゲット & ファイル削除 |
| 4 | `ScreenTimeSharedStore.swift` 削除 |
| 5 | メインアプリから ScreenTime 参照を除去 |

### やらないこと

| # | 内容 | 理由 |
|---|------|------|
| 1 | 通知ごとに interruptionLevel を分ける（夜間だけ timeSensitive 等） | 全Nudgeはユーザーが助けを求めた問題への介入であり、全て Time Sensitive に該当 |
| 2 | オンボーディング UI の変更 | 既存の通知許可ダイアログに `.timeSensitive` が自動的に含まれる。別画面不要 |
| 3 | Focus Mode API の検出・連携 | iOS が自動で Time Sensitive の突破を制御するため不要 |
| 4 | `.critical` レベルの使用 | Apple の特別承認が必要（医療・緊急用途のみ） |
| 5 | HealthKit entitlement の削除 | ScreenTime とは無関係。別機能で使用中の可能性あり |

### 触るファイル

| ファイル | 変更内容 |
|---------|---------|
| `aniccaios/aniccaios/Notifications/NotificationScheduler.swift` | `.timeSensitive` 追加（2箇所） |
| `aniccaios/aniccaios/Notifications/ProblemNotificationScheduler.swift` | `.timeSensitive` 変更（2箇所） |
| `aniccaios/AniccaScreenTimeReport/` | ディレクトリ削除 |
| `aniccaios/aniccaios/Shared/ScreenTimeSharedStore.swift` | ファイル削除 |
| `aniccaios/aniccaios.xcodeproj/project.pbxproj` | ターゲット & ファイル参照削除 |

### 触らないファイル

| ファイル | 理由 |
|---------|------|
| `NotificationPermissionStepView.swift` | 既に `timeSensitiveSetting` チェック済み。変更不要 |
| `AppDelegate.swift` | 通知受信処理は変更不要 |
| Entitlements ファイル | `time-sensitive` は既に有効 |
| `ProblemType.swift` | スケジュール時刻は変更不要 |

---

## 実行手順

```bash
# 1. テスト（変更前の状態確認）
cd aniccaios && FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_OPT_OUT_CRASH_REPORTING=1 fastlane test

# 2. 実装（Time Sensitive + ScreenTime削除）

# 3. テスト（変更後）
cd aniccaios && FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_OPT_OUT_CRASH_REPORTING=1 fastlane test

# 4. 実機確認（ユーザー許可後）
cd aniccaios && FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_OPT_OUT_CRASH_REPORTING=1 fastlane build_for_device
```

---

## 補足: Time Sensitive 通知の制約

| 項目 | 詳細 |
|------|------|
| **ユーザーコントロール** | ユーザーは `設定 → 通知 → Anicca → Time Sensitive を許可` でOFF可能 |
| **iOS デフォルト** | Time Sensitive はデフォルト ON（大多数のユーザーに届く） |
| **乱用リスク** | 全通知を Time Sensitive にすると、ユーザーがアプリ単位で無効化する可能性 |
| **正当性** | Anicca のNudgeは「ユーザーが選んだ問題への介入」であり、Time Sensitive の正当なユースケース |
| **Sleep Focus 突破** | ユーザーが Sleep Focus で Time Sensitive を許可している場合のみ突破 |
