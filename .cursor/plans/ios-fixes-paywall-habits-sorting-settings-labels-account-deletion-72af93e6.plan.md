<!-- 72af93e6-f2f8-48f7-b62d-3d2040aad627 5df4305a-5c7e-4cd8-b6be-6539163fcd48 -->
# iOS修正: ペイウォール、習慣ソート、設定ラベル、アカウント削除

**実装ステータス**: ✅ 完了

**実装日**: 2025-01-XX

## 1. オンボーディングのペイウォール価格表示の削除

### ファイル: `aniccaios/aniccaios/Components/PaywallContainerView.swift`

```diff
--- a/aniccaios/aniccaios/Components/PaywallContainerView.swift
+++ b/aniccaios/aniccaios/Components/PaywallContainerView.swift
@@ -33,11 +33,7 @@ struct PaywallContainerView: View {
                 // Guideline 3.1.2対応: 請求額を最強調、法的リンクを常設
                 VStack(spacing: 0) {
                     // 上部: 請求額を最も目立つ形で表示
-                    if let primaryPackage = offeringToDisplay.availablePackages.first {
-                        PricingDisclosureBanner(
-                            billedAmountText: PricingDisclosureBanner.billedText(for: primaryPackage),
-                            perMonthText: PricingDisclosureBanner.perMonthText(for: primaryPackage),
-                            noteText: "Cancel anytime. Price may vary by region and currency."
-                        )
-                    }
+                    // PricingDisclosureBannerを削除（価格表示を非表示化）
                     
                     // RevenueCatUIのPaywallViewを使用
                     PaywallView(offering: offeringToDisplay)
```

### ファイル: `aniccaios/aniccaios/Views/PricingDisclosureBanner.swift`

```diff
--- a/aniccaios/aniccaios/Views/PricingDisclosureBanner.swift
+++ b/aniccaios/aniccaios/Views/PricingDisclosureBanner.swift
@@ -5,24 +5,15 @@ import RevenueCat
 
 struct PricingDisclosureBanner: View {
     let billedAmountText: String
-    let perMonthText: String?
-    let noteText: String
     
     var body: some View {
         VStack(spacing: 6) {
             Text(billedAmountText)
                 .font(.largeTitle)
                 .bold()
                 .multilineTextAlignment(.center)
-            if let perMonthText {
-                Text(perMonthText)
-                    .font(.subheadline)
-                    .foregroundColor(.secondary)
-            }
-            Text(noteText)
-                .font(.footnote)
-                .foregroundColor(.secondary)
         }
         .padding(.horizontal)
         .padding(.vertical, 12)
     }
 }
 
 // Helper to generate billed amount text from Package
 extension PricingDisclosureBanner {
     static func billedText(for package: Package) -> String {
         let price = package.storeProduct.localizedPriceString
         if let period = package.storeProduct.subscriptionPeriod {
             switch period.unit {
             case .year:
-                return "\(price)/yr (auto-renewing)"
+                return "\(price)/yr"
             case .month:
-                return "\(price)/mo (auto-renewing)"
+                return "\(price)/mo"
             case .week:
-                return "\(price)/wk (auto-renewing)"
+                return "\(price)/wk"
             default:
-                return "\(price) (auto-renewing)"
+                return price
             }
         }
         return price
     }
     
-    static func perMonthText(for package: Package) -> String? {
-        guard let period = package.storeProduct.subscriptionPeriod,
-              period.unit == .year else {
-            return nil
-        }
-        let price = package.storeProduct.price
-        let perMonth = price / 12
-        let formatter = package.storeProduct.priceFormatter ?? {
-            let f = NumberFormatter()
-            f.numberStyle = .currency
-            f.locale = Locale.current
-            return f
-        }()
-        formatter.maximumFractionDigits = 2
-        if let formatted = formatter.string(from: NSDecimalNumber(decimal: perMonth)) {
-            return "≈ \(formatted)/mo (for comparison)"
-        }
-        return nil
-    }
 }
```

## 2. 習慣リストの時系列ソート

### ファイル: `aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift`

```diff
--- a/aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift
+++ b/aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift
@@ -15,14 +15,40 @@ struct HabitSetupStepView: View {
     @State private var showingAddCustomHabit = false
     @State private var newCustomHabitName = ""
     
-    // 追加: デフォルト習慣を時刻昇順にソート
-    private var sortedDefaultHabits: [HabitType] {
-        let base: [HabitType] = [.wake, .training, .bedtime]
-        return base.sorted { a, b in
-            let ca = habitTimes[a] ?? Calendar.current.date(from: a.defaultTime) ?? Date.distantFuture
-            let cb = habitTimes[b] ?? Calendar.current.date(from: b.defaultTime) ?? Date.distantFuture
-            return ca < cb
+    // 時系列順にソートされた全習慣（デフォルト習慣とカスタム習慣を統合）
+    private var sortedAllHabits: [(id: String, name: String, time: Date?, isCustom: Bool, customId: UUID?)] {
+        var allHabits: [(id: String, name: String, time: Date?, isCustom: Bool, customId: UUID?)] = []
+        
+        // デフォルト習慣を追加
+        for habit in [HabitType.wake, .training, .bedtime] {
+            let time = habitTimes[habit] ?? Calendar.current.date(from: habit.defaultTime)
+            allHabits.append((
+                id: habit.rawValue,
+                name: habit.title,
+                time: time,
+                isCustom: false,
+                customId: nil
+            ))
+        }
+        
+        // カスタム習慣を追加
+        for customHabit in appState.customHabits {
+            let time = customHabitTimes[customHabit.id]
+            allHabits.append((
+                id: customHabit.id.uuidString,
+                name: customHabit.name,
+                time: time,
+                isCustom: true,
+                customId: customHabit.id
+            ))
+        }
+        
+        // 時系列順にソート（時刻が早い順）
+        return allHabits.sorted { item1, item2 in
+            guard let time1 = item1.time, let time2 = item2.time else {
+                // 時刻未設定のものは最後に
+                return item1.time != nil
+            }
+            return time1 < time2
         }
     }
 
     var body: some View {
@@ -40,20 +66,20 @@ struct HabitSetupStepView: View {
 
             List {
                 Section {
-                    // デフォルト習慣（時刻の早い順）
-                    ForEach(sortedDefaultHabits, id: \.self) { habit in
-                        habitCard(for: habit, isCustom: false)
-                    }
-                    
-                    // カスタム習慣
-                    ForEach(appState.customHabits) { customHabit in
-                        customHabitCard(for: customHabit)
-                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
-                                Button(role: .destructive) {
-                                    appState.removeCustomHabit(id: customHabit.id)
-                                } label: {
-                                    Label(String(localized: "common_delete"), systemImage: "trash")
+                    // 全習慣を時系列順に表示
+                    ForEach(sortedAllHabits, id: \.id) { item in
+                        if item.isCustom, let customId = item.customId {
+                            customHabitCard(for: appState.customHabits.first(where: { $0.id == customId })!)
+                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
+                                    Button(role: .destructive) {
+                                        appState.removeCustomHabit(id: customId)
+                                    } label: {
+                                        Label(String(localized: "common_delete"), systemImage: "trash")
+                                    }
                                 }
+                        } else if let habit = HabitType(rawValue: item.id) {
+                            habitCard(for: habit, isCustom: false)
+                        }
                     }
                     
                     // 「習慣を追加」ボタン
```

### ファイル: `aniccaios/aniccaios/Habits/HabitsSectionView.swift`

```diff
--- a/aniccaios/aniccaios/Habits/HabitsSectionView.swift
+++ b/aniccaios/aniccaios/Habits/HabitsSectionView.swift
@@ -30,50 +30,50 @@ struct HabitsSectionView: View {
     @State private var isAdding = false
     // 削除確認を廃止（即時削除）
     
-    // 時系列順にソートされた習慣リスト（SettingsViewと同じロジック）
-    private var sortedHabits: [(habit: HabitType, time: DateComponents?)] {
-        let allHabits = HabitType.allCases.filter { $0 != .custom }
-        return allHabits.compactMap { habit in
-            let time = habitTimes[habit].flatMap { date in
-                Calendar.current.dateComponents([.hour, .minute], from: date)
-            }
-            return (habit, time)
+    // 時系列順にソートされた全習慣（デフォルト習慣とカスタム習慣を統合）
+    private var sortedAllHabits: [(id: String, habit: HabitType?, customId: UUID?, name: String, time: DateComponents?, isActive: Bool)] {
+        var allHabits: [(id: String, habit: HabitType?, customId: UUID?, name: String, time: DateComponents?, isActive: Bool)] = []
+        
+        // デフォルト習慣を追加（時刻設定済み）
+        for habit in [HabitType.wake, .training, .bedtime] {
+            if let date = habitTimes[habit] {
+                let components = Calendar.current.dateComponents([.hour, .minute], from: date)
+                allHabits.append((
+                    id: habit.rawValue,
+                    habit: habit,
+                    customId: nil,
+                    name: habit.title,
+                    time: components,
+                    isActive: activeHabits.contains(habit)
+                ))
+            }
         }
-        .sorted { item1, item2 in
-            guard let time1 = item1.time, let time2 = item2.time else {
-                return item1.time != nil
-            }
-            let hour1 = time1.hour ?? 0
-            let hour2 = time2.hour ?? 0
-            let minute1 = time1.minute ?? 0
-            let minute2 = time2.minute ?? 0
-            return hour1 < hour2 || (hour1 == hour2 && minute1 < minute2)
+        
+        // カスタム習慣を追加（時刻設定済み）
+        for customHabit in appState.customHabits {
+            if let date = customHabitTimes[customHabit.id] {
+                let components = Calendar.current.dateComponents([.hour, .minute], from: date)
+                allHabits.append((
+                    id: customHabit.id.uuidString,
+                    habit: nil,
+                    customId: customHabit.id,
+                    name: customHabit.name,
+                    time: components,
+                    isActive: activeCustomHabits.contains(customHabit.id)
+                ))
+            }
         }
-    }
-    
-    private var sortedCustomHabits: [(id: UUID, name: String, time: DateComponents?)] {
-        let calendar = Calendar.current
-        return appState.customHabits.compactMap { habit in
-            if let date = customHabitTimes[habit.id] {
-                let components = calendar.dateComponents([.hour, .minute], from: date)
-                return (habit.id, habit.name, components)
-            } else {
-                return (habit.id, habit.name, nil)
-            }
-        }
-        .sorted { item1, item2 in
-            guard let time1 = item1.time, let time2 = item2.time else {
-                return item1.time != nil
-            }
-            let hour1 = time1.hour ?? 0
-            let hour2 = time2.hour ?? 0
-            let minute1 = time1.minute ?? 0
-            let minute2 = time2.minute ?? 0
-            return hour1 < hour2 || (hour1 == hour2 && minute1 < minute2)
+        
+        // 時系列順にソート（時刻が早い順）
+        return allHabits.sorted { item1, item2 in
+            guard let time1 = item1.time, let time2 = item2.time else {
+                // 時刻未設定のものは最後に
+                return item1.time != nil
+            }
+            let hour1 = time1.hour ?? 0
+            let hour2 = time2.hour ?? 0
+            let minute1 = time1.minute ?? 0
+            let minute2 = time2.minute ?? 0
+            return hour1 < hour2 || (hour1 == hour2 && minute1 < minute2)
         }
     }
     
     private var inactiveDefaultHabits: [HabitType] {
         [HabitType.wake, .training, .bedtime].filter { !activeHabits.contains($0) }
     }
     
     private var inactiveCustomHabits: [CustomHabitConfiguration] {
         appState.customHabits.filter { !activeCustomHabits.contains($0.id) }
     }
     
     var body: some View {
         List {
             Section(String(localized: "settings_habits")) {
-                // デフォルト習慣（時系列順）
-                ForEach(sortedHabits, id: \.habit) { item in
-                    habitRow(for: item.habit, time: item.time)
-                }
-                
-                // 時間未設定のデフォルト習慣
-                ForEach(inactiveDefaultHabits, id: \.self) { habit in
-                    habitRow(for: habit, time: nil)
-                }
-                
-                // カスタム習慣（時系列順）
-                ForEach(sortedCustomHabits, id: \.id) { item in
-                    customHabitRow(id: item.id, name: item.name, time: item.time)
-                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
-                            Button(role: .destructive) {
-                                appState.removeCustomHabit(id: item.id)
-                            } label: {
-                                Label(String(localized: "common_delete"), systemImage: "trash")
-                            }
-                        }
-                }
-                
-                // 時間未設定のカスタム習慣
-                ForEach(inactiveCustomHabits, id: \.id) { habit in
-                    customHabitRow(id: habit.id, name: habit.name, time: nil)
-                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
-                            Button(role: .destructive) {
-                                appState.removeCustomHabit(id: habit.id)
-                            } label: {
-                                Label(String(localized: "common_delete"), systemImage: "trash")
-                            }
-                        }
+                // 全習慣を時系列順に表示（時刻設定済み）
+                ForEach(sortedAllHabits, id: \.id) { item in
+                    if let habit = item.habit {
+                        habitRow(for: habit, time: item.time)
+                    } else if let customId = item.customId {
+                        customHabitRow(id: customId, name: item.name, time: item.time)
+                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
+                                Button(role: .destructive) {
+                                    appState.removeCustomHabit(id: customId)
+                                } label: {
+                                    Label(String(localized: "common_delete"), systemImage: "trash")
+                                }
+                            }
+                    }
                 }
+                
+                // 時間未設定のデフォルト習慣
+                ForEach(inactiveDefaultHabits, id: \.self) { habit in
+                    habitRow(for: habit, time: nil)
+                }
+                
+                // 時間未設定のカスタム習慣
+                ForEach(inactiveCustomHabits, id: \.id) { habit in
+                    customHabitRow(id: habit.id, name: habit.name, time: nil)
+                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
+                            Button(role: .destructive) {
+                                appState.removeCustomHabit(id: habit.id)
+                            } label: {
+                                Label(String(localized: "common_delete"), systemImage: "trash")
+                            }
+                        }
                 }
                 
                 // 「習慣を追加」ボタン
```

## 3. SettingsのSubscriptionラベル修正

### ファイル: `aniccaios/aniccaios/SettingsView.swift`

```diff
--- a/aniccaios/aniccaios/SettingsView.swift
+++ b/aniccaios/aniccaios/SettingsView.swift
@@ -20,13 +20,13 @@ struct SettingsView: View {
             List {
                 // Subscription (復活)
                 Section(String(localized: "settings_subscription_title")) {
                     HStack {
-                        Text(String(localized: "settings_subscription_plan"))
+                        Text(String(localized: "settings_subscription_current_plan"))
                         Spacer()
                         Text(appState.subscriptionInfo.displayPlanName)
                     }
                     // SubscriptionInfoにmonthlyUsageCountとmonthlyUsageLimitが存在する場合のみ表示
                     if let used = appState.subscriptionInfo.monthlyUsageCount,
                        let limit = appState.subscriptionInfo.monthlyUsageLimit {
                         HStack {
-                            Text(String(localized: "settings_subscription_usage"))
+                            Text(String(localized: "settings_subscription_usage"))
                             Spacer()
                             Text("\(used)/\(limit)")
                         }
```

### ファイル: `aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings`

```diff
--- a/aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
+++ b/aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
@@ -99,6 +99,7 @@
 "settings_subscription_current_plan" = "現在のプラン";
 "settings_subscription_current" = "現在";
 "settings_subscription_select" = "選択";
+"settings_subscription_usage" = "利用量";
 "settings_subscription_no_plans" = "利用可能なプランがありません";
```

### ファイル: `aniccaios/aniccaios/Resources/en.lproj/Localizable.strings`

```diff
--- a/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
+++ b/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
@@ -99,6 +99,7 @@
 "settings_subscription_current_plan" = "Current Plan";
 "settings_subscription_current" = "Current";
 "settings_subscription_select" = "Select";
+"settings_subscription_usage" = "Usage";
 "settings_subscription_no_plans" = "No subscription plans available";
```

## 4. アカウント削除エラーの修正

### ファイル: `apps/api/src/routes/mobile/account.js`

エラーログによると、`profiles`テーブルに`user_id`カラムが存在しないとのこと。`profiles`テーブルは`id`（UUID）が主キーで、`user_id`カラムは存在しません。`mobile_profiles`テーブルには`user_id`カラムがありますが、これは`profiles.id`を参照しています。

`userId`がApple User ID（文字列）の場合は、`profiles`テーブルの`metadata->>'apple_user_id'`を使用して削除する必要があります。

```diff

--- a/apps/api/src/routes/mobile/account.js

+++ b/apps/api/src/routes/mobile/account.js

@@ -38,17 +38,25 @@ router.delete('/', async (req, res, next) => {

// アプリDBの削除（pg Poolでトランザクション）

const client = await pool.connect();

try {

await client.query('BEGIN');

// 関連データを削除（外部キー制約の順序に注意）

await client.query('DELETE FROM usage_sessions WHERE user_id = $1', [userId]);

await client.query('DELETE FROM mobile_profiles WHERE user_id = $1', [userId]);

await client.query('DELETE FROM mobile_voip_tokens WHERE user_id = $1', [userId]);

await client.query('DELETE FROM tokens WHERE user_id = $1', [userId]);

-      // profilesテーブルはidが主キーなので、user_idではなくidを使用
-      await client.query('DELETE FROM profiles WHERE id = $1::uuid', [userId]);
-      
-      // profilesテーブルの削除: userIdがUUID形式かどうかを確認
-      // UUID形式の場合は直接削除、そうでない場合はapple_user_idで検索
-      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
-      if (uuidRegex.test(userId)) {
-        // UUID形式の場合
-        await client.query('DELETE FROM profiles WHERE id = $1::uuid', [userId]);
-      } else {
-        // Apple User IDの場合（metadataから検索）
-        await client.query(`DELETE FROM profiles WHERE metadata->>'apple_user_id' = $1`, [userId]);
-      }
-      

// user_settingsはON DELETE CASCADEで自動削除される

await client.query('COMMIT');

} catch (e) {

await client.query('ROLLBACK');

throw e;

} finally {

client.release();

}