# 実装仕様書 + 完全パッチ（最終版）

---

## 概要

| # | 項目 | 優先度 |
|---|------|--------|
| 1 | 撮影用デバッグパターン修正（7→8 を 6→7 に） | 高 |
| 2 | チェックボックスサイズ拡大 + Figma準拠 | 高 |
| 3 | ストリークアイコン変更（🔥 → 🪷）+ 右上配置 | 高 |
| 4 | ストリーク達成ダイアログ実装（シェアボタンなし） | 高 |

---

今回実現するユーザー体験
#	体験	詳細
1	習慣の完了チェック	各習慣カードの左端にある32pxの円形チェックボックスをタップすると、その日の完了をマークできる
2	ストリーク表示	連続達成日数が🪷アイコンと数字でカード右上にピル型背景で表示される
3	ストリーク加算	チェックONでストリーク+1、OFFで-1
4	ストリークリセット	チェックOFFのまま翌日0時を迎えるとストリークが0にリセット
5	マイルストーン祝福	7/14/21/30/60/90/100/365日達成時にダイアログ表示
6	撮影用デバッグ	プロフィール画面から撮影用のストリーク値を設定可能（29→30、6→7など）

## 注意事項

- **ストリークデータはUserDefaults（ローカル）のみ保存**
- アプリ削除で消える、別デバイスで引き継がれない
- サーバー同期は今回スコープ外（今後の課題）

---

## 1. 撮影用デバッグパターン修正

### AppState.swift - setupRecording メソッド

```swift
// 旧コード:
case 4: // 7→8用（トレーニングだけ未完了）
    setStreakForRecording(habitId: "wake", streak: 30, completed: true)
    setStreakForRecording(habitId: "training", streak: 7, completed: false)
    setStreakForRecording(habitId: "bedtime", streak: 30, completed: true)
    for (index, config) in customHabits.enumerated() {
        setStreakForRecording(habitId: config.id.uuidString, streak: customStreaksCompleted[index % 4], completed: true)
    }

// 新コード:
case 4: // 6→7用（7日達成ダイアログ撮影用）
    setStreakForRecording(habitId: "wake", streak: 30, completed: true)
    setStreakForRecording(habitId: "training", streak: 6, completed: false) // 6に変更
    setStreakForRecording(habitId: "bedtime", streak: 30, completed: true)
    for (index, config) in customHabits.enumerated() {
        setStreakForRecording(habitId: config.id.uuidString, streak: customStreaksCompleted[index % 4], completed: true)
    }
```

### ProfileView.swift - ボタンラベル修正

```swift
// 旧:
Button("4️⃣ 7→8用") {
    appState.setupRecording(pattern: 4)
}

// 新:
Button("4️⃣ 6→7用（7日達成）") {
    appState.setupRecording(pattern: 4)
}
```

---

## 2. チェックボックス - Figma準拠（円形、ゴールド、32px）

### HabitsSectionView.swift - checkBox メソッド

```swift
// 旧コード:
// MARK: - Checkbox Component
@ViewBuilder
private func checkBox(isCompleted: Bool, onTap: @escaping () -> Void) -> some View {
    Button {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
            onTap()
        }
        if !isCompleted {
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        }
    } label: {
        ZStack {
            RoundedRectangle(cornerRadius: 6)
                .stroke(isCompleted ? Color.clear : AppTheme.Colors.border, lineWidth: 1.5)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(isCompleted ? AppTheme.Colors.accent : Color.clear)
                )
                .frame(width: 24, height: 24)
            
            if isCompleted {
                Image(systemName: "checkmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .scaleEffect(isCompleted ? 1.0 : 0.5)
            }
        }
        .scaleEffect(isCompleted ? 1.0 : 0.95)
    }
    .buttonStyle(.plain)
}

// 新コード（Figma準拠）:
// MARK: - Checkbox Component
@ViewBuilder
private func checkBox(isCompleted: Bool, onTap: @escaping () -> Void) -> some View {
    Button {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
            onTap()
        }
        if !isCompleted {
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        }
    } label: {
        ZStack {
            Circle()  // Figmaでは円形
                .stroke(isCompleted ? Color.clear : Color(red: 0.79, green: 0.70, blue: 0.51), lineWidth: 2.5)
                .background(
                    Circle()
                        .fill(isCompleted ? Color(red: 0.79, green: 0.70, blue: 0.51) : Color.clear)  // #C9B382
                )
                .frame(width: 32, height: 32)
            
            if isCompleted {
                Image(systemName: "checkmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .scaleEffect(isCompleted ? 1.0 : 0.5)
            }
        }
        .scaleEffect(isCompleted ? 1.0 : 0.95)
    }
    .buttonStyle(.plain)
    .frame(width: 44, height: 44)  // タップ領域確保
    .contentShape(Rectangle())
}
```

---

## 3. habitRow - ストリークバッジを右上に配置（Figma準拠）

### HabitsSectionView.swift - habitRow メソッド全体

```swift
// 旧コード:
private func habitRow(for habit: HabitType, time: DateComponents?) -> some View {
    let isActive = activeHabits.contains(habit)
    let date = time.flatMap { Calendar.current.date(from: $0) }
    let habitId = habit.rawValue
    let isCompleted = appState.isDailyCompleted(for: habitId)
    let streak = appState.currentStreak(for: habitId)

    HStack(spacing: 12) {
        // チェックボックス
        checkBox(isCompleted: isCompleted) {
            if isCompleted {
                appState.unmarkDailyCompleted(for: habitId)
            } else {
                appState.markDailyCompleted(for: habitId)
            }
        }
        
        // 習慣名
        Text(habit.title)
            .font(AppTheme.Typography.headlineDynamic)
            .foregroundStyle(AppTheme.Colors.label)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture {
                if isActive {
                    activeSheet = .editor(habit)
                } else {
                    sheetTime = date ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
                    activeSheet = .habit(habit)
                }
            }

        // ストリークバッジ（固定幅で位置を揃える）
        Text(streak > 0 ? "🔥\(streak)" : "")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Color.orange)
            .frame(width: 40, alignment: .trailing)

        // 時刻表示（固定幅で位置を揃える）
        Text(isActive && date != nil ? date!.formatted(.dateTime.hour().minute()) : "")
            .font(AppTheme.Typography.subheadlineDynamic)
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
            .frame(width: 50, alignment: .trailing)

        // トグル
        Toggle("", isOn: Binding(
            // ... 既存のトグルロジック ...
        ))
        .labelsHidden()
        .tint(AppTheme.Colors.accent)
    }
}

// 新コード（Figma準拠 - ストリークバッジを右上に配置）:
private func habitRow(for habit: HabitType, time: DateComponents?) -> some View {
    let isActive = activeHabits.contains(habit)
    let date = time.flatMap { Calendar.current.date(from: $0) }
    let habitId = habit.rawValue
    let isCompleted = appState.isDailyCompleted(for: habitId)
    let streak = appState.currentStreak(for: habitId)
    
    ZStack(alignment: .topTrailing) {
        // メインコンテンツ
        HStack(spacing: 16) {
            // チェックボックス
            checkBox(isCompleted: isCompleted) {
                if isCompleted {
                    appState.unmarkDailyCompleted(for: habitId)
                } else {
                    appState.markDailyCompleted(for: habitId)
                }
            }
            
            // 習慣名
            Text(habit.title)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color(red: 0.23, green: 0.23, blue: 0.23))  // #3A3A3A
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture {
                    if isActive {
                        activeSheet = .editor(habit)
                    } else {
                        sheetTime = date ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
                        activeSheet = .habit(habit)
                    }
                }
            
            // 時刻表示
            if isActive, let date = date {
                Text(date.formatted(.dateTime.hour().minute()))
                    .font(.system(size: 14))
                    .foregroundStyle(Color(red: 0.54, green: 0.54, blue: 0.51))  // #8A8A82
            }
            
            // トグル
            Toggle("", isOn: Binding(
                get: { activeHabits.contains(habit) },
                set: { isOn in
                    withAnimation(.easeInOut(duration: 0.18)) {
                        if isOn {
                            if let date = date {
                                if habit == .wake {
                                    Task {
                                        await requestAlarmKitPermissionIfNeeded()
                                    }
                                }
                                activeHabits.insert(habit)
                                habitTimes[habit] = date
                            } else {
                                sheetTime = Calendar.current.date(from: habit.defaultTime) ?? Date()
                                activeSheet = .habit(habit)
                            }
                        } else {
                            activeHabits.remove(habit)
                            Task { @MainActor in
                                try? await Task.sleep(nanoseconds: 220_000_000)
                                var t = Transaction()
                                t.disablesAnimations = true
                                withTransaction(t) {
                                    habitTimes.removeValue(forKey: habit)
                                    appState.removeHabitSchedule(habit)
                                }
                            }
                        }
                    }
                }
            ))
            .labelsHidden()
            .tint(Color(red: 0.79, green: 0.70, blue: 0.51))  // #C9B382
        }
        .padding(.vertical, 20)
        .padding(.horizontal, 20)
        
        // ストリークバッジ（右上角に配置）
        if streak > 0 {
            HStack(spacing: 4) {
                Text("🪷")
                    .font(.system(size: 14))
                Text("\(streak)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Color(red: 0.79, green: 0.70, blue: 0.51))  // #C9B382
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(Color(red: 0.79, green: 0.70, blue: 0.51).opacity(0.1))  // 薄いゴールド背景
            )
            .padding(.top, 8)
            .padding(.trailing, 12)
        }
    }
}
```

---

## 4. customHabitRow - 同様の変更

```swift
// customHabitRow も habitRow と同じ構造に変更
// ストリークバッジを右上に配置、チェックボックスを円形・ゴールドに
// 上記 habitRow の構造を参考に修正
```

---

## 5. ストリーク達成ダイアログ（シェアボタンなし）

### 新規ファイル: StreakMilestoneSheet.swift

```swift
import SwiftUI

struct StreakMilestoneSheet: View {
    let habitName: String
    let streak: Int
    let onDismiss: () -> Void
    
    @State private var showAnimation = false
    @State private var scale: CGFloat = 0.8
    @State private var opacity: Double = 0
    
    static let milestones: Set<Int> = [7, 14, 21, 30, 60, 90, 100, 365]
    
    private var milestoneTitle: String {
        switch streak {
        case 7: return String(localized: "milestone_7_title", defaultValue: "1週間、続けられました")
        case 14: return String(localized: "milestone_14_title", defaultValue: "2週間、続けられました")
        case 21: return String(localized: "milestone_21_title", defaultValue: "3週間、続けられました")
        case 30: return String(localized: "milestone_30_title", defaultValue: "1ヶ月、続けられました")
        case 60: return String(localized: "milestone_60_title", defaultValue: "2ヶ月、続けられました")
        case 90: return String(localized: "milestone_90_title", defaultValue: "3ヶ月、続けられました")
        case 100: return String(localized: "milestone_100_title", defaultValue: "100日、続けられました")
        case 365: return String(localized: "milestone_365_title", defaultValue: "1年、続けられました")
        default: return String(localized: "milestone_generic_title", defaultValue: "素晴らしい継続です")
        }
    }
    
    private var milestoneSubtitle: String {
        String(localized: "milestone_subtitle \(habitName) \(streak)", 
               defaultValue: "\(habitName)を\(streak)日間続けています")
    }
    
    var body: some View {
        ZStack {
            // 背景オーバーレイ（Figma: rgba(0,0,0,0.5) + blur）
            Color.black.opacity(0.5)
                .ignoresSafeArea()
                .onTapGesture { dismiss() }
            
            // ダイアログカード
            VStack(spacing: 0) {
                // 蓮アイコン（Figma: 96px円、#F4D9D0 30%背景）
                ZStack {
                    Circle()
                        .fill(Color(red: 0.96, green: 0.85, blue: 0.82).opacity(0.3))
                        .frame(width: 96, height: 96)
                    
                    Text("🪷")
                        .font(.system(size: 48))
                        .scaleEffect(showAnimation ? 1.05 : 1.0)
                        .animation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true), value: showAnimation)
                }
                .padding(.top, 32)
                
                // 日数表示（Figma: 72px bold #D4A574）
                HStack(alignment: .lastTextBaseline, spacing: 0) {
                    Text("\(streak)")
                        .font(.system(size: 72, weight: .bold, design: .rounded))
                        .foregroundStyle(Color(red: 0.83, green: 0.65, blue: 0.46))
                    
                    Text("日")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(Color(red: 0.83, green: 0.65, blue: 0.46))
                        .padding(.bottom, 12)
                }
                .padding(.top, 24)
                
                // 区切り線（Figma: 48px x 2px）
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color(red: 0.83, green: 0.65, blue: 0.46).opacity(0.3))
                    .frame(width: 48, height: 2)
                    .padding(.top, 4)
                
                // メインメッセージ（Figma: 24px bold #3A3A3A）
                Text(milestoneTitle)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(Color(red: 0.23, green: 0.23, blue: 0.23))
                    .multilineTextAlignment(.center)
                    .padding(.top, 24)
                
                // サブメッセージ（Figma: 16px #9CA3AF）
                Text(milestoneSubtitle)
                    .font(.system(size: 16))
                    .foregroundStyle(Color(red: 0.61, green: 0.64, blue: 0.69))
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
                    .padding(.horizontal, 24)
                
                // 続けるボタン（Figma: グラデーション #D4A574→#E8B896）
                Button(action: dismiss) {
                    Text(String(localized: "milestone_continue", defaultValue: "続けていく"))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(
                            LinearGradient(
                                colors: [
                                    Color(red: 0.83, green: 0.65, blue: 0.46),
                                    Color(red: 0.91, green: 0.72, blue: 0.59)
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .clipShape(Capsule())
                        .shadow(color: Color(red: 0.83, green: 0.65, blue: 0.46).opacity(0.3), radius: 10, y: 4)
                }
                .padding(.horizontal, 32)
                .padding(.top, 32)
                .padding(.bottom, 32)
            }
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .shadow(color: .black.opacity(0.15), radius: 20, y: 10)
            .padding(.horizontal, 24)
            .scaleEffect(scale)
            .opacity(opacity)
        }
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                scale = 1.0
                opacity = 1.0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                showAnimation = true
            }
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        }
    }
    
    private func dismiss() {
        withAnimation(.easeOut(duration: 0.2)) {
            scale = 0.8
            opacity = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            onDismiss()
        }
    }
}
```

---

## 6. AppState.swift - マイルストーン連携

### プロパティ追加

```swift
// @Published セクションに追加:
@Published var pendingMilestone: (habitName: String, streak: Int)? = nil

// private プロパティに追加:
private let milestones: Set<Int> = [7, 14, 21, 30, 60, 90, 100, 365]
```

### markDailyCompleted メソッド修正

```swift
func markDailyCompleted(for habitId: String) {
    updateStreaksIfNeeded()
    
    var data = habitStreaks[habitId] ?? HabitStreakData()
    let today = Calendar.current.startOfDay(for: Date())
    
    guard data.lastCompletedDate != today else { return }
    
    if let lastDate = data.lastCompletedDate {
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: today)!
        if Calendar.current.isDate(lastDate, inSameDayAs: yesterday) {
            data.currentStreak += 1
        } else {
            data.currentStreak = 1
        }
    } else {
        data.currentStreak = 1
    }
    
    data.lastCompletedDate = today
    habitStreaks[habitId] = data
    saveHabitStreaks()
    
    // マイルストーン達成チェック（新規追加）
    if milestones.contains(data.currentStreak) {
        let habitName = getHabitDisplayName(for: habitId)
        pendingMilestone = (habitName: habitName, streak: data.currentStreak)
    }
}
```

### 新規ヘルパーメソッド

```swift
private func getHabitDisplayName(for habitId: String) -> String {
    if let habitType = HabitType(rawValue: habitId) {
        return habitType.title
    }
    if let customConfig = customHabits.first(where: { $0.id.uuidString == habitId }) {
        return customConfig.name
    }
    return habitId
}
```

---

## 7. HabitsSectionView.swift - ダイアログ表示

### body の最後に追加

```swift
// .sheet の後に追加:
.overlay {
    if let milestone = appState.pendingMilestone {
        StreakMilestoneSheet(
            habitName: milestone.habitName,
            streak: milestone.streak
        ) {
            appState.pendingMilestone = nil
        }
    }
}
```

---

## 8. ローカライズ文字列（シェア削除版）

### Localizable.xcstrings に追加

```json
{
  "milestone_7_title": {
    "localizations": {
      "en": { "stringUnit": { "state": "translated", "value": "1 Week Strong!" } },
      "ja": { "stringUnit": { "state": "translated", "value": "1週間、続けられました" } }
    }
  },
  "milestone_14_title": {
    "localizations": {
      "en": { "stringUnit": { "state": "translated", "value": "2 Weeks Strong!" } },
      "ja": { "stringUnit": { "state": "translated", "value": "2週間、続けられました" } }
    }
  },
  "milestone_21_title": {
    "localizations": {
      "en": { "stringUnit": { "state": "translated", "value": "3 Weeks Strong!" } },
      "ja": { "stringUnit": { "state": "translated", "value": "3週間、続けられました" } }
    }
  },
  "milestone_30_title": {
    "localizations": {
      "en": { "stringUnit": { "state": "translated", "value": "1 Month Strong!" } },
      "ja": { "stringUnit": { "state": "translated", "value": "1ヶ月、続けられました" } }
    }
  },
  "milestone_60_title": {
    "localizations": {
      "en": { "stringUnit": { "state": "translated", "value": "2 Months Strong!" } },
      "ja": { "stringUnit": { "state": "translated", "value": "2ヶ月、続けられました" } }
    }
  },
  "milestone_90_title": {
    "localizations": {
      "en": { "stringUnit": { "state": "translated", "value": "3 Months Strong!" } },
      "ja": { "stringUnit": { "state": "translated", "value": "3ヶ月、続けられました" } }
    }
  },
  "milestone_100_title": {
    "localizations": {
      "en": { "stringUnit": { "state": "translated", "value": "100 Days Strong!" } },
      "ja": { "stringUnit": { "state": "translated", "value": "100日、続けられました" } }
    }
  },
  "milestone_365_title": {
    "localizations": {
      "en": { "stringUnit": { "state": "translated", "value": "1 Year Strong!" } },
      "ja": { "stringUnit": { "state": "translated", "value": "1年、続けられました" } }
    }
  },
  "milestone_generic_title": {
    "localizations": {
      "en": { "stringUnit": { "state": "translated", "value": "Amazing Consistency!" } },
      "ja": { "stringUnit": { "state": "translated", "value": "素晴らしい継続です" } }
    }
  },
  "milestone_subtitle %@ %lld": {
    "localizations": {
      "en": { "stringUnit": { "state": "translated", "value": "You've kept up with %1$@ for %2$lld days" } },
      "ja": { "stringUnit": { "state": "translated", "value": "%1$@を%2$lld日間続けています" } }
    }
  },
  "milestone_continue": {
    "localizations": {
      "en": { "stringUnit": { "state": "translated", "value": "Keep Going" } },
      "ja": { "stringUnit": { "state": "translated", "value": "続けていく" } }
    }
  }
}
```

---

## 撮影用デバッグ機能まとめ

| パターン | 内容 | 用途 |
|----------|------|------|
| **1️⃣** | バラバラストリーク（全チェック済み） | 習慣タブ全体の見た目撮影 |
| **2️⃣** | 29→30用（全部未完了） | 30日達成ダイアログ撮影 |
| **4️⃣** | 6→7用（トレーニングだけ未完了） | 7日達成ダイアログ撮影 |
| **5️⃣** | 全部🪷30 | 完璧な状態の撮影 |

---

## Figmaデザイン対応確認

| Figma要素 | 色/サイズ | パッチ反映 |
|-----------|----------|-----------|
| **ダイアログ背景** | rgba(0,0,0,0.5) | ✅ |
| **カード角丸** | 24px | ✅ |
| **蓮アイコン背景** | #F4D9D0 30%、96px円 | ✅ |
| **日数テキスト** | 72px bold #D4A574 | ✅ |
| **「日」テキスト** | 24px #D4A574 | ✅ |
| **区切り線** | 48px x 2px | ✅ |
| **タイトル** | 24px bold #3A3A3A | ✅ |
| **サブタイトル** | 16px #9CA3AF | ✅ |
| **ボタングラデーション** | #D4A574→#E8B896 | ✅ |
| **シェアボタン** | 削除 | ✅ |
| **チェックボックス** | 32px円、#C9B382 | ✅ |
| **ストリークバッジ** | 右上角、ピル型、薄ゴールド背景 | ✅ |
| **トグル色** | #C9B382 | ✅ |

---

## ユーザー体験フロー

### 毎日の習慣チェック
1. アプリを開く → 習慣タブ表示
2. 各カードに🪷アイコンと継続日数が右上に表示
3. チェックボックス（32px円形）をタップ
4. スプリングアニメーション + ハプティック + ストリーク+1

### マイルストーン達成時（7/14/21/30/60/90/100/365日）
1. チェックを入れてマイルストーン達成
2. お祝いダイアログがアニメーションで表示
3. 「続けていく」をタップして閉じる

### チェックを外した場合
- ストリーク-1、再度チェックで+1（同日内なら何度でもやり直し可能）

### 翌日になった場合
- チェックボックスはリセット、ストリークは維持
- 今日もチェック → ストリーク+1

### チェック忘れて翌日
- ストリークリセット（0）→ 今日チェックで1から再スタート

了解しました。

---

## 今回実現するユーザー体験

| # | 体験 | 詳細 |
|---|------|------|
| 1 | 習慣の完了チェック | 各習慣カードの左端にある32pxの円形チェックボックスをタップすると、その日の完了をマークできる |
| 2 | ストリーク表示 | 連続達成日数が🪷アイコンと数字でカード右上にピル型背景で表示される |
| 3 | ストリーク加算 | チェックONでストリーク+1、OFFで-1 |
| 4 | ストリークリセット | チェックOFFのまま翌日0時を迎えるとストリークが0にリセット |
| 5 | マイルストーン祝福 | 7/14/21/30/60/90/100/365日達成時にダイアログ表示 |
| 6 | 撮影用デバッグ | プロフィール画面から撮影用のストリーク値を設定可能（29→30、6→7など） |

---

## 追加パッチ①: customHabitRow

```swift
private func customHabitRow(id: UUID, name: String, time: DateComponents?) -> some View {
    let isActive = activeCustomHabits.contains(id)
    let date = time.flatMap { Calendar.current.date(from: $0) }
    let habitId = id.uuidString
    let isCompleted = appState.isDailyCompleted(for: habitId)
    let streak = appState.currentStreak(for: habitId)

    CardView {
        ZStack(alignment: .topTrailing) {
            // ストリークバッジ（右上）
            if streak > 0 {
                Text("🪷\(streak)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(hex: "#C9B382"))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule()
                            .fill(Color(hex: "#C9B382").opacity(0.15))
                    )
                    .offset(x: -4, y: 4)
            }
            
            // メインコンテンツ
            HStack(spacing: 12) {
                // チェックボックス
                checkBox(isCompleted: isCompleted) {
                    if isCompleted {
                        appState.unmarkDailyCompleted(for: habitId)
                    } else {
                        appState.markDailyCompleted(for: habitId)
                    }
                }
                
                // 習慣名
                Text(name)
                    .font(AppTheme.Typography.headlineDynamic)
                    .foregroundStyle(AppTheme.Colors.label)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if isActive {
                            activeSheet = .customEditor(id)
                        } else {
                            sheetTime = date ?? Date()
                            activeSheet = .custom(id)
                        }
                    }
                
                // 時刻表示
                Text(isActive && date != nil ? date!.formatted(.dateTime.hour().minute()) : "")
                    .font(AppTheme.Typography.subheadlineDynamic)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .frame(width: 50, alignment: .trailing)
                
                // トグル
                Toggle("", isOn: Binding(
                    get: { activeCustomHabits.contains(id) },
                    set: { isOn in
                        withAnimation(.easeInOut(duration: 0.18)) {
                            if isOn {
                                if let date = date {
                                    activeCustomHabits.insert(id)
                                    customHabitTimes[id] = date
                                } else {
                                    sheetTime = Date()
                                    activeSheet = .custom(id)
                                }
                            } else {
                                activeCustomHabits.remove(id)
                                Task { @MainActor in
                                    try? await Task.sleep(nanoseconds: 220_000_000)
                                    var t = Transaction()
                                    t.disablesAnimations = true
                                    withTransaction(t) {
                                        customHabitTimes.removeValue(forKey: id)
                                        appState.updateCustomHabitSchedule(id: id, time: nil)
                                    }
                                }
                            }
                        }
                    }
                ))
                .labelsHidden()
                .tint(Color(hex: "#C9B382"))
            }
            .padding(.vertical, 35)
        }
    }
}
```

---

## 追加パッチ②: SettingsView.swift ボタンラベル修正

```swift
// 変更前
Button("4️⃣ 7→8用（トレーニングだけ未完了）") {
    appState.setupRecording(pattern: 4)
}

Button("5️⃣ 全部🔥30") {
    appState.setupRecording(pattern: 5)
}

// 変更後
Button("4️⃣ 6→7用（7日達成）") {
    appState.setupRecording(pattern: 4)
}

Button("5️⃣ 全部🪷30") {
    appState.setupRecording(pattern: 5)
}
```

---

## 追加パッチ③: ProfileView.swift ボタンラベル修正

```swift
// 変更前
Button("5️⃣ 全部🔥30") {
    appState.setupRecording(pattern: 5)
}

// 変更後
Button("5️⃣ 全部🪷30") {
    appState.setupRecording(pattern: 5)
}
```

---

以上が追加で必要な差分パッチです。