---

# サイクル1: 日次完了チェック + ストリーク機能 - 完全実装仕様書

---

## 1. 概要

### 1.1 目的

Habitsタブの習慣リストに「日次完了チェックボックス」と「ストリーク表示」を追加し、ユーザーが習慣の達成状況を視覚的に確認できるようにする。

### 1.2 As-Is（現状）

現在のHabitsリストは以下の構成:
- 各習慣行に「習慣名」「時刻」「ON/OFFトグル」が表示されている
- 習慣を実行したかどうかを記録する機能がない
- 連続達成日数（ストリーク）を表示する機能がない

### 1.3 To-Be（目標状態）

変更後のHabitsリスト:
- 各習慣行の左端に「チェックボックス」を追加。その日に習慣を完了したらチェックを入れる
- 各習慣行の右上に「ストリーク」を表示。連続でチェックが入っている日数を🔥マークで表示
- チェックを入れるとspring()アニメーションとハプティックフィードバック(.success)が発火
- ストリーク0の場合は何も表示しない
- 日付が変わった時点で、前日にチェックがなかった習慣はストリークが0にリセットされる

---

## 2. UI設計

### 2.1 対象ファイル

`aniccaios/aniccaios/Habits/HabitsSectionView.swift`

### 2.2 レイアウト

各習慣行の構成を以下のように変更する:

チェックボックスを習慣名の左側に追加する。サイズは24x24。角丸は6px。未完了時はグレーのborder（1.5px）で中身は透明。完了時はアクセントカラーで塗りつぶし、白のcheckmarkアイコンを中央に表示する。タップで完了/未完了を切り替える。タップ時はspring()アニメーションでスケールが0.95から1.0にバウンスし、チェックマークはスケール0.5から1.0でポップインする。同時にハプティックフィードバック(.success)を発火する。

ストリークバッジをカードの右上コーナーに表示する。ストリーク1以上の場合のみ「🔥3」のように炎マークと数字を表示する。色はオレンジ。ストリーク0の場合は何も表示しない。

既存の動作（習慣名タップで詳細画面に遷移、トグルで通知ON/OFF）は変更しない。

---

## 3. ストリークのロジック

### 3.1 ルール

1. チェックを入れる: その日初めてのチェック時にストリーク+1
2. 日付が変わる（0:00）: 前日にチェックがなかった習慣はストリークを0にリセット
3. 手動でチェックをオフにする: その日のチェックが外れるだけ。ストリークは翌日0:00まで維持される
4. チェックを再度オンにする: その日内であれば、ストリークは維持される

### 3.2 データ構造

習慣ごとに「最終完了日」と「現在のストリーク数」を保持し、UserDefaultsに永続化する。

---

## 4. 実装詳細（疑似パッチ）

### 4.1 AppState.swift への追加

```swift
// ===== 追加: HabitStreakData 構造体 =====
struct HabitStreakData: Codable {
    var lastCompletedDate: Date?
    var currentStreak: Int
    
    init() {
        self.lastCompletedDate = nil
        self.currentStreak = 0
    }
}

// ===== 追加: プロパティ =====
@Published private(set) var habitStreaks: [String: HabitStreakData] = [:]
private let habitStreaksKey = "com.anicca.habitStreaks"

// ===== 追加: init() 内で呼び出し =====
// private init() の中に追加:
loadHabitStreaks()

// ===== 追加: メソッド群 =====

/// 今日完了済みかを判定
func isDailyCompleted(for habitId: String) -> Bool {
    guard let data = habitStreaks[habitId],
          let lastDate = data.lastCompletedDate else {
        return false
    }
    return Calendar.current.isDateInToday(lastDate)
}

/// 現在のストリークを取得
func currentStreak(for habitId: String) -> Int {
    updateStreaksIfNeeded()
    return habitStreaks[habitId]?.currentStreak ?? 0
}

/// 完了をマーク
func markDailyCompleted(for habitId: String) {
    updateStreaksIfNeeded()
    
    var data = habitStreaks[habitId] ?? HabitStreakData()
    let today = Calendar.current.startOfDay(for: Date())
    
    // 既に今日完了済みなら何もしない
    if let lastDate = data.lastCompletedDate,
       Calendar.current.isDate(lastDate, inSameDayAs: today) {
        return
    }
    
    // ストリーク計算
    let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: today)!
    
    if let lastDate = data.lastCompletedDate,
       Calendar.current.isDate(lastDate, inSameDayAs: yesterday) {
        // 昨日完了していた → ストリーク継続
        data.currentStreak += 1
    } else {
        // それ以外 → リセットして1から
        data.currentStreak = 1
    }
    
    data.lastCompletedDate = today
    habitStreaks[habitId] = data
    saveHabitStreaks()
}

/// 完了を解除
func unmarkDailyCompleted(for habitId: String) {
    guard var data = habitStreaks[habitId],
          let lastDate = data.lastCompletedDate,
          Calendar.current.isDateInToday(lastDate) else {
        return
    }
    
    let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Calendar.current.startOfDay(for: Date()))!
    
    if data.currentStreak > 1 {
        data.currentStreak -= 1
        data.lastCompletedDate = yesterday
    } else {
        data.currentStreak = 0
        data.lastCompletedDate = nil
    }
    
    habitStreaks[habitId] = data
    saveHabitStreaks()
}

/// 日付変更時にストリークを更新
private func updateStreaksIfNeeded() {
    let today = Calendar.current.startOfDay(for: Date())
    let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: today)!
    var updated = false
    
    for (habitId, var data) in habitStreaks {
        guard let lastDate = data.lastCompletedDate else { continue }
        
        if !Calendar.current.isDate(lastDate, inSameDayAs: today) &&
           !Calendar.current.isDate(lastDate, inSameDayAs: yesterday) {
            data.currentStreak = 0
            data.lastCompletedDate = nil
            habitStreaks[habitId] = data
            updated = true
        }
    }
    
    if updated {
        saveHabitStreaks()
    }
}

private func saveHabitStreaks() {
    if let data = try? JSONEncoder().encode(habitStreaks) {
        defaults.set(data, forKey: habitStreaksKey)
    }
}

private func loadHabitStreaks() {
    guard let data = defaults.data(forKey: habitStreaksKey),
          let decoded = try? JSONDecoder().decode([String: HabitStreakData].self, from: data) else {
        return
    }
    habitStreaks = decoded
}
```

### 4.2 HabitsSectionView.swift への追加

```swift
// ===== 追加: チェックボックスコンポーネント =====
@ViewBuilder
private func checkBox(isCompleted: Bool, onTap: @escaping () -> Void) -> some View {
    Button {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
            onTap()
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
    .sensoryFeedback(.success, trigger: isCompleted)
}

// ===== 追加: ストリークバッジコンポーネント =====
@ViewBuilder
private func streakBadge(count: Int) -> some View {
    if count > 0 {
        Text("🔥\(count)")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Color.orange)
    }
}

// ===== 変更: habitRow の中身 =====
// 既存のHStackの先頭にcheckBoxを追加し、ZStackでstreakBadgeを右上に配置

@ViewBuilder
private func habitRow(for habit: HabitType, time: DateComponents?) -> some View {
    let isActive = activeHabits.contains(habit)
    let date = time.flatMap { Calendar.current.date(from: $0) }
    let habitId = habit.rawValue
    let isCompleted = appState.isDailyCompleted(for: habitId)
    let streak = appState.currentStreak(for: habitId)

    ZStack(alignment: .topTrailing) {
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

            // 時刻表示
            if isActive, let date = date {
                Text(date.formatted(.dateTime.hour().minute()))
                    .font(AppTheme.Typography.subheadlineDynamic)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }

            // トグル（既存のBindingをそのまま使用）
            Toggle("", isOn: Binding(
                get: { isActive },
                set: { isOn in
                    // 既存の処理をそのまま使用
                }
            ))
            .labelsHidden()
            .tint(AppTheme.Colors.accent)
        }
        
        // ストリークバッジ（右上）
        streakBadge(count: streak)
            .padding(.trailing, 8)
            .padding(.top, -4)
    }
}

// ===== customHabitRow も同様に変更 =====
// habitId を customHabit.id.uuidString にする
```

---

## 5. ファイル変更一覧

| ファイル | 変更内容 |
|----------|----------|
| `aniccaios/aniccaios/AppState.swift` | HabitStreakData構造体追加、habitStreaksプロパティ追加、関連メソッド追加、init()でloadHabitStreaks()呼び出し |
| `aniccaios/aniccaios/Habits/HabitsSectionView.swift` | checkBox、streakBadgeコンポーネント追加、habitRow・customHabitRowに組み込み |

---

## 6. 動作確認ポイント

1. チェックボックスタップで完了/未完了が切り替わる
2. 完了時にspring()アニメーションとハプティック(.success)が発火する
3. 完了時にストリーク+1、未完了に戻しても翌日0:00までストリークは維持
4. アプリ再起動後も状態が保持される
5. 日付が変わると、前日チェックなしの習慣はストリーク0にリセット
6. ストリーク0の習慣は🔥マークが表示されない
7. カスタム習慣でも同様に動作する

---

## 7. 画面録画

### 7.1 撮影前の準備

1. 4つの習慣を有効にする（トレーニング、起床、X投稿、就寝）
2. 事前にストリークを仕込む:
   - トレーニング: 🔥7
   - 就寝: 🔥3
   - 起床: ストリークなし（未完了）
   - X投稿: ストリークなし（未完了）

### 7.2 録画内容

| 録画 | 内容 | 秒数 |
|------|------|------|
| 録画1 | Habitsリスト全体を見せる（異なるストリーク状態が見える） | 5秒 |
| 録画2 | 未完了のチェックボックスをタップしてチェックを入れる（2〜3個連続） | 5〜10秒 |

---

## 8. 動画構成

### 8.1 動画構成A: POV版（15秒）

| 秒数 | 映像 | 画面テキスト |
|------|------|-------------|
| 0〜3秒 | Habitsリスト画面（ストリーク🔥7などが見える） | POV: 習慣が続かなくて自己嫌悪してたのに、これ見てから変わった |
| 3〜7秒 | チェックボックスをタップしてチェックを入れる | 終わったらチェック |
| 7〜11秒 | ストリーク🔥7→🔥8に増える様子（編集でカット繋ぎ） | 途切れさせたくない |
| 11〜15秒 | 全習慣にチェックが入った状態 | Anicca |

### 8.2 動画構成B: ストーリー版（15秒）

| 秒数 | 映像 | 画面テキスト |
|------|------|-------------|
| 0〜3秒 | ストリーク🔥7の習慣をクローズアップ | 三日坊主だった俺が、7日連続でチェック入れてる |
| 3〜8秒 | チェックを入れる動作 | 今日もチェック |
| 8〜12秒 | リスト全体を見せる（複数のストリーク表示） | 見えるから続く |
| 12〜15秒 | フェードアウト | Anicca |

### 8.3 動画構成C: 呼びかけ版（15秒）

| 秒数 | 映像 | 画面テキスト |
|------|------|-------------|
| 0〜2秒 | 黒画面またはホーム画面 | 習慣が続かない人、これ見て |
| 2〜6秒 | Habitsリスト画面を開く | 毎日これを開く |
| 6〜10秒 | チェックを入れる動作（2〜3個連続） | 終わったらチェック |
| 10〜15秒 | ストリーク表示が見える状態でフェードアウト | これだけ。Anicca |

---

## 9. フック（日本語 5種 + 英語 5種）

### 日本語

| # | フック |
|---|--------|
| 1 | POV: 習慣が続かなくて自己嫌悪してたのに、これ見てから変わった |
| 2 | 三日坊主だった俺が、7日連続でチェック入れてる |
| 3 | ストリークが途切れるのが嫌で、続けてしまう |
| 4 | 習慣が続かない人、これ見て |
| 5 | 「やった」が目に見えるだけで、こんなに続くとは思わなかった |

### 英語

| # | フック |
|---|--------|
| 1 | POV: you finally found something that makes habits stick |
| 2 | I couldn't stick to anything until I started seeing my streaks |
| 3 | You keep going because you don't want to break it |
| 4 | If you can't stick to habits, watch this |
| 5 | I didn't expect "just checking a box" to change everything |

---

## 10. キャプション

### 10.1 動画構成A用

**日本語:**
```
習慣が続かなくて自己嫌悪してた。

チェックを入れるだけ。
毎日続けるとストリークが伸びる。
途切れさせたくなくて、続けてしまう。

これが一番続いてる。
```

**英語:**
```
I used to hate myself for not sticking to habits.

Just check it off.
Keep going, and your streak grows.
You don't want to break it.

This is the only thing that's worked.
```

### 10.2 動画構成B用

**日本語:**
```
三日坊主だった。

でも「やった」が見えると変わる。
ストリークが途切れるのが嫌で、続けてしまう。

7日目。まだ続いてる。
```

**英語:**
```
I could never stick to anything.

But when I can see my progress, it changes.
You don't want to break your streak.

Day 7. Still going.
```

### 10.3 動画構成C用

**日本語:**
```
習慣が続かない人へ。

毎日この画面を開く。
終わったらチェック。
それだけ。

ストリークが途切れるのが嫌で、続けてしまう。
```

**英語:**
```
For people who can't stick to habits.

Open this every day.
Check when done.
That's it.

You keep going because you don't want to break it.
```

---

## 11. X投稿文

### 11.1 プロモーション用（日本語）

**投稿文1:**
```
POV: 習慣が続かなくて自己嫌悪してたのに、これ見てから変わった

チェックを入れるだけ。
毎日続けるとストリークが伸びる。
途切れさせたくなくて、続けてしまう。

Anicca
```

**投稿文2:**
```
三日坊主だった俺が、7日連続でチェック入れてる。

「やった」が見えると変わる。
ストリークが途切れるのが嫌で、続けてしまう。

Anicca
```

**投稿文3:**
```
習慣が続かない人、これ見て。

毎日この画面を開く。
終わったらチェック。
それだけ。

Anicca
```

### 11.2 プロモーション用（英語）

**投稿文1:**
```
POV: you finally found something that makes habits stick

Just check it off.
Keep going, and your streak grows.
You don't want to break it.

Anicca
```

**投稿文2:**
```
I couldn't stick to anything until I started seeing my streaks.

When you can see your progress, it changes.
You don't want to break your streak.

Day 7. Still going.

Anicca
```

**投稿文3:**
```
If you can't stick to habits, watch this.

Open this every day.
Check when done.
That's it.

Anicca
```

### 11.3 開発進捗用（日本語）

```
Aniccaに日次チェックとストリークを追加した。

チェックを入れるだけ。
毎日続けるとストリークが伸びる。
途切れさせたくなくて、続けてしまう設計。

シンプルだけど、これが一番続く。

#iOS開発 #個人開発
```

### 11.4 開発進捗用（英語）

```
Added daily check and streaks to Anicca.

Just check it off.
Keep going, and your streak grows.
Designed to make you not want to break it.

Simple, but this is what makes habits stick.

#iOSDev #IndieHacker
```

---

## 12. 手順

| ステップ | 内容 |
|----------|------|
| 1 | AppState.swiftにストリーク関連を実装 |
| 2 | HabitsSectionView.swiftにチェックボックス・ストリークUIを実装 |
| 3 | シミュレーターで動作確認 |
| 4 | 実機でストリークを仕込む |
| 5 | 録画1・録画2を撮影 |
| 6 | プロモーション動画を編集（構成A/B/Cから選択） |
| 7 | Reels/TikTokにプロモ動画を投稿 |
| 8 | Xに開発進捗動画を投稿 |
| 9 | サイクル1完了 |

---
了解。チェックボックスのアニメーション・ハプティック部分を詳細に追加する。

---

## 追加: チェックボックスのアニメーション・ハプティック仕様

### 概要

チェックボックスをタップした時に、視覚的なアニメーションと触覚的なハプティックフィードバックを同時に発火させ、「やった！」という達成感を演出する。

### 要素

1. **ハプティックフィードバック（触覚）**: `.success` タイプを使用。チェック完了時に振動でフィードバック
2. **スケールアニメーション（視覚）**: ボックス全体が0.95→1.0にバウンス
3. **チェックマークのポップイン（視覚）**: チェックマークがスケール0.5→1.0でポップイン
4. **背景色のフェード（視覚）**: 透明→アクセントカラーにフェード

### 動作フロー

1. ユーザーがチェックボックスをタップ
2. `withAnimation(.spring(response: 0.3, dampingFraction: 0.6))` でアニメーション開始
3. ボックス全体のスケールが0.95→1.0に変化（バウンス効果）
4. 背景色が透明→アクセントカラーにフェード
5. チェックマークがスケール0.5→1.0でポップイン
6. `.sensoryFeedback(.success, trigger: isCompleted)` でハプティック発火

### 疑似パッチ

```swift
// ===== HabitsSectionView.swift に追加 =====

@ViewBuilder
private func checkBox(isCompleted: Bool, onTap: @escaping () -> Void) -> some View {
    Button {
        // spring()アニメーションでバウンス効果
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
            onTap()
        }
    } label: {
        ZStack {
            // ボックス本体
            RoundedRectangle(cornerRadius: 6)
                .stroke(isCompleted ? Color.clear : AppTheme.Colors.border, lineWidth: 1.5)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(isCompleted ? AppTheme.Colors.accent : Color.clear)
                )
                .frame(width: 24, height: 24)
            
            // チェックマーク（完了時のみ表示）
            if isCompleted {
                Image(systemName: "checkmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    // チェックマークのポップイン: 0.5→1.0
                    .scaleEffect(isCompleted ? 1.0 : 0.5)
            }
        }
        // ボックス全体のバウンス: 0.95→1.0
        .scaleEffect(isCompleted ? 1.0 : 0.95)
    }
    .buttonStyle(.plain)
    // ハプティックフィードバック: .success タイプ
    .sensoryFeedback(.success, trigger: isCompleted)
}
```

### パラメータ説明

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `spring(response:)` | 0.3 | アニメーションの応答時間（秒）。短いほど素早い |
| `spring(dampingFraction:)` | 0.6 | 減衰率。1.0で跳ね返りなし、0.5でより弾む |
| ボックスのscaleEffect | 0.95→1.0 | 完了時に微かに大きくなる（バウンス効果） |
| チェックマークのscaleEffect | 0.5→1.0 | ポップイン効果 |
| sensoryFeedback | .success | 成功時のハプティック（短い振動） |

### 注意点

1. `.sensoryFeedback` はiOS17以降で使用可能
2. iOS16以下をサポートする場合は `UINotificationFeedbackGenerator` を使用する必要がある
3. サウンドは入れない（ハプティックで十分、動画では編集で音を乗せる）

### iOS16以下対応が必要な場合の代替実装

```swift
// iOS16以下対応版
@ViewBuilder
private func checkBox(isCompleted: Bool, onTap: @escaping () -> Void) -> some View {
    Button {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
            onTap()
        }
        // iOS16以下用のハプティック
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
    } label: {
        // ... 同じ
    }
    .buttonStyle(.plain)
}
```

---

これで完全な仕様書になった。OK？