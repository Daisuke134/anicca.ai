<!-- ea232976-5fef-476e-ae79-0b913e879494 1af712aa-1533-41f6-a267-f14a4a4574e4 -->
# Mobbinデザイン改善パッチ（レビュー反映版）

## 概要

iOS UI Modernization計画のレビューで指摘した改善点を反映した追加パッチです。Mobbinデザインの強みを完全に適用するための修正を行います。

## 改善パッチ一覧

### 1. AppTheme.swift - rgba背景色オプション追加

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/AppTheme.swift
@@
    enum Colors {
        // Mobbinデザイン統合: 温かいカラーパレット
        static let accent: Color = .accentColor
        
        // ライトテーマ - Mobbinの温かいベージュ背景
        static let background: Color = Color(hex: "#f8f5ed")
+        // Mobbin: rgba(246,245,236,0.99)の背景色オプション（透明度が必要な場合）
+        static let backgroundWithOpacity: Color = Color(red: 246/255, green: 245/255, blue: 236/255, opacity: 0.99)
        static let cardBackground: Color = Color(hex: "#fdfcfc")
        static let cardBackgroundAlt: Color = Color(hex: "#fcfcfb")
@@
*** End Patch
```

### 2. AppBackground.swift - rgba背景色オプション対応

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/AppBackground.swift
@@
 struct AppBackground: View {
+    var useOpacity: Bool = false  // rgba背景色を使用するかどうか
+    
     var body: some View {
         // Mobbinデザイン: 温かいベージュ背景を適用
         if #available(iOS 15.0, *) {
-            AppTheme.Colors.adaptiveBackground.ignoresSafeArea()
+            (useOpacity ? AppTheme.Colors.backgroundWithOpacity : AppTheme.Colors.adaptiveBackground).ignoresSafeArea()
         } else {
-            AppTheme.Colors.background.ignoresSafeArea()
+            (useOpacity ? AppTheme.Colors.backgroundWithOpacity : AppTheme.Colors.background).ignoresSafeArea()
         }
     }
 }
*** End Patch
```

### 3. HabitSetupStepView.swift - カードベースレイアウト適用（スワイプアクション対応）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift
@@
            Text("onboarding_habit_description")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

-            List {
-                Section {
-                    // 全習慣を時系列順に表示
-                    ForEach(sortedAllHabits, id: \.id) { item in
-                        if item.isCustom, let customId = item.customId {
-                            customHabitCard(for: appState.customHabits.first(where: { $0.id == customId })!)
-                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
-                                    Button(role: .destructive) {
-                                        appState.removeCustomHabit(id: customId)
-                                    } label: {
-                                        Label(String(localized: "common_delete"), systemImage: "trash")
-                                    }
-                                }
-                        } else if let habit = HabitType(rawValue: item.id) {
-                            habitCard(for: habit, isCustom: false)
-                        }
-                    }
-                    
-                    // 「習慣を追加」ボタン
-                    Button(action: { showingAddCustomHabit = true }) {
-                        HStack {
-                            Image(systemName: "plus.circle.fill")
-                            Text("habit_add_custom")
-                        }
-                    }
-                }
-            }
-            .listStyle(.insetGrouped)
+            // Mobbinデザイン: カードベースのリスト表示
+            ScrollView {
+                VStack(spacing: AppTheme.Spacing.md) {
+                    // 全習慣を時系列順に表示
+                    ForEach(sortedAllHabits, id: \.id) { item in
+                        if item.isCustom, let customId = item.customId {
+                            CardView {
+                                customHabitCard(for: appState.customHabits.first(where: { $0.id == customId })!)
+                                    .contextMenu {
+                                        Button(role: .destructive, action: {
+                                            appState.removeCustomHabit(id: customId)
+                                        }) {
+                                            Label(String(localized: "common_delete"), systemImage: "trash")
+                                        }
+                                    }
+                            }
+                        } else if let habit = HabitType(rawValue: item.id) {
+                            CardView {
+                                habitCard(for: habit, isCustom: false)
+                            }
+                        }
+                    }
+                    
+                    // 「習慣を追加」ボタン
+                    CardView {
+                        Button(action: { showingAddCustomHabit = true }) {
+                            HStack {
+                                Image(systemName: "plus.circle.fill")
+                                Text("habit_add_custom")
+                            }
+                            .foregroundStyle(AppTheme.Colors.accent)
+                            .frame(maxWidth: .infinity, alignment: .leading)
+                        }
+                    }
+                }
+                .padding(.horizontal, AppTheme.Spacing.lg)
+            }

            Spacer()
@@
        }
+        .background(AppBackground())
*** End Patch
```

### 4. HabitSetupStepView.swift - habitCard/customHabitCardのスタイル更新

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift
@@
    @ViewBuilder
    private func habitCard(for habit: HabitType, isCustom: Bool) -> some View {
        let isSelected = selectedHabits.contains(habit)
        
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                Text(habit.title)
-                    .font(.headline)
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
            }
            
            Spacer()
            
            if isSelected {
                if let time = habitTimes[habit] {
                    Text(time.formatted(.dateTime.hour().minute()))
-                        .font(.subheadline)
-                        .foregroundStyle(.secondary)
+                        .font(AppTheme.Typography.subheadlineDynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
            
            Toggle("", isOn: Binding(
                get: { isSelected },
                set: { isOn in
                    if isOn {
                        selectedHabits.insert(habit)
                        // 時間設定シートを表示
                        sheetTime = habitTimes[habit] ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
                        showingTimePicker = habit
                    } else {
                        selectedHabits.remove(habit)
                        habitTimes.removeValue(forKey: habit)
                    }
                }
            ))
            .labelsHidden()
        }
-        .padding()
-        .background(Color(.systemGray6))
-        .cornerRadius(12)
+        .padding(AppTheme.Spacing.md)
        .contentShape(Rectangle())
        .onTapGesture {
            // 選択状態に関わらずタップで時間設定シートを開く
            sheetTime = habitTimes[habit] ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
            showingTimePicker = habit
        }
    }
    
    @ViewBuilder
    private func customHabitCard(for customHabit: CustomHabitConfiguration) -> some View {
        let hasTime = customHabitTimes[customHabit.id] != nil
        
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                Text(customHabit.name)
-                    .font(.headline)
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
            }
            
            Spacer()
            
            if hasTime {
                if let time = customHabitTimes[customHabit.id] {
                    Text(time.formatted(.dateTime.hour().minute()))
-                        .font(.subheadline)
-                        .foregroundStyle(.secondary)
+                        .font(AppTheme.Typography.subheadlineDynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
            
            Toggle("", isOn: Binding(
                get: { hasTime },
                set: { isOn in
                    if isOn {
                        sheetTime = customHabitTimes[customHabit.id] ?? Date()
                        showingCustomTimePicker = customHabit.id
                    } else {
                        customHabitTimes.removeValue(forKey: customHabit.id)
                    }
                }
            ))
            .labelsHidden()
        }
-        .padding()
-        .background(Color(.systemGray6))
-        .cornerRadius(12)
+        .padding(AppTheme.Spacing.md)
        .contentShape(Rectangle())
        .onTapGesture {
            sheetTime = customHabitTimes[customHabit.id] ?? Date()
            showingCustomTimePicker = customHabit.id
        }
    }
*** End Patch
```

### 5. HabitsSectionView.swift - カードベースレイアウト適用（List構造を維持）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Habits/HabitsSectionView.swift
@@
    var body: some View {
-        List {
+        ScrollView {
+            VStack(spacing: AppTheme.Spacing.md) {
             Section(String(localized: "settings_habits")) {
                 // 全習慣を時系列順に表示（時刻設定済み）
                 ForEach(sortedAllHabits, id: \.id) { item in
                     if let habit = item.habit {
-                        habitRow(for: habit, time: item.time)
+                        CardView {
+                            habitRow(for: habit, time: item.time)
+                        }
                     } else if let customId = item.customId {
-                        customHabitRow(id: customId, name: item.name, time: item.time)
-                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
-                                Button(role: .destructive) {
-                                    appState.removeCustomHabit(id: customId)
-                                } label: {
-                                    Label(String(localized: "common_delete"), systemImage: "trash")
-                                }
-                            }
+                        CardView {
+                            customHabitRow(id: customId, name: item.name, time: item.time)
+                                .contextMenu {
+                                    Button(role: .destructive, action: {
+                                        appState.removeCustomHabit(id: customId)
+                                    }) {
+                                        Label(String(localized: "common_delete"), systemImage: "trash")
+                                    }
+                                }
+                        }
                     }
                 }
                 
                 // 時間未設定のデフォルト習慣
                 ForEach(inactiveDefaultHabits, id: \.self) { habit in
-                    habitRow(for: habit, time: nil)
+                    CardView {
+                        habitRow(for: habit, time: nil)
+                    }
                 }
                 
                 // 時間未設定のカスタム習慣
                 ForEach(inactiveCustomHabits, id: \.id) { habit in
-                    customHabitRow(id: habit.id, name: habit.name, time: nil)
-                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
-                            Button(role: .destructive) {
-                                appState.removeCustomHabit(id: habit.id)
-                            } label: {
-                                Label(String(localized: "common_delete"), systemImage: "trash")
-                            }
-                        }
+                    CardView {
+                        customHabitRow(id: habit.id, name: habit.name, time: nil)
+                            .contextMenu {
+                                Button(role: .destructive, action: {
+                                    appState.removeCustomHabit(id: habit.id)
+                                }) {
+                                    Label(String(localized: "common_delete"), systemImage: "trash")
+                                }
+                            }
+                    }
                 }
                 
                 // 「習慣を追加」ボタン
-                Button(action: { activeSheet = .addCustom }) {
-                    HStack {
-                        Image(systemName: "plus.circle.fill")
-                        Text(String(localized: "habit_add_custom"))
-                    }
+                CardView {
+                    Button(action: { activeSheet = .addCustom }) {
+                        HStack {
+                            Image(systemName: "plus.circle.fill")
+                            Text(String(localized: "habit_add_custom"))
+                        }
+                        .foregroundStyle(AppTheme.Colors.accent)
+                        .frame(maxWidth: .infinity, alignment: .leading)
+                    }
                 }
             }
+            }
+            .padding(.horizontal, AppTheme.Spacing.lg)
+            .padding(.vertical, AppTheme.Spacing.md)
         }
+        .background(AppBackground())
*** End Patch
```

### 6. HabitsSectionView.swift - habitRow/customHabitRowのスタイル更新

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Habits/HabitsSectionView.swift
@@
    @ViewBuilder
    private func habitRow(for habit: HabitType, time: DateComponents?) -> some View {
        let isActive = activeHabits.contains(habit)
        let date = time.flatMap { Calendar.current.date(from: $0) }
        
        HStack {
            // 左側ラベル領域のみタップ可能にして、トグル操作時にシートが開かないようにする
            VStack(alignment: .leading, spacing: 8) {
                Text(habit.title)
-                    .font(.headline)
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
            }
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
            
            Spacer()
            
            if isActive, let date = date {
                Text(date.formatted(.dateTime.hour().minute()))
-                    .font(.subheadline)
-                    .foregroundStyle(.secondary)
+                    .font(AppTheme.Typography.subheadlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            
            Toggle("", isOn: Binding(
                get: { isActive },
                set: { isOn in
                    if isOn {
                        if let date = date {
                            activeHabits.insert(habit)
                            habitTimes[habit] = date
                        } else {
                            // 時刻未設定なら即シート表示（Saveで確定、CancelでOFFへ戻す）
                            sheetTime = Calendar.current.date(from: habit.defaultTime) ?? Date()
                            activeSheet = .habit(habit)
                            // 一時的にON表示しない（Cancel時にOFFに戻すため）
                        }
                    } else {
                        activeHabits.remove(habit)
                    }
                }
            ))
            .labelsHidden()
        }
-        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
-            Button(role: .destructive) {
-                // デフォルト習慣の削除＝スケジュールのクリア
-                appState.removeHabitSchedule(habit)
-                activeHabits.remove(habit)
-                habitTimes.removeValue(forKey: habit)
-            } label: {
-                Label(String(localized: "common_delete"), systemImage: "trash")
-            }
-        }
+        .contextMenu {
+            Button(role: .destructive, action: {
+                // デフォルト習慣の削除＝スケジュールのクリア
+                appState.removeHabitSchedule(habit)
+                activeHabits.remove(habit)
+                habitTimes.removeValue(forKey: habit)
+            }) {
+                Label(String(localized: "common_delete"), systemImage: "trash")
+            }
+        }
    }
    
    @ViewBuilder
    private func customHabitRow(id: UUID, name: String, time: DateComponents?) -> some View {
        let isActive = activeCustomHabits.contains(id)
        let date = time.flatMap { Calendar.current.date(from: $0) }
        
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                Text(name)
-                    .font(.headline)
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture {
                if isActive {
                    activeSheet = .customEditor(id)
                } else {
                    // 時刻未設定時も時刻選択シートを表示
                    sheetTime = date ?? Date()
                    activeSheet = .custom(id)
                }
            }
            
            Spacer()
            
            if isActive, let date = date {
                Text(date.formatted(.dateTime.hour().minute()))
-                    .font(.subheadline)
-                    .foregroundStyle(.secondary)
+                    .font(AppTheme.Typography.subheadlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            
            Toggle("", isOn: Binding(
                get: { isActive },
                set: { isOn in
                    if isOn {
                        if let date = date {
                            activeCustomHabits.insert(id)
                            customHabitTimes[id] = date
                        } else {
                            sheetTime = Date()
                            activeSheet = .custom(id)
                            // 一時的にON表示しない（Cancel時にOFFに戻すため）
                        }
                    } else {
                        activeCustomHabits.remove(id)
                    }
                }
            ))
            .labelsHidden()
        }
    }
*** End Patch
```

### 7. HabitsTabView.swift - 背景適用

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Habits/HabitsTabView.swift
@@
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView() // Personalizationと理想の姿のみ
                .environmentObject(appState)
        }
+        .background(AppBackground())
    }
*** End Patch
```

## 適用順序

1. AppTheme.swift - rgba背景色オプション追加
2. AppBackground.swift - 透明度オプション対応
3. HabitSetupStepView.swift - カードレイアウト適用（2つのパッチ）
4. HabitsSectionView.swift - カードレイアウト適用（2つのパッチ）
5. HabitsTabView.swift - 背景適用

## 注意事項

- `swipeActions`は`List`専用のため、`ScrollView`では`contextMenu`に置き換えています
- カードレイアウト適用により、既存の`List`の機能（スワイプアクション）は`contextMenu`に変更されます
- タイポグラフィとカラーは`AppTheme`を使用して統一されています