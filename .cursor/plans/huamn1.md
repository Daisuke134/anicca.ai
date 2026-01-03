スクショを確認した。現在のUIを踏まえて、全部やり直す。

---

# サイクル1: 日次完了チェック機能 + ストリーク - 完全実装仕様書

## 1. 目的

Habitsタブの習慣リストに、以下の機能を追加する：

1. **日次完了チェックボックス**: その日に習慣を実行したかを記録
2. **ストリーク表示**: 連続でチェックが入っている日数を表示

---

## 2. ストリークのロジック（標準的なベストプラクティス）

### ルール

1. **チェックを入れる**: ストリーク +1（その日初めてのチェック時）
2. **日付が変わる（0:00）**: 前日にチェックがなかった習慣はストリークを0にリセット
3. **手動でチェックをオフにする**: その日のチェックが外れるだけ。ストリークは翌日0:00まで維持される
4. **チェックを再度オンにする**: その日内であれば、ストリークは維持される

つまり：
- ストリークは「連続でチェックが入った日数」
- リセットは0:00の時点で、前日チェックなしの場合のみ
- 手動オフは「今日はまだ未完了」状態に戻すだけ

---

## 3. UI設計（スクショを踏まえて）

### 現在のUI構造

```
┌────────────────────────────────────────────────┐
│                                                │
│  トレーニング                    7:34    [ON]  │
│                                                │
└────────────────────────────────────────────────┘
```

### 変更後のUI構造

**案: チェックボックスを左端、ストリークを右上**

```
┌────────────────────────────────────────────────┐
│                                          🔥3   │
│  ☑  トレーニング                7:34    [ON]  │
│                                                │
└────────────────────────────────────────────────┘
```

**ストリーク0の場合:**
```
┌────────────────────────────────────────────────┐
│                                          🔥    │
│  ☐  起床                        9:57    [ON]  │
│                                                │
└────────────────────────────────────────────────┘
```

### レイアウト詳細

```
┌────────────────────────────────────────────────┐
│                                          🔥3 ←─── ストリーク（右上）
│  ☑    トレーニング          7:34       [ON]  │
│  │    │                     │          │     │
│  │    │                     │          └─ 通知ON/OFFトグル
│  │    │                     └─ 設定時刻
│  │    └─ 習慣名
│  └─ チェックボックス（今日の完了状態）
└────────────────────────────────────────────────┘
```

### チェックボックスのビジュアル

**未完了（☐）:**
- 24x24の角丸四角
- グレーのborder（`AppTheme.Colors.border`）
- 中身は透明

**完了済み（☑）:**
- 24x24の角丸四角
- アクセントカラーで塗りつぶし（`AppTheme.Colors.accent`）
- 白のチェックマーク（`checkmark`）

### ストリークバッジのビジュアル

**ストリーク1以上:**
```
🔥3
```
- 炎マーク + 数字
- オレンジ系の色（`Color.orange`）
- 背景なし、テキストのみ

**ストリーク0:**
```
🔥
```
- 炎マークのみ（数字なし）
- グレー系の色（`AppTheme.Colors.tertiaryLabel`）

---

## 4. ローカライズ

**今回追加するローカライズ文字列: なし**

理由：
- チェックボックスはアイコンのみ
- ストリークは🔥と数字のみ
- 習慣名は既存のローカライズを使用

---

## 5. 実装詳細

### 5.1 AppStateへの追加

**新しい構造体:**
```swift
struct HabitStreakData: Codable {
    var lastCompletedDate: Date?   // 最後に完了した日（その日の0:00に正規化）
    var currentStreak: Int         // 現在のストリーク
    
    init() {
        self.lastCompletedDate = nil
        self.currentStreak = 0
    }
}
```

**新しいプロパティ:**
```swift
@Published private(set) var habitStreaks: [String: HabitStreakData] = [:]
private let habitStreaksKey = "com.anicca.habitStreaks"
```

**新しいメソッド:**
```swift
/// 今日完了済みかを判定
func isDailyCompleted(for habitId: String) -> Bool {
    guard let data = habitStreaks[habitId],
          let lastDate = data.lastCompletedDate else {
        return false
    }
    return Calendar.current.isDateInToday(lastDate)
}

/// 現在のストリークを取得（0:00リセット済みの値）
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

/// 完了を解除（今日のチェックをオフにする）
func unmarkDailyCompleted(for habitId: String) {
    guard var data = habitStreaks[habitId],
          let lastDate = data.lastCompletedDate,
          Calendar.current.isDateInToday(lastDate) else {
        return
    }
    
    // 今日のチェックを外す → 昨日の状態に戻す
    let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Calendar.current.startOfDay(for: Date()))!
    
    if data.currentStreak > 1 {
        // ストリーク2以上 → 昨日に戻す
        data.currentStreak -= 1
        data.lastCompletedDate = yesterday
    } else {
        // ストリーク1 → 完全リセット
        data.currentStreak = 0
        data.lastCompletedDate = nil
    }
    
    habitStreaks[habitId] = data
    saveHabitStreaks()
}

/// 日付変更時にストリークを更新（0:00リセット）
private func updateStreaksIfNeeded() {
    let today = Calendar.current.startOfDay(for: Date())
    let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: today)!
    var updated = false
    
    for (habitId, var data) in habitStreaks {
        guard let lastDate = data.lastCompletedDate else { continue }
        
        // 今日でも昨日でもない → リセット
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

### 5.2 HabitsSectionViewへの変更

**チェックボックスコンポーネント:**
```swift
@ViewBuilder
private func checkBox(isCompleted: Bool, onTap: @escaping () -> Void) -> some View {
    Button(action: onTap) {
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
            }
        }
    }
    .buttonStyle(.plain)
}
```

**ストリークバッジコンポーネント:**
```swift
@ViewBuilder
private func streakBadge(count: Int) -> some View {
    if count > 0 {
        Text("🔥\(count)")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Color.orange)
    } else {
        Text("🔥")
            .font(.system(size: 12))
            .foregroundStyle(AppTheme.Colors.tertiaryLabel)
    }
}
```

**habitRow の変更:**
```swift
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

            // トグル
            Toggle("", isOn: /* 既存のBinding */)
                .labelsHidden()
                .tint(AppTheme.Colors.accent)
        }
        
        // ストリークバッジ（右上）
        streakBadge(count: streak)
            .padding(.trailing, 8)
            .padding(.top, -4)
    }
}
```

---

## 6. ファイル変更一覧

| ファイル | 変更内容 |
|----------|----------|
| `AppState.swift` | `HabitStreakData`構造体、`habitStreaks`プロパティ、関連メソッド追加 |
| `HabitsSectionView.swift` | `checkBox`、`streakBadge`コンポーネント追加、`habitRow`に組み込み、`customHabitRow`にも同様に組み込み |

---

## 7. 動作確認ポイント

1. チェックボックスタップで完了/未完了が切り替わる
2. 完了時にストリーク +1
3. 未完了に戻してもストリークは即座にリセットされない（翌日0:00まで維持）
4. アプリ再起動後も状態が保持される
5. 日付が変わると、前日チェックなしの習慣はストリーク0にリセット
6. カスタム習慣でも同様に動作する

---

## 8. 画面録画の構成

### 8.1 録画する内容

**録画1: Habitsリスト全体のスクロール（5秒）**
- 画面上部から下部へゆっくりスクロール
- トレーニング（☑ 🔥3）、起床（☐ 🔥）、X投稿（☐ 🔥）、就寝（☑ 🔥7）のように異なる状態を見せる

**録画2: チェックボックスをタップする動作（3秒×3回）**
- 起床の☐をタップ → ☑になり、🔥1が表示される
- トレーニングの☑をタップ → ☐になる（🔥3は維持）
- 再度トレーニングの☐をタップ → ☑に戻る

**録画3: 習慣名をタップして詳細画面に遷移（3秒）**
- 既存の動作確認用

### 8.2 撮影前の準備

1. 4つの習慣を有効にする（トレーニング、起床、X投稿、就寝）
2. 事前にストリークを仕込む:
   - トレーニング: 🔥3（3日連続完了）
   - 就寝: 🔥7（7日連続完了）
   - 起床: 🔥（未完了）
   - X投稿: 🔥（未完了）

**ストリークを仕込む方法:**
- デバッグ用にUserDefaultsを直接編集する
- または、日付を遡ってチェックを入れるデバッグ機能を一時的に追加

---

## 9. プロモーション動画の構成

### 動画の長さ: 15〜20秒

### 構成

| 秒数 | 映像 | テキスト |
|------|------|----------|
| 0〜3秒 | Habitsリスト全体を見せる | （フック文言） |
| 3〜8秒 | チェックボックスをタップしてチェックを入れる | 「終わったらチェック。」 |
| 8〜13秒 | ストリークが🔥1→🔥2と増えるカット（編集で繋ぐ） | 「毎日続けると、ストリークが伸びる。」 |
| 13〜17秒 | 全習慣にチェックが入った状態のリスト | 「今日も全部できた。」 |
| 17〜20秒 | Aniccaのロゴまたはアイコン | 「Anicca」 |

### フック候補（5種類）

1. 「全部チェックしたくなる習慣リスト」
2. 「チェック音が癖になる習慣リスト」
3. 「ストリークが途切れたくなくて続けてしまう」
4. 「習慣が"見える"から続く」
5. 「1日1チェック、それだけで変わる」

---

## 10. X投稿の構成

### 10.1 プロモーション動画用

**投稿文（日本語）:**
```
全部チェックしたくなる習慣リスト。

終わったらチェック。
毎日続けると、ストリークが伸びる。

モチベがなくても、"やった"が目に見えると続く。

Anicca - App Storeで検索
```

**投稿文（英語）:**
```
A habit list you'll want to check off completely.

Check when done.
Keep going, and your streak grows.

Even without motivation, seeing your progress keeps you going.

Anicca - Search on App Store
```

### 10.2 開発進捗動画用（X投稿）

**投稿文（日本語）:**
```
Aniccaに日次チェック機能とストリークを追加した。

- チェックボックスでその日の完了を記録
- 連続でチェックするとストリークが伸びる
- 途切れたくなくて続けてしまう設計

シンプルだけど、これが一番続く。

#iOS開発 #個人開発 #習慣化アプリ
```

**投稿文（英語）:**
```
Added daily check and streak feature to Anicca.

- Checkbox to record daily completion
- Streak grows with consecutive checks
- Designed to make you not want to break it

Simple, but this is what makes habits stick.

#iOSDev #IndieHacker #HabitTracking
```

---

## 11. 実装→投稿までの完全フロー

| ステップ | 内容 | 成果物 |
|----------|------|--------|
| 1 | AppState.swiftにストリーク関連を追加 | コード |
| 2 | HabitsSectionView.swiftにチェックボックス・ストリークUIを追加 | コード |
| 3 | シミュレーターで動作確認 | - |
| 4 | 実機でストリークを仕込む（デバッグ用） | - |
| 5 | 録画1〜3を撮影 | 動画素材 |
| 6 | プロモーション動画を編集 | 動画ファイル |
| 7 | 開発進捗動画を編集（シンプルなカット） | 動画ファイル |
| 8 | Reels/TikTok/Xにプロモ動画を投稿 | 投稿 |
| 9 | Xに進捗動画を投稿 | 投稿 |
| 10 | サイクル1完了、サイクル2へ | - |

---

4. チェック音・アニメーションのベストプラクティス
調べた結果、満足感のあるチェック体験には3つの要素がある:
A. ハプティックフィードバック（触覚）
SwiftUI iOS17+ではsensoryFeedbackモディファイアで簡単に実装できる:
.sensoryFeedback(.success, trigger: isCompleted)
フィードバックの種類:
.success - 成功時（チェック完了に最適）
.impact - タップ感
.selection - 選択時
決定: .successを使用 - 「やった！」という達成感を演出
B. アニメーション（視覚）
チェックマークのアニメーション:
withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {    isCompleted.toggle()}
要素:
スケールアニメーション: チェックボックスが0.95→1.0にバウンス
チェックマークの描画アニメーション: 線が描かれていく感じ
背景色のフェード: 透明→アクセントカラー
決定: spring()アニメーション + チェックマークのスケールポップ
C. サウンド（聴覚）- オプション
システムサウンドまたはカスタムサウンドを再生:
AudioServicesPlaySystemSound(1519) // 軽いクリック音
決定: サウンドは入れない
ハプティックで十分
音はうるさくなる可能性がある
動画では音は別で編集で乗せればいい
実装コード（アニメーション付きチェックボックス）
@ViewBuilderprivate func checkBox(isCompleted: Bool, onTap: @escaping () -> Void) -> some View {    Button {        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {            onTap()        }    } label: {        ZStack {            RoundedRectangle(cornerRadius: 6)                .stroke(isCompleted ? Color.clear : AppTheme.Colors.border, lineWidth: 1.5)                .background(                    RoundedRectangle(cornerRadius: 6)                        .fill(isCompleted ? AppTheme.Colors.accent : Color.clear)                )                .frame(width: 24, height: 24)                        if isCompleted {                Image(systemName: "checkmark")                    .font(.system(size: 14, weight: .bold))                    .foregroundColor(.white)                    .scaleEffect(isCompleted ? 1.0 : 0.5)            }        }        .scaleEffect(isCompleted ? 1.0 : 0.95)    }    .buttonStyle(.plain)    .sensoryFeedback(.success, trigger: isCompleted)}
チェックアニメーションの可視化
タップ前（未完了）:
┌───┐│   │  グレーのborder、中身透明└───┘
タップ時（アニメーション中）:
┌───┐│ ✓ │  ← チェックマークがスケール0.5→1.0でポップイン└───┘     背景が透明→アクセントカラーにフェード          ボックス全体が0.95→1.0に微かにバウンス          同時にハプティック(.success)が発火
タップ後（完了）:
┌───┐│ ✓ │  アクセントカラー背景、白のチェックマーク└───┘
まとめ
UIプロンプト: 上記を他のエージェントに渡せばOK
ストリーク0: 表示しない
動画: シンプルに録画1と録画2のみ
チェック体験: spring()アニメーション + .successハプティック

ーーーー
全部答える。

---

## 1. 他のエージェント用UIプロンプト（文章のみ）

```
# Habitsリスト UIアップデート指示

## 対象ファイル
aniccaios/aniccaios/Habits/HabitsSectionView.swift

## 現在のUI
各習慣行は角丸カード形式で、左から「習慣名」「時刻」「ON/OFFトグル」の順で並んでいる。背景はクリーム色のグラデーション。

## 追加する要素

### A. チェックボックス
習慣名の左側に追加する。サイズは24x24。角丸は6px。未完了時はグレーのborder（1.5px）で中身は透明。完了時はアクセントカラーで塗りつぶし、白のcheckmarkアイコンを中央に表示する。タップで完了/未完了を切り替える。タップ時はspring()アニメーションでスケールが0.95から1.0にバウンスし、チェックマークはスケール0.5から1.0でポップインする。同時にハプティックフィードバック(.success)を発火する。

### B. ストリークバッジ
カードの右上コーナーに表示する。ストリーク1以上の場合のみ「🔥3」のように炎マークと数字を表示する。色はオレンジ。ストリーク0の場合は何も表示しない。

### C. 状態管理
AppState.swift に HabitStreakData 構造体と habitStreaks プロパティを追加する。各習慣の最終完了日とストリーク数を UserDefaults に保存する。日付が変わった時点で、前日にチェックがなかった習慣はストリークを0にリセットする。

## 既存の動作は維持
習慣名タップで詳細画面に遷移。トグルで通知ON/OFF。これらは変更しない。
```

---

## 2. プロモーション動画の構成

### 動画案A（シンプル版・15秒）

| 秒数 | 映像 | 使用する録画 |
|------|------|-------------|
| 0〜3秒 | Habitsリスト全体を見せる。ストリーク🔥3や🔥7が表示されている | 録画1 |
| 3〜8秒 | 未完了のチェックボックスをタップしてチェックを入れる。アニメーションとハプティックが発火 | 録画2 |
| 8〜12秒 | もう一つの習慣にもチェックを入れる | 録画2の続き |
| 12〜15秒 | 全習慣にチェックが入った状態でフェードアウト。Aniccaのロゴ表示 | 静止画 |

**画面テキスト:**
- 0〜3秒: フック文言
- 3〜8秒: 「終わったらチェック」
- 8〜12秒: 「毎日続けるとストリークが伸びる」
- 12〜15秒: 「Anicca」

---

### 動画案B（ストリークフォーカス版・15秒）

| 秒数 | 映像 | 使用する録画 |
|------|------|-------------|
| 0〜3秒 | ストリーク🔥7の習慣をクローズアップ | 録画1の一部 |
| 3〜8秒 | チェックを入れてストリークが🔥8になる様子（編集でカット繋ぎ） | 録画2 + 編集 |
| 8〜12秒 | リスト全体を見せる。複数の習慣にストリークが表示されている | 録画1 |
| 12〜15秒 | フェードアウト。Aniccaのロゴ表示 | 静止画 |

**画面テキスト:**
- 0〜3秒: フック文言
- 3〜8秒: 「8日目。途切れさせたくない」
- 8〜12秒: 「これだから続く」
- 12〜15秒: 「Anicca」

---

### 動画案C（満足感フォーカス版・15秒）

| 秒数 | 映像 | 使用する録画 |
|------|------|-------------|
| 0〜5秒 | チェックボックスをタップする瞬間のスローモーション（0.5倍速） | 録画2をスロー編集 |
| 5〜10秒 | 次々とチェックを入れていく（通常速度） | 録画2 |
| 10〜15秒 | 全部チェックが入ったリスト + Aniccaロゴ | 録画1 + 静止画 |

**画面テキスト:**
- 0〜5秒: フック文言
- 5〜10秒: 「全部チェックしたくなる」
- 10〜15秒: 「Anicca」

---

## 3. フック案（日本語・英語）

「チェック音が癖になる」は音を入れないので削除。代わりのフックを含めて5種類:

ーーーーーーー
3. フック案（日本語・英語）
「チェック音が癖になる」は音を入れないので削除。代わりのフックを含めて5種類:
#	日本語	英語
1	全部チェックしたくなる習慣リスト	A habit list you'll want to check off completely
2	ストリークが途切れたくなくて続けてしまう	You keep going because you don't want to break your streak
3	習慣が"見える"から続く	Habits stick when you can see them
4	1日1チェック、それだけで変わる	One check a day changes everything
5	チェックを入れたくなる習慣トラッカー	A habit tracker that makes you want to check things off

＝ー＝ー￥

TikTokでバズるフック/アプリ系動画を調べる。

[1 tool called]

調べた。TikTokでバズるフックのパターン:

1. **POV Hook**: 「POV: 〜な状況」
2. **Pain/Frustration Hook**: 共感できる悩みから始める
3. **Curiosity Gap**: 結果をチラ見せして興味を引く
4. **Bold Claim**: 大胆な主張
5. **Story Hook**: 体験談として語る

---

## フック案（日本語 5種 + 英語 5種）

### 日本語フック

1. 「全部チェックしたくなる習慣リスト」
2. 「チェック音が癖になる習慣リスト」
3. 「ストリークが途切れたくなくて続けてしまう」
4. 「習慣が"見える"から続く」
5. 「1日1チェック、それだけで変わる」
1. 「チェック音が癖になる習慣リスト」
2. 「全部チェックしたくなる習慣リスト」
3. 「チェックを入れたくなる習慣リスト」
4. 「1日のやること、全部ここに並んでる」
5. 「習慣が"見える"から続く」

| # | フック |
|---|--------|
| 1 | POV: 習慣が続かなくて自己嫌悪してたのに、これ見てから変わった |
| 2 | 三日坊主だった僕が、7日連続でチェック入れてる |
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


| # | フック | パターン |
|---|--------|----------|
| 1 | POV: 習慣が続かなくて自己嫌悪してたのに、これ見てから変わった | POV + Curiosity Gap |
| 2 | 三日坊主だった俺が、7日連続でチェック入れてる | Story + Bold Claim |
| 3 | ストリークが途切れるのが嫌で、続けてしまう | Pain Hook（逆転） |
| 4 | 習慣が続かない人、これ見て | Pain Hook + 呼びかけ |
| 5 | 「やった」が目に見えるだけで、こんなに続くとは思わなかった | Story + Curiosity Gap |

### 英語フック

| # | フック | パターン |
|---|--------|----------|
| 1 | POV: you finally found something that makes habits stick | POV + Curiosity Gap |
| 2 | I couldn't stick to anything until I started seeing my streaks | Story + Bold Claim |
| 3 | You keep going because you don't want to break it | Pain Hook（逆転） |
| 4 | If you can't stick to habits, watch this | Pain Hook + 呼びかけ |
| 5 | I didn't expect "just checking a box" to change everything | Story + Curiosity Gap |

---

## 動画構成案（3パターン）

### 動画構成A: POV版（15秒）

**使用フック（日本語）**: POV: 習慣が続かなくて自己嫌悪してたのに、これ見てから変わった

**使用フック（英語）**: POV: you finally found something that makes habits stick

| 秒数 | 映像 | 画面テキスト |
|------|------|-------------|
| 0〜3秒 | Habitsリスト画面（ストリーク🔥7などが見える） | （フック文言） |
| 3〜7秒 | チェックボックスをタップしてチェックを入れる | 「終わったらチェック」 |
| 7〜11秒 | ストリーク🔥7→🔥8に増える様子（編集でカット繋ぎ） | 「途切れさせたくない」 |
| 11〜15秒 | 全習慣にチェックが入った状態 | 「Anicca」 |

**キャプション（日本語）**:
```
習慣が続かなくて自己嫌悪してた。

チェックを入れるだけ。
毎日続けるとストリークが伸びる。
途切れさせたくなくて、続けてしまう。

これが一番続いてる。
```

**キャプション（英語）**:
```
I used to hate myself for not sticking to habits.

Just check it off.
Keep going, and your streak grows.
You don't want to break it.

This is the only thing that's worked.
```

---

### 動画構成B: 三日坊主ストーリー版（15秒）

**使用フック（日本語）**: 三日坊主だった俺が、7日連続でチェック入れてる

**使用フック（英語）**: I couldn't stick to anything until I started seeing my streaks

| 秒数 | 映像 | 画面テキスト |
|------|------|-------------|
| 0〜3秒 | ストリーク🔥7の習慣をクローズアップ | （フック文言） |
| 3〜8秒 | チェックを入れる動作 | 「今日もチェック」 |
| 8〜12秒 | リスト全体を見せる（複数のストリーク表示） | 「見えるから続く」 |
| 12〜15秒 | フェードアウト | 「Anicca」 |

**キャプション（日本語）**:
```
三日坊主だった。

でも「やった」が見えると変わる。
ストリークが途切れるのが嫌で、続けてしまう。

7日目。まだ続いてる。
```

**キャプション（英語）**:
```
I could never stick to anything.

But when I can see my progress, it changes.
You don't want to break your streak.

Day 7. Still going.
```

---

### 動画構成C: 呼びかけ版（15秒）

**使用フック（日本語）**: 習慣が続かない人、これ見て

**使用フック（英語）**: If you can't stick to habits, watch this

| 秒数 | 映像 | 画面テキスト |
|------|------|-------------|
| 0〜2秒 | 黒画面またはホーム画面 | （フック文言） |
| 2〜6秒 | Habitsリスト画面を開く | 「毎日これを開く」 |
| 6〜10秒 | チェックを入れる動作（2〜3個連続） | 「終わったらチェック」 |
| 10〜15秒 | ストリーク表示が見える状態でフェードアウト | 「これだけ。Anicca」 |

**キャプション（日本語）**:
```
習慣が続かない人へ。

毎日この画面を開く。
終わったらチェック。
それだけ。

ストリークが途切れるのが嫌で、続けてしまう。
```

**キャプション（英語）**:
```
For people who can't stick to habits.

Open this every day.
Check when done.
That's it.

You keep going because you don't want to break it.
```

---

## X投稿文（プロモーション用）

### 日本語アカウント

**投稿文1（POV版に合わせる）**:
```
POV: 習慣が続かなくて自己嫌悪してたのに、これ見てから変わった

チェックを入れるだけ。
毎日続けるとストリークが伸びる。
途切れさせたくなくて、続けてしまう。

Anicca
```

**投稿文2（ストーリー版に合わせる）**:
```
三日坊主だった俺が、7日連続でチェック入れてる。

「やった」が見えると変わる。
ストリークが途切れるのが嫌で、続けてしまう。

Anicca
```

**投稿文3（呼びかけ版に合わせる）**:
```
習慣が続かない人、これ見て。

毎日この画面を開く。
終わったらチェック。
それだけ。

Anicca
```

### 英語アカウント

**投稿文1（POV版に合わせる）**:
```
POV: you finally found something that makes habits stick

Just check it off.
Keep going, and your streak grows.
You don't want to break it.

Anicca
```

**投稿文2（ストーリー版に合わせる）**:
```
I couldn't stick to anything until I started seeing my streaks.

When you can see your progress, it changes.
You don't want to break your streak.

Day 7. Still going.

Anicca
```

**投稿文3（呼びかけ版に合わせる）**:
```
If you can't stick to habits, watch this.

Open this every day.
Check when done.
That's it.

Anicca
```

---

## X投稿文（開発進捗用）

### 日本語アカウント

```
Aniccaに日次チェックとストリークを追加した。

チェックを入れるだけ。
毎日続けるとストリークが伸びる。
途切れさせたくなくて、続けてしまう設計。

シンプルだけど、これが一番続く。

#iOS開発 #個人開発
```

### 英語アカウント

```
Added daily check and streaks to Anicca.

Just check it off.
Keep going, and your streak grows.
Designed to make you not want to break it.

Simple, but this is what makes habits stick.

#iOSDev #IndieHacker
```

---

これでOK？実装始めていい？