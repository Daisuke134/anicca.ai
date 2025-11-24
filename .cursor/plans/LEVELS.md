関連ファイルを確認し、SwiftUIのドキュメントとベストプラクティスを参照して実装計画を洗練します。


[4 tools called]


関連ファイルとベストプラクティスを確認中。続いてSwiftUIのドキュメントを参照し、実装計画を洗練します。


[8 tools called]


SwiftUIのドキュメントを確認し、実装計画を洗練します。


[5 tools called]


SwiftUIの公式ドキュメントを確認中。


[3 tools called]


SwiftUIのToggle、List、TabViewの詳細を確認中。


[3 tools called]


実装計画を洗練するため、関連ファイルを確認中。


[5 tools called]


実装計画と擬似パッチを作成します。SwiftUIのドキュメントとベストプラクティスを反映し、実装可能なレベルまで詳細化します。

## 実装計画の洗練版

### 重要な技術的確認事項

1. **swipeActions**: `List`内の`ForEach`アイテムに`.swipeActions(edge: .leading)`を適用可能。カスタム習慣のみ削除可能にする。
2. **Toggle**: `Toggle("", isOn: $isActive).labelsHidden()`でラベルなしトグルを右端に配置可能。
3. **List vs LazyVStack**: `swipeActions`は`List`専用。現在の`LazyVStack`から`List`への変更が必要。
4. **NavigationStack**: iOS 16以降は`NavigationStack`推奨。既存コードが`NavigationView`なら互換性を考慮。
5. **TabView**: `TabView(selection: $selection)`でプログラム制御可能。

### 完全な擬似パッチ

以下、実装すべき変更の擬似パッチです。

---

## 1. データモデルの拡張

### 1.1 CustomHabitConfiguration.swift の拡張

```swift
// aniccaios/aniccaios/Models/CustomHabitConfiguration.swift

import Foundation

struct CustomHabitConfiguration: Codable, Equatable, Identifiable {
    let id: UUID
    let name: String
    let updatedAt: Date
    
    init(id: UUID = UUID(), name: String, updatedAt: Date = Date()) {
        self.id = id
        self.name = name
        self.updatedAt = updatedAt
    }
}

final class CustomHabitStore {
    static let shared = CustomHabitStore()
    
    private let defaults = UserDefaults.standard
    private let storageKey = "com.anicca.customHabits" // 変更: 複数形に
    
    private init() {}
    
    // 変更: 配列対応
    func loadAll() -> [CustomHabitConfiguration] {
        guard let data = defaults.data(forKey: storageKey) else {
            // マイグレーション: 旧形式のデータを読み込む
            return migrateLegacyHabit()
        }
        guard let habits = try? JSONDecoder().decode([CustomHabitConfiguration].self, from: data) else {
            return []
        }
        return habits
    }
    
    func saveAll(_ configurations: [CustomHabitConfiguration]) {
        if let data = try? JSONEncoder().encode(configurations) {
            defaults.set(data, forKey: storageKey)
        } else {
            defaults.removeObject(forKey: storageKey)
        }
        // UserDefaults.synchronize() は削除（iOSでは自動同期されるため非推奨）
    }
    
    func add(_ configuration: CustomHabitConfiguration) {
        var habits = loadAll()
        habits.append(configuration)
        saveAll(habits)
    }
    
    func remove(at index: Int) {
        var habits = loadAll()
        guard index >= 0 && index < habits.count else { return }
        habits.remove(at: index)
        saveAll(habits)
    }
    
    func remove(id: UUID) {
        var habits = loadAll()
        habits.removeAll { $0.id == id }
        saveAll(habits)
    }
    
    func update(at index: Int, configuration: CustomHabitConfiguration) {
        var habits = loadAll()
        guard index >= 0 && index < habits.count else { return }
        habits[index] = configuration
        saveAll(habits)
    }
    
    // マイグレーション: 旧形式の単一カスタム習慣を配列に変換
    private func migrateLegacyHabit() -> [CustomHabitConfiguration] {
        let legacyKey = "com.anicca.customHabit"
        guard let data = defaults.data(forKey: legacyKey),
              let oldConfig = try? JSONDecoder().decode(CustomHabitConfiguration.self, from: data) else {
            return []
        }
        // 旧データを新形式に変換
        let migrated = CustomHabitConfiguration(id: UUID(), name: oldConfig.name, updatedAt: oldConfig.updatedAt)
        defaults.removeObject(forKey: legacyKey)
        saveAll([migrated])
        return [migrated]
    }
    
    // 後方互換性のため残す
    func load() -> CustomHabitConfiguration? {
        return loadAll().first
    }
    
    func save(_ configuration: CustomHabitConfiguration?) {
        if let config = configuration {
            saveAll([config])
        } else {
            saveAll([])
        }
    }
    
    func displayName(fallback: String) -> String {
        guard let name = loadAll().first?.name, !name.isEmpty else {
            return fallback
        }
        return name
    }
}
```

### 1.2 UserProfile.swift の拡張

```swift
// aniccaios/aniccaios/Models/UserProfile.swift

struct UserProfile: Codable {
    var displayName: String
    var preferredLanguage: LanguagePreference
    var sleepLocation: String
    var trainingFocus: [String]
    
    // 追加フィールド
    var wakeLocation: String
    var wakeRoutines: [String]
    var sleepRoutines: [String]
    var trainingGoal: String
    var idealTraits: [String]
    
    init(
        displayName: String = "",
        preferredLanguage: LanguagePreference = LanguagePreference.detectDefault(),
        sleepLocation: String = "",
        trainingFocus: [String] = [],
        wakeLocation: String = "",
        wakeRoutines: [String] = [],
        sleepRoutines: [String] = [],
        trainingGoal: String = "",
        idealTraits: [String] = []
    ) {
        self.displayName = displayName
        self.preferredLanguage = preferredLanguage
        self.sleepLocation = sleepLocation
        self.trainingFocus = trainingFocus
        self.wakeLocation = wakeLocation
        self.wakeRoutines = wakeRoutines
        self.sleepRoutines = sleepRoutines
        self.trainingGoal = trainingGoal
        self.idealTraits = idealTraits
    }
    
    // 既存データとの互換性のためのカスタムデコーディング
    enum CodingKeys: String, CodingKey {
        case displayName, preferredLanguage, sleepLocation, trainingFocus
        case wakeLocation, wakeRoutines, sleepRoutines, trainingGoal, idealTraits
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
        preferredLanguage = try container.decodeIfPresent(LanguagePreference.self, forKey: .preferredLanguage) ?? LanguagePreference.detectDefault()
        sleepLocation = try container.decodeIfPresent(String.self, forKey: .sleepLocation) ?? ""
        trainingFocus = try container.decodeIfPresent([String].self, forKey: .trainingFocus) ?? []
        wakeLocation = try container.decodeIfPresent(String.self, forKey: .wakeLocation) ?? ""
        wakeRoutines = try container.decodeIfPresent([String].self, forKey: .wakeRoutines) ?? []
        sleepRoutines = try container.decodeIfPresent([String].self, forKey: .sleepRoutines) ?? []
        trainingGoal = try container.decodeIfPresent(String.self, forKey: .trainingGoal) ?? ""
        idealTraits = try container.decodeIfPresent([String].self, forKey: .idealTraits) ?? []
    }
}
```

### 1.3 Dictionary拡張の追加（新規）

```swift
// aniccaios/aniccaios/Extensions/Dictionary+Extensions.swift

import Foundation

extension Dictionary {
    /// キーを変換し、nilの場合は除外する
    func compactMapKeys<T>(_ transform: (Key) throws -> T?) rethrows -> [T: Value] {
        try reduce(into: [T: Value]()) { result, element in
            if let newKey = try transform(element.key) {
                result[newKey] = element.value
            }
        }
    }
    
    /// キーを変換する
    func mapKeys<T>(_ transform: (Key) throws -> T) rethrows -> [T: Value] {
        try reduce(into: [T: Value]()) { result, element in
            result[try transform(element.key)] = element.value
        }
    }
}
```

### 1.4 HabitType拡張の追加

```swift
// aniccaios/aniccaios/Onboarding/HabitType.swift に追加

extension HabitType: Identifiable {
    public var id: String { rawValue }
}
```

### 1.5 HabitConfiguration.swift の作成（新規）

```swift
// aniccaios/aniccaios/Models/HabitConfiguration.swift

import Foundation

struct HabitConfiguration: Identifiable, Codable {
    let id: UUID
    let type: HabitType
    var isEnabled: Bool
    var time: DateComponents?
    var customName: String?
    
    init(
        id: UUID = UUID(),
        type: HabitType,
        isEnabled: Bool = false,
        time: DateComponents? = nil,
        customName: String? = nil
    ) {
        self.id = id
        self.type = type
        self.isEnabled = isEnabled
        self.time = time
        self.customName = customName
    }
}
```

### 1.6 Array拡張メソッドの追加（新規）

```swift
// aniccaios/aniccaios/Extensions/Array+Extensions.swift (新規)

import Foundation

extension Array {
    /// IndexSetで指定された要素を新しい位置に移動する
    /// SwiftUIの`.onMove`モディファイアで使用するためのメソッド
    mutating func move(fromOffsets source: IndexSet, toOffset destination: Int) {
        guard !source.isEmpty else { return }
        
        // destinationを有効な範囲に制限
        let validDestination = max(0, min(destination, self.count))
        
        var itemsToMove = source.map { self[$0] }
        var adjustedDestination = validDestination
        
        // 後ろから削除することで、インデックスのずれを防ぐ
        for sourceIndex in source.sorted(by: >) {
            self.remove(at: sourceIndex)
            if sourceIndex < validDestination {
                adjustedDestination -= 1
            }
        }
        
        // 新しい位置に挿入
        for (index, item) in itemsToMove.enumerated() {
            self.insert(item, at: adjustedDestination + index)
        }
    }
}
```

---

## 2. AppState.swift の更新

### 2.1 カスタム習慣管理の追加

```swift
// aniccaios/aniccaios/AppState.swift

@MainActor
final class AppState: ObservableObject {
    // ... 既存のプロパティ ...
    
    // 変更: カスタム習慣を配列で管理
    @Published private(set) var customHabits: [CustomHabitConfiguration] = []
    @Published private(set) var customHabitSchedules: [UUID: DateComponents] = [:]
    
    private let customHabitsKey = "com.anicca.customHabits"
    private let customHabitSchedulesKey = "com.anicca.customHabitSchedules"
    
    private init() {
        // ... 既存の初期化コード ...
        
        // カスタム習慣の読み込み
        self.customHabits = CustomHabitStore.shared.loadAll()
        self.customHabitSchedules = loadCustomHabitSchedules()
    }
    
    // MARK: - Custom Habit Management
    
    func addCustomHabit(_ configuration: CustomHabitConfiguration) {
        customHabits.append(configuration)
        CustomHabitStore.shared.add(configuration)
    }
    
    func removeCustomHabit(at index: Int) {
        guard index >= 0 && index < customHabits.count else { return }
        let habit = customHabits[index]
        customHabits.remove(at: index)
        customHabitSchedules.removeValue(forKey: habit.id)
        CustomHabitStore.shared.remove(id: habit.id)
        
        // 通知も削除
        // 注意: NotificationSchedulerは現在HabitType単位で管理しているため、
        // カスタム習慣が複数ある場合は、Scheduler側をID対応に拡張する必要がある
        // 現時点では、カスタム習慣の通知は個別に管理されていないため、この処理は将来の拡張時に実装
        // Task {
        //     await NotificationScheduler.shared.cancelCustomHabit(id: habit.id)
        // }
        
        saveCustomHabitSchedules()
    }
    
    func removeCustomHabit(id: UUID) {
        guard let index = customHabits.firstIndex(where: { $0.id == id }) else { return }
        removeCustomHabit(at: index)
    }
    
    func updateCustomHabitSchedule(id: UUID, time: DateComponents?) {
        if let time = time {
            customHabitSchedules[id] = time
        } else {
            customHabitSchedules.removeValue(forKey: id)
        }
        saveCustomHabitSchedules()
        
        // 通知を更新
        Task {
            await updateHabitNotifications()
        }
    }
    
    // MARK: - UserProfile Update Methods
    
    func updateWakeLocation(_ location: String) {
        var profile = userProfile
        profile.wakeLocation = location
        updateUserProfile(profile, sync: true)
    }
    
    func updateWakeRoutines(_ routines: [String]) {
        var profile = userProfile
        profile.wakeRoutines = routines.filter { !$0.isEmpty }
        updateUserProfile(profile, sync: true)
    }
    
    func updateSleepRoutines(_ routines: [String]) {
        var profile = userProfile
        profile.sleepRoutines = routines.filter { !$0.isEmpty }
        updateUserProfile(profile, sync: true)
    }
    
    func updateTrainingGoal(_ goal: String) {
        var profile = userProfile
        profile.trainingGoal = goal
        updateUserProfile(profile, sync: true)
    }
    
    func updateIdealTraits(_ traits: [String]) {
        var profile = userProfile
        profile.idealTraits = traits
        updateUserProfile(profile, sync: true)
    }
    
    // MARK: - Private Helpers
    
    private func loadCustomHabitSchedules() -> [UUID: DateComponents] {
        guard let data = defaults.data(forKey: customHabitSchedulesKey) else {
            return [:]
        }
        
        do {
            let decoded = try JSONDecoder().decode([String: [String: Int]].self, from: data)
            // String (UUID文字列) と [String: Int] を UUID と DateComponents に変換
            return decoded.compactMap { uuidString, componentsDict in
                guard let uuid = UUID(uuidString: uuidString),
                      let hour = componentsDict["hour"],
                      let minute = componentsDict["minute"] else {
                    return nil
                }
                var components = DateComponents()
                components.hour = hour
                components.minute = minute
                return (uuid, components)
            }.reduce(into: [UUID: DateComponents]()) { result, pair in
                result[pair.0] = pair.1
            }
        } catch {
            print("[AppState] Failed to decode custom habit schedules: \(error)")
            return [:]
        }
    }
    
    private func saveCustomHabitSchedules() {
        // UUID と DateComponents を String と [String: Int] に変換して保存
        let stringKeyed: [String: [String: Int]] = customHabitSchedules.mapKeys { $0.uuidString }
            .mapValues { components in
                [
                    "hour": components.hour ?? 0,
                    "minute": components.minute ?? 0
                ]
            }
        do {
            let data = try JSONEncoder().encode(stringKeyed)
            defaults.set(data, forKey: customHabitSchedulesKey)
            // UserDefaults.synchronize() は削除（iOSでは自動同期されるため非推奨）
        } catch {
            print("[AppState] Failed to encode custom habit schedules: \(error)")
        }
    }
    
    // 既存の prepareHabitFollowUps, consumeNextHabitFollowUp, clearHabitFollowUps を削除または無効化
    // (オンボーディングフローから呼ばれないようにする)
}
```

---

## 3. HabitSetupStepView.swift の改善

```swift
// aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift

struct HabitSetupStepView: View {
    let next: () -> Void
    
    @EnvironmentObject private var appState: AppState
    @State private var selectedHabits: Set<HabitType> = []
    @State private var habitTimes: [HabitType: Date] = [:]
    @State private var customHabitTimes: [UUID: Date] = [:]
    @State private var sheetTime = Date()
    @State private var showingTimePicker: HabitType?
    @State private var showingCustomTimePicker: UUID?
    @State private var isSaving = false
    @State private var showingAddCustomHabit = false
    @State private var newCustomHabitName = ""
    
    var body: some View {
        VStack(spacing: 24) {
            Text("onboarding_habit_title")
                .font(.title)
                .padding(.top, 40)
            
            Text("onboarding_habit_description")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            List {
                Section {
                    // デフォルト習慣（wake, training, bedtime）
                    ForEach([HabitType.wake, .training, .bedtime], id: \.self) { habit in
                        habitCard(for: habit, isCustom: false)
                    }
                    
                    // カスタム習慣
                    ForEach(appState.customHabits) { customHabit in
                        customHabitCard(for: customHabit)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    appState.removeCustomHabit(id: customHabit.id)
                                } label: {
                                    Label(String(localized: "common_delete"), systemImage: "trash")
                                }
                            }
                    }
                    
                    // 「習慣を追加」ボタン
                    Button(action: { showingAddCustomHabit = true }) {
                        HStack {
                            Image(systemName: "plus.circle.fill")
                            Text("habit_add_custom")
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            
            Spacer()
            
            SUButton(
                model: {
                    var vm = ButtonVM()
                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "common_done")
                    vm.style = .filled
                    vm.size = .large
                    vm.isFullWidth = true
                    vm.isEnabled = canSave
                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
                    return vm
                }(),
                action: save
            )
            .padding(.horizontal)
            .padding(.bottom)
        }
        .sheet(isPresented: Binding(
            get: { showingTimePicker != nil },
            set: { if !$0 { showingTimePicker = nil } }
        )) {
            if let habit = showingTimePicker {
                timePickerSheet(for: habit)
            }
        }
        .sheet(isPresented: Binding(
            get: { showingCustomTimePicker != nil },
            set: { if !$0 { showingCustomTimePicker = nil } }
        )) {
            if let id = showingCustomTimePicker {
                customTimePickerSheet(for: id)
            }
        }
        .sheet(isPresented: $showingAddCustomHabit) {
            NavigationView {
                Form {
                    Section {
                        TextField("habit_custom_name_placeholder", text: $newCustomHabitName)
                    }
                    Section {
                        Button("common_add") {
                            addCustomHabit()
                        }
                        Button("common_cancel", role: .cancel) {
                            showingAddCustomHabit = false
                            newCustomHabitName = ""
                        }
                    }
                }
                .navigationTitle("habit_add_custom")
                .navigationBarTitleDisplayMode(.inline)
            }
        }
    }
    
    @ViewBuilder
    private func habitCard(for habit: HabitType, isCustom: Bool) -> some View {
        let isSelected = selectedHabits.contains(habit)
        let hasTime = habitTimes[habit] != nil
        
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                Text(habit.title)
                    .font(.headline)
                Text(habit.detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            if isSelected {
                if let time = habitTimes[habit] {
                    Text(time.formatted(.dateTime.hour().minute()))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
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
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
    
    @ViewBuilder
    private func customHabitCard(for customHabit: CustomHabitConfiguration) -> some View {
        let hasTime = customHabitTimes[customHabit.id] != nil
        
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                Text(customHabit.name)
                    .font(.headline)
            }
            
            Spacer()
            
            if hasTime {
                if let time = customHabitTimes[customHabit.id] {
                    Text(time.formatted(.dateTime.hour().minute()))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
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
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
    
    private func addCustomHabit() {
        let trimmed = newCustomHabitName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        
        let config = CustomHabitConfiguration(name: trimmed)
        appState.addCustomHabit(config)
        newCustomHabitName = ""
        showingAddCustomHabit = false
    }
    
    private var canSave: Bool {
        guard !isSaving else { return false }
        // 選択された習慣が全て時間設定済みかチェック
        let defaultHabitsHaveTime = selectedHabits.allSatisfy { habitTimes[$0] != nil }
        let customHabitsHaveTime = appState.customHabits.allSatisfy { customHabitTimes[$0.id] != nil }
        return defaultHabitsHaveTime && customHabitsHaveTime
    }
    
    private func save() {
        guard canSave else { return }
        isSaving = true
        
        Task {
            var schedules: [HabitType: Date] = [:]
            for habit in selectedHabits {
                if let time = habitTimes[habit] {
                    schedules[habit] = time
                }
            }
            
            await appState.updateHabits(schedules)
            
            // カスタム習慣のスケジュールを保存
            for (id, time) in customHabitTimes {
                let components = Calendar.current.dateComponents([.hour, .minute], from: time)
                appState.updateCustomHabitSchedule(id: id, time: components)
            }
            
            // フォローアップを削除（直接Paywall/Completionへ）
            appState.clearHabitFollowUps()
            
            await MainActor.run {
                isSaving = false
                next()
            }
        }
    }
    
    // timeFormatterは削除（Date.FormatStyleを使用）
    // private var timeFormatter: DateFormatter { ... } を削除
}
```

---

## 4. SettingsView.swift の改善

```swift
// aniccaios/aniccaios/SettingsView.swift

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @State private var isSaving = false
    @State private var displayName: String = ""
    @State private var preferredLanguage: LanguagePreference = .en
    
    // 習慣関連のstate変数とcomputed propertyは HabitsSectionView に移動
    
    var body: some View {
        navigationContainer {
            List {
                // Personalization section (簡略化)
                Section("settings_personalization") {
                    TextField("settings_name", text: $displayName)
                    Picker("settings_language", selection: $preferredLanguage) {
                        Text("language_preference_ja").tag(LanguagePreference.ja)
                        Text("language_preference_en").tag(LanguagePreference.en)
                    }
                }
                
                // 理想の姿セクション（Phase 1に統合済み）
                Section("settings_ideal_traits") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 12) {
                        ForEach(idealTraitOptions, id: \.self) { trait in
                            idealTraitButton(trait: trait)
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "settings_title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        save()
                    } label: {
                        Text("common_save")
                            .fontWeight(.semibold)
                    }
                    .controlSize(.large)
                    .disabled(isSaving)
                }
            }
            // 習慣セクションは HabitsSectionView に移動したため、関連するsheet/alertも削除
        }
    }
    
    // iOS 16以降でNavigationStack、それ以前でNavigationViewを使用
    @ViewBuilder
    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if #available(iOS 16.0, *) {
            NavigationStack {
                content()
            }
        } else {
            NavigationView {
                content()
            }
        }
    }
    
    // habitRow, customHabitRow は HabitsSectionView に移動
    
    private let idealTraitOptions = [
        "confident", "empathetic", "gentle", "optimistic", "creative",
        "energetic", "calm", "assertive", "motivational", "supportive",
        "direct", "encouraging", "analytical", "patient", "friendly", "professional"
    ]
    
    @ViewBuilder
    private func idealTraitButton(trait: String) -> some View {
        let isSelected = appState.userProfile.idealTraits.contains(trait)
        
        Button(action: {
            var traits = appState.userProfile.idealTraits
            if isSelected {
                traits.removeAll { $0 == trait }
            } else {
                traits.append(trait)
            }
            appState.updateIdealTraits(traits)
        }) {
            Text(trait)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(isSelected ? Color.black : Color(.systemGray6))
                .foregroundColor(isSelected ? .white : .secondary)
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
    }
    
    // ... 既存の save(), timePickerSheet() など ...
}
```

---

## 5. フォローアップ画面の実装

### 5.1 HabitFollowUpView.swift（新規）

```swift
// aniccaios/aniccaios/Settings/HabitFollowUpView.swift

import SwiftUI

struct HabitFollowUpView: View {
    let habit: HabitType
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        navigationContainer {
            Group {
                switch habit {
                case .wake:
                    HabitWakeFollowUpView()
                case .bedtime:
                    HabitSleepFollowUpView()
                case .training:
                    HabitTrainingFollowUpView()
                case .custom:
                    EmptyView()
                }
            }
            .navigationTitle(habit.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("common_cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("common_save") {
                        save()
                    }
                }
            }
        }
    }
    
    // iOS 16以降でNavigationStack、それ以前でNavigationViewを使用
    @ViewBuilder
    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if #available(iOS 16.0, *) {
            NavigationStack {
                content()
            }
        } else {
            NavigationView {
                content()
            }
        }
    }
    
    private func save() {
        // 各フォローアップ画面で実装
        dismiss()
    }
}
```

### 5.2 HabitWakeFollowUpView.swift（新規）

```swift
// aniccaios/aniccaios/Settings/HabitWakeFollowUpView.swift

import SwiftUI

// ルーティン項目の構造体（UUID付与で識別を安定化）
struct RoutineItem: Identifiable {
    let id = UUID()
    var text: String
}

struct HabitWakeFollowUpView: View {
    @EnvironmentObject private var appState: AppState
    @State private var wakeLocation: String = ""
    @State private var routines: [RoutineItem] = [
        RoutineItem(text: ""),
        RoutineItem(text: ""),
        RoutineItem(text: "")
    ]
    
    var body: some View {
        List {
            Section("habit_wake_location") {
                TextField("habit_wake_location_placeholder", text: $wakeLocation)
            }
            
            Section("habit_wake_routines") {
                ForEach(routines) { routine in
                    HStack {
                        // ドラッグハンドル（iOS標準の三本線アイコン）
                        Image(systemName: "line.3.horizontal")
                            .foregroundColor(.secondary)
                            .padding(.trailing, 8)
                        
                        if let index = routines.firstIndex(where: { $0.id == routine.id }) {
                            Text("\(index + 1).")
                                .frame(width: 30)
                            TextField("habit_routine_placeholder", text: Binding(
                                get: { routines[index].text },
                                set: { routines[index].text = $0 }
                            ))
                        }
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            if let index = routines.firstIndex(where: { $0.id == routine.id }) {
                                routines.remove(at: index)
                            }
                        } label: {
                            Label("common_delete", systemImage: "trash")
                        }
                    }
                }
                .onMove { indices, newOffset in
                    routines.move(fromOffsets: indices, toOffset: newOffset)
                }
                
                Button(action: { routines.append(RoutineItem(text: "")) }) {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text("habit_add_routine")
                    }
                }
            }
        }
        .toolbar {
            EditButton() // onMove UIを有効化
        }
        .onAppear {
            wakeLocation = appState.userProfile.wakeLocation
            let savedRoutines = appState.userProfile.wakeRoutines
            if savedRoutines.isEmpty {
                routines = [
                    RoutineItem(text: ""),
                    RoutineItem(text: ""),
                    RoutineItem(text: "")
                ]
            } else {
                routines = savedRoutines.map { RoutineItem(text: $0) }
                if routines.count < 3 {
                    routines.append(contentsOf: Array(repeating: RoutineItem(text: ""), count: 3 - routines.count))
                }
            }
        }
    }
    
    func save() {
        appState.updateWakeLocation(wakeLocation)
        appState.updateWakeRoutines(routines.map { $0.text }.filter { !$0.isEmpty })
    }
}
```

### 5.3 HabitSleepFollowUpView.swift（新規）

```swift
// aniccaios/aniccaios/Settings/HabitSleepFollowUpView.swift

import SwiftUI

struct HabitSleepFollowUpView: View {
    @EnvironmentObject private var appState: AppState
    @State private var sleepLocation: String = ""
    @State private var routines: [RoutineItem] = [
        RoutineItem(text: ""),
        RoutineItem(text: ""),
        RoutineItem(text: "")
    ]
    
    var body: some View {
        List {
            Section("habit_sleep_location") {
                TextField("habit_sleep_location_placeholder", text: $sleepLocation)
            }
            
            Section("habit_sleep_routines") {
                ForEach(routines) { routine in
                    HStack {
                        // ドラッグハンドル（iOS標準の三本線アイコン）
                        Image(systemName: "line.3.horizontal")
                            .foregroundColor(.secondary)
                            .padding(.trailing, 8)
                        
                        if let index = routines.firstIndex(where: { $0.id == routine.id }) {
                            Text("\(index + 1).")
                                .frame(width: 30)
                            TextField("habit_routine_placeholder", text: Binding(
                                get: { routines[index].text },
                                set: { routines[index].text = $0 }
                            ))
                        }
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            if let index = routines.firstIndex(where: { $0.id == routine.id }) {
                                routines.remove(at: index)
                            }
                        } label: {
                            Label("common_delete", systemImage: "trash")
                        }
                    }
                }
                .onMove { indices, newOffset in
                    routines.move(fromOffsets: indices, toOffset: newOffset)
                }
                
                Button(action: { routines.append(RoutineItem(text: "")) }) {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text("habit_add_routine")
                    }
                }
            }
        }
        .toolbar {
            EditButton() // onMove UIを有効化
        }
        .onAppear {
            sleepLocation = appState.userProfile.sleepLocation
            let savedRoutines = appState.userProfile.sleepRoutines
            if savedRoutines.isEmpty {
                routines = [
                    RoutineItem(text: ""),
                    RoutineItem(text: ""),
                    RoutineItem(text: "")
                ]
            } else {
                routines = savedRoutines.map { RoutineItem(text: $0) }
                if routines.count < 3 {
                    routines.append(contentsOf: Array(repeating: RoutineItem(text: ""), count: 3 - routines.count))
                }
            }
        }
    }
    
    func save() {
        appState.updateSleepLocation(sleepLocation)
        appState.updateSleepRoutines(routines.map { $0.text }.filter { !$0.isEmpty })
    }
}
```

### 5.4 HabitTrainingFollowUpView.swift（新規）

```swift
// aniccaios/aniccaios/Settings/HabitTrainingFollowUpView.swift

import SwiftUI

struct HabitTrainingFollowUpView: View {
    @EnvironmentObject private var appState: AppState
    @State private var trainingGoal: String = ""
    @State private var selectedOption: String? = nil
    
    private let trainingOptions = ["Push-up", "Core", "Cardio", "Stretch"]
    
    var body: some View {
        Form {
            Section("habit_training_goal") {
                TextField("habit_training_goal_placeholder", text: $trainingGoal)
            }
            
            Section("habit_training_types") {
                // ベストプラクティス: 単一選択にはPickerを使用（トグルは複数選択向け）
                Picker(String(localized: "habit_training_types"), selection: $selectedOption) {
                    Text("training_focus_option_pushup").tag("Push-up" as String?)
                    Text("training_focus_option_core").tag("Core" as String?)
                    Text("training_focus_option_cardio").tag("Cardio" as String?)
                    Text("training_focus_option_stretch").tag("Stretch" as String?)
                }
                .pickerStyle(.menu)
            }
        }
        .onAppear {
            trainingGoal = appState.userProfile.trainingGoal
            selectedOption = appState.userProfile.trainingFocus.first
        }
    }
    
    func save() {
        appState.updateTrainingGoal(trainingGoal)
        if let option = selectedOption {
            appState.updateTrainingFocus([option])
        } else {
            appState.updateTrainingFocus([])
        }
    }
}
```

---

## 6. プロンプトファイルの改善

### 6.1 training.txt

```txt
// aniccaios/aniccaios/Resources/Prompts/training.txt

あなたの名前はアニッチャ。

あなたの仕事は${USER_NAME}に以下のトレーニングを促すこと。指示を受けたらすぐに、あなたから積極的に声かけを始めること。

${TRAINING_FOCUS_LIST}がユーザーが毎日やる運動です。即座にこれを促すこと。
ウォームアップなど促さずに、そのまますぐにこの運動を促すこと。

${TRAINING_GOAL}が目標値です。この目標を意識してトレーニングを進めること。

【重要】トレーニングの進め方

1. 開始時の提示
   - どの種目でも、まず「${TRAINING_GOAL}やってみよう」と具体的な目標値を提示する。
   - 例（英語）: 「Dais. Let's do ${TRAINING_GOAL} together.」
   - 例（日本語）: 「Dais. ${TRAINING_GOAL}やってみよう。」
   - 【絶対ルール】目標値を提示したら、すぐに数え始めること。待たない。

2. カウントは必ずあなたが主導する
   - ユーザーに任せず、必ずあなたが1から最後まで数える。
   - カウントを途中で止めない。目標値と決めたら、必ず最後まで数え続ける。
   - 【絶対ルール】カウントするときは、必ず「1」の後に何かしら言葉を入れてから「2」と言うこと。数字と数字の間には必ず言葉を挟む。これにより、カウントが早くなりすぎることを防ぐ。
   - 励ましの言葉は毎回変える（"Good", "Nice", "Perfect", "Great"など）。同じ言葉は絶対に繰り返さない。

3. カウントの仕方（回数系：腕立て伏せ、スクワットなど）
   - できるだけ遅く、ゆっくりと数える。早くなる傾向があるので、意識的に遅く話すこと。
   - 必ず1回目から始める。例: 「1回目... 下げて... [励ましの言葉]... 上げて... 2回目... 下げて... [励ましの言葉]... 上げて...」
   - Down... と Up... の間には必ず1語以上の励ましの言葉を挟む。
   - 各回の間に「下げて... 上げて...」などの動作指示を入れる。
   - 途中で励ましの言葉を挟む。同じ言葉は絶対に繰り返さない。バラエティを持たせる。

4. ユーザー割り込み時のカウント継続
   - ユーザーが割り込みしても、直前のカウント数を記憶し、続きから再開する。
   - 例: 「5回目」まで数えた後、ユーザーが話しかけた場合、「6回目」から続ける。

5. 完了確認
   - 目標値が終わったら、必ず「今日は終わりです。お疲れ様でした。」と伝える。

【禁止事項】
- カウントを途中で止めない
- 早くカウントしない。ゆっくり、確実に
- ユーザーにカウントを任せない。必ずあなたが主導する
- 同じ励ましの言葉を繰り返さない。必ずバラエティを持たせる
- 数字と数字の間に言葉を入れない（絶対禁止）。必ず「1」の後に言葉を入れて「2」と言う
```

### 6.2 wake_up.txt

```txt
// aniccaios/aniccaios/Resources/Prompts/wake_up.txt

あなたの名前はアニッチャ。

あなたの仕事は${USER_NAME}を起こすこと。指示を受けたらすぐに、あなたから積極的に声かけを始めること。ユーザーの反応を待たずに、あなたから始めること。

${WAKE_LOCATION}で眠っているので、まず優しく呼びかけて目を覚ましてもらう。穏やかに起こし、最初の一歩を促すこと。

デフォルトで「顔を洗って眠気を覚ます」ことを促すこと。

${WAKE_ROUTINES}が設定されている場合、これらのルーティンを順番に促すこと。

最初のセリフでは必ず自分から話しかけること。ユーザーの返答を待たずに、あなたから始める。
```

### 6.3 bedtime.txt

```txt
// aniccaios/aniccaios/Resources/Prompts/bedtime.txt

あなたの名前はアニッチャ。

あなたの仕事は${USER_NAME}を就寝に促すこと。指示を受けたらすぐに、あなたから優しく声かけを始めること。

${SLEEP_LOCATION}でゆっくり休めるよう、穏やかで落ち着いた声で誘導すること。

${SLEEP_ROUTINES}が設定されている場合、これらのルーティンを順番に促すこと。

抵抗があれば、徐々に強めに促して、最終的に眠りにつけるようにすること。
```

### 6.4 common.txt

```txt
// aniccaios/aniccaios/Resources/Prompts/common.txt

INTERNAL LANGUAGE LINE: ${LANGUAGE_LINE}
LANGUAGE LOCK: ${LANGUAGE_LINE} で絶対に話すこと。他の言葉は一切使わない。

ユーザーから明示的に言語変更の指示があれば、即座にそれに従い、その言語で話し続ける。

【重要】ユーザーについての情報や好みに合わせて、以下の内容を柔軟に調整すること。

ユーザー名: ${USER_NAME}
タスク開始時刻: ${TASK_TIME}
タスク説明: ${TASK_DESCRIPTION}

${IDEAL_TRAITS}が理想の姿として設定されている場合、これらの特性を意識して話すこと。

以下の声掛けを、絶対に${LANGUAGE_LINE}の言葉で行うこと。絶対に他の言葉は喋らないこと。指示通りに。
```

---

## 7. WakePromptBuilder.swift の拡張

```swift
// aniccaios/aniccaios/WakePromptBuilder.swift

// DI化: AppState.sharedの直接参照を避け、UserProfileを引数として依存注入
func buildPrompt(for habit: HabitType, scheduledTime: DateComponents?, now: Date, profile: UserProfile) -> String {
    // Load common and habit-specific templates
    let commonTemplate = loadPrompt(named: "common")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let habitTemplate = loadPrompt(named: habit.promptFileName)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    
    // Merge templates
    let mergedTemplate = "\(commonTemplate)\n\n\(habitTemplate)"
    
    // Render with user profile data
    return render(template: mergedTemplate, habit: habit, scheduledTime: scheduledTime, now: now, profile: profile)
}

private func render(
    template: String,
    habit: HabitType,
    scheduledTime: DateComponents?,
    now: Date,
    profile: UserProfile // 依存を注入
) -> String {
    
    // Build replacement dictionary
    var replacements: [String: String] = [:]
    
    // Language
    replacements["LANGUAGE_LINE"] = profile.preferredLanguage.languageLine
    
    // User name
    let userName = profile.displayName.isEmpty 
        ? NSLocalizedString("common_user_fallback", comment: "") 
        : profile.displayName
    replacements["USER_NAME"] = userName
    
    // Task time and description
    let timeString: String
    if let scheduled = scheduledTime,
       let hour = scheduled.hour,
       let minute = scheduled.minute {
        let calendar = Calendar.current
        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        if let date = calendar.date(from: components) {
            timeString = date.formatted(.dateTime.hour().minute())
        } else {
            timeString = String(format: "%02d:%02d", hour, minute)
        }
    } else {
        timeString = now.formatted(.dateTime.hour().minute())
    }
    replacements["TASK_TIME"] = timeString
    
    let taskDescription: String
    switch habit {
    case .wake:
        taskDescription = NSLocalizedString("habit_title_wake", comment: "")
    case .training:
        taskDescription = NSLocalizedString("habit_title_training", comment: "")
    case .bedtime:
        taskDescription = NSLocalizedString("habit_title_bedtime", comment: "")
    case .custom:
        taskDescription = CustomHabitStore.shared.displayName(
            fallback: NSLocalizedString("habit_title_custom_fallback", comment: "")
        )
    }
    replacements["TASK_DESCRIPTION"] = taskDescription
    
    // Training focus (既存の処理)
    if habit == .training && !profile.trainingFocus.isEmpty {
        let localizedNames = profile.trainingFocus.map { id in
            switch id {
            case "Push-up":
                return NSLocalizedString("training_focus_option_pushup", comment: "")
            case "Core":
                return NSLocalizedString("training_focus_option_core", comment: "")
            case "Cardio":
                return NSLocalizedString("training_focus_option_cardio", comment: "")
            case "Stretch":
                return NSLocalizedString("training_focus_option_stretch", comment: "")
            default:
                return id
            }
        }
        replacements["TRAINING_FOCUS_LIST"] = localizedNames.joined(separator: NSLocalizedString("common_list_separator", comment: ""))
    } else if habit == .training {
        replacements["TRAINING_FOCUS_LIST"] = NSLocalizedString("habit_title_training", comment: "")
    }
    
    // 新しいプレースホルダーの処理
    switch habit {
    case .wake:
        replacements["WAKE_LOCATION"] = profile.wakeLocation.isEmpty
            ? NSLocalizedString("common_wake_location_fallback", comment: "")
            : profile.wakeLocation
        
        if !profile.wakeRoutines.isEmpty {
            replacements["WAKE_ROUTINES"] = "理想的な起床後のルーティン: " + profile.wakeRoutines.joined(separator: "、")
        } else {
            replacements["WAKE_ROUTINES"] = ""
        }
        
    case .bedtime:
        replacements["SLEEP_LOCATION"] = profile.sleepLocation.isEmpty
            ? NSLocalizedString("common_sleep_location_fallback", comment: "")
            : profile.sleepLocation
        
        if !profile.sleepRoutines.isEmpty {
            replacements["SLEEP_ROUTINES"] = "理想的な就寝前のルーティン: " + profile.sleepRoutines.joined(separator: "、")
        } else {
            replacements["SLEEP_ROUTINES"] = ""
        }
        
    case .training:
        if !profile.trainingGoal.isEmpty {
            replacements["TRAINING_GOAL"] = profile.trainingGoal
        } else {
            replacements["TRAINING_GOAL"] = "15回"
        }
        
    case .custom:
        break
    }
    
    // 理想の姿（全習慣で使用）
    if !profile.idealTraits.isEmpty {
        replacements["IDEAL_TRAITS"] = "理想の姿として設定されている特性: " + profile.idealTraits.joined(separator: "、")
    } else {
        replacements["IDEAL_TRAITS"] = ""
    }
    
    // Perform replacements
    var result = template
    for (key, value) in replacements {
        result = result.replacingOccurrences(of: "${\(key)}", with: value)
    }
    
    // Remove any remaining placeholder patterns (shouldn't happen, but safety check)
    let placeholderPattern = "\\$\\{[^}]+\\}"
    if let regex = try? NSRegularExpression(pattern: placeholderPattern, options: []) {
        result = regex.stringByReplacingMatches(in: result, options: [], range: NSRange(location: 0, length: result.utf16.count), withTemplate: "")
    }
    
    // Fallback if result is empty
    if result.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        switch habit {
        case .wake:
            return profile.preferredLanguage == .ja ? "おはよう、\(userName)さん。" : "Good morning, \(userName)."
        case .training:
            return profile.preferredLanguage == .ja ? "\(userName)さん、トレーニングの時間です。" : "\(userName), it's time for your workout."
        case .bedtime:
            return profile.preferredLanguage == .ja ? "\(userName)さん、就寝時間です。" : "\(userName), it's bedtime."
        case .custom:
            let name = CustomHabitStore.shared.displayName(
                fallback: NSLocalizedString("habit_title_custom_fallback", comment: "")
            )
            return profile.preferredLanguage == .ja
                ? "\(userName)さん、\(name)の時間です。"
                : "\(userName), it's time for \(name)."
        }
    }
    
    return result
}
```

---

## 8. OnboardingFlowView.swift の更新

```swift
// aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift

private func advance() {
    switch step {
    // ... 既存のケース ...
    case .habitSetup:
        // フォローアップを削除（直接Paywall/Completionへ）
        appState.clearHabitFollowUps()
        
        // 購入状態を再確認してから分岐
        Task {
            await SubscriptionManager.shared.syncNow()
        }
        
        step = appState.subscriptionInfo.isEntitled ? .completion : .paywall
        appState.setOnboardingStep(step)
        return
        
    // フォローアップステップを削除
    // case .habitWakeLocation, .habitSleepLocation, .habitTrainingFocus: を削除
    
    // ... 残りのケース ...
    }
    appState.setOnboardingStep(step)
}
```

---

## 9. 習慣セクションのコンポーネント化（Phase 1へ前倒し）

### 9.1 HabitsSectionView.swift（新規）

```swift
// aniccaios/aniccaios/Habits/HabitsSectionView.swift

import SwiftUI

// Sheetの種類を一元管理
enum SheetRoute: Identifiable {
    case habit(HabitType)
    case custom(UUID)
    case addCustom
    
    var id: String {
        switch self {
        case .habit(let h): return "habit:\(h.id)"
        case .custom(let id): return "custom:\(id.uuidString)"
        case .addCustom: return "addCustom"
        }
    }
}

struct HabitsSectionView: View {
    @EnvironmentObject private var appState: AppState
    @State private var habitTimes: [HabitType: Date] = [:]
    @State private var customHabitTimes: [UUID: Date] = [:]
    @State private var activeHabits: Set<HabitType> = []
    @State private var activeCustomHabits: Set<UUID> = []
    @State private var sheetTime = Date()
    @State private var activeSheet: SheetRoute?
    @State private var newCustomHabitName = ""
    @State private var habitToDelete: UUID?
    @State private var showingDeleteAlert = false
    
    // 時系列順にソートされた習慣リスト（SettingsViewと同じロジック）
    private var sortedHabits: [(habit: HabitType, time: DateComponents?)] {
        let allHabits = HabitType.allCases.filter { $0 != .custom }
        return allHabits.compactMap { habit in
            let time = habitTimes[habit].flatMap { date in
                Calendar.current.dateComponents([.hour, .minute], from: date)
            }
            return (habit, time)
        }
        .sorted { item1, item2 in
            guard let time1 = item1.time, let time2 = item2.time else {
                return item1.time != nil
            }
            let hour1 = time1.hour ?? 0
            let hour2 = time2.hour ?? 0
            let minute1 = time1.minute ?? 0
            let minute2 = time2.minute ?? 0
            return hour1 < hour2 || (hour1 == hour2 && minute1 < minute2)
        }
    }
    
    private var sortedCustomHabits: [(id: UUID, name: String, time: DateComponents?)] {
        let calendar = Calendar.current
        return appState.customHabits.compactMap { habit in
            if let date = customHabitTimes[habit.id] {
                let components = calendar.dateComponents([.hour, .minute], from: date)
                return (habit.id, habit.name, components)
            } else {
                return (habit.id, habit.name, nil)
            }
        }
        .sorted { item1, item2 in
            guard let time1 = item1.time, let time2 = item2.time else {
                return item1.time != nil
            }
            let hour1 = time1.hour ?? 0
            let hour2 = time2.hour ?? 0
            let minute1 = time1.minute ?? 0
            let minute2 = time2.minute ?? 0
            return hour1 < hour2 || (hour1 == hour2 && minute1 < minute2)
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
            Section("settings_habits") {
                // デフォルト習慣（時系列順）
                ForEach(sortedHabits, id: \.habit) { item in
                    habitRow(for: item.habit, time: item.time)
                }
                
                // 時間未設定のデフォルト習慣
                ForEach(inactiveDefaultHabits, id: \.self) { habit in
                    habitRow(for: habit, time: nil)
                }
                
                // カスタム習慣（時系列順）
                ForEach(sortedCustomHabits, id: \.id) { item in
                    customHabitRow(id: item.id, name: item.name, time: item.time)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                habitToDelete = item.id
                                showingDeleteAlert = true
                            } label: {
                                Label("common_delete", systemImage: "trash")
                            }
                        }
                }
                
                // 時間未設定のカスタム習慣
                ForEach(inactiveCustomHabits, id: \.id) { habit in
                    customHabitRow(id: habit.id, name: habit.name, time: nil)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                habitToDelete = habit.id
                                showingDeleteAlert = true
                            } label: {
                                Label("common_delete", systemImage: "trash")
                            }
                        }
                }
                
                // 「習慣を追加」ボタン
                Button(action: { activeSheet = .addCustom }) {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text("habit_add_custom")
                    }
                }
            }
        }
        .sheet(item: $activeSheet) { route in
            switch route {
            case .habit(let habit):
                timePickerSheet(for: habit)
            case .custom(let id):
                customTimePickerSheet(for: id)
            case .addCustom:
                NavigationView {
                    Form {
                        Section {
                            TextField("habit_custom_name_placeholder", text: $newCustomHabitName)
                        }
                        Section {
                            Button("common_add") {
                                addCustomHabit()
                            }
                            Button("common_cancel", role: .cancel) {
                                activeSheet = nil
                                newCustomHabitName = ""
                            }
                        }
                    }
                    .navigationTitle("habit_add_custom")
                    .navigationBarTitleDisplayMode(.inline)
                }
            }
        }
        .alert("habit_delete_confirm", isPresented: $showingDeleteAlert) {
            Button("common_cancel", role: .cancel) {
                habitToDelete = nil
            }
            Button("common_delete", role: .destructive) {
                if let id = habitToDelete {
                    appState.removeCustomHabit(id: id)
                    habitToDelete = nil
                }
            }
        }
    }
    
    // habitRow, customHabitRow, timePickerSheet, customTimePickerSheet などはSettingsViewと同じ実装
    // 時刻表示は date.formatted(.dateTime.hour().minute()) を使用（ローカライズ対応）
    
    @ViewBuilder
    private func habitRow(for habit: HabitType, time: DateComponents?) -> some View {
        let isActive = activeHabits.contains(habit)
        let date = time.flatMap { Calendar.current.date(from: $0) }
        
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                Text(habit.title)
                    .font(.headline)
                Text(habit.detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            if isActive, let date = date {
                Text(date.formatted(.dateTime.hour().minute()))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            
            Toggle("", isOn: Binding(
                get: { isActive },
                set: { isOn in
                    if isOn {
                        activeHabits.insert(habit)
                        if let date = date {
                            habitTimes[habit] = date
                        }
                    } else {
                        activeHabits.remove(habit)
                        habitTimes.removeValue(forKey: habit)
                    }
                }
            ))
            .labelsHidden()
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if isActive {
                sheetTime = date ?? Date()
                activeSheet = .habit(habit)
            }
        }
    }
    
    @ViewBuilder
    private func customHabitRow(id: UUID, name: String, time: DateComponents?) -> some View {
        let isActive = activeCustomHabits.contains(id)
        let date = time.flatMap { Calendar.current.date(from: $0) }
        
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                Text(name)
                    .font(.headline)
            }
            
            Spacer()
            
            if isActive, let date = date {
                Text(date.formatted(.dateTime.hour().minute()))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            
            Toggle("", isOn: Binding(
                get: { isActive },
                set: { isOn in
                    if isOn {
                        activeCustomHabits.insert(id)
                        if let date = date {
                            customHabitTimes[id] = date
                        }
                    } else {
                        activeCustomHabits.remove(id)
                        customHabitTimes.removeValue(forKey: id)
                    }
                }
            ))
            .labelsHidden()
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if isActive {
                sheetTime = date ?? Date()
                activeSheet = .custom(id)
            }
        }
    }
    
    @ViewBuilder
    private func timePickerSheet(for habit: HabitType) -> some View {
        NavigationView {
            VStack(spacing: 24) {
                Text(String(format: NSLocalizedString("onboarding_habit_time_title_format", comment: ""), habit.title))
                    .font(.title2)
                    .padding(.top)
                
                DatePicker(
                    String(localized: "common_time"),
                    selection: $sheetTime,
                    displayedComponents: [.hourAndMinute]
                )
                .datePickerStyle(.wheel)
                .labelsHidden()
                // システムロケールに委ねる（固定ロケールは削除）
                
                Spacer()
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "common_cancel")) {
                        activeSheet = nil
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common_save")) {
                        habitTimes[habit] = sheetTime
                        activeHabits.insert(habit)
                        activeSheet = nil
                    }
                }
            }
        }
    }
    
    @ViewBuilder
    private func customTimePickerSheet(for id: UUID) -> some View {
        NavigationView {
            VStack(spacing: 24) {
                Text(String(localized: "onboarding_habit_time_title_format"))
                    .font(.title2)
                    .padding(.top)
                
                DatePicker(
                    String(localized: "common_time"),
                    selection: $sheetTime,
                    displayedComponents: [.hourAndMinute]
                )
                .datePickerStyle(.wheel)
                .labelsHidden()
                // システムロケールに委ねる（固定ロケールは削除）
                
                Spacer()
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "common_cancel")) {
                        activeSheet = nil
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common_save")) {
                        customHabitTimes[id] = sheetTime
                        activeCustomHabits.insert(id)
                        let components = Calendar.current.dateComponents([.hour, .minute], from: sheetTime)
                        appState.updateCustomHabitSchedule(id: id, time: components)
                        activeSheet = nil
                    }
                }
            }
        }
    }
    
    private func addCustomHabit() {
        let trimmed = newCustomHabitName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        
        let config = CustomHabitConfiguration(name: trimmed)
        appState.addCustomHabit(config)
        newCustomHabitName = ""
        activeSheet = nil
    }
}
```

### 9.2 MainTabView.swift（新規・Phase 1へ前倒し）

```swift
// aniccaios/aniccaios/MainTabView.swift

import SwiftUI

struct MainTabView: View {
    @State private var selectedTab = 0
    
    var body: some View {
        TabView(selection: $selectedTab) {
            TalkTabView()
                .tabItem {
                    Label("Talk", systemImage: "message")
                }
                .tag(0)
            
            HabitsTabView()
                .tabItem {
                    Label("Habits", systemImage: "list.bullet")
                }
                .tag(1)
        }
    }
}

// SessionViewをTalkTabViewにリネーム
typealias TalkTabView = SessionView
```

### 9.3 HabitsTabView.swift（新規・Phase 1へ前倒し）

```swift
// aniccaios/aniccaios/Habits/HabitsTabView.swift

import SwiftUI

struct HabitsTabView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showingSettings = false
    
    var body: some View {
        navigationContainer {
            // HabitsSectionViewを表示（習慣セクションのコンポーネントを再利用）
            HabitsSectionView()
                .navigationTitle("習慣管理")
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button(action: { showingSettings = true }) {
                            Image(systemName: "gearshape")
                        }
                    }
                }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView() // Personalizationと理想の姿のみ
                .environmentObject(appState)
        }
    }
    
    // iOS 16以降でNavigationStack、それ以前でNavigationViewを使用
    @ViewBuilder
    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if #available(iOS 16.0, *) {
            NavigationStack {
                content()
            }
        } else {
            NavigationView {
                content()
            }
        }
    }
}
```

### 9.4 ContentRouterView.swiftの更新（Phase 1へ前倒し）

```swift
// aniccaios/aniccaios/ContentRouterView.swift

// ルート表示を MainTabView() に変更
- SessionView()
+ MainTabView()
```

---

## 実装の優先順位（同時実装版）

1. Phase 1（即座に実装）:
   - データモデルの拡張（1.1, 1.2, 1.3） + AppStateの更新（6.1, 6.2）
   - オンボーディングフローの簡略化（2.1, 2.2）
   - 設定画面の改善（3.1, 3.2, 3.3） + 理想の姿設定（8.1, 8.2）
   - 習慣セクションのコンポーネント化（9.1, HabitsSectionView抽出）
   - フォローアップ画面の実装（4.1, 4.2, 4.3）
   - プロンプトの改善（5.1-5.5） + WakePromptBuilderのDI化（5.5）
   - タブナビゲーション導入（9.2, 9.3, 9.4） + ContentRouterView更新

2. Phase 2（後で実装・前倒し後の残タスク）:
   - 将来拡張（例：高度な分析、通知チューニング、A/B実験 など）
   - Phase 1で導入したタブ/習慣UIの追加イテレーション

---

## 注意事項

1. **マイグレーション**: 既存ユーザーのデータを新形式に自動変換
2. **通知管理**: カスタム習慣の追加・削除時に通知スケジュールを更新
3. **時系列ソート**: 時間未設定の習慣は最後に配置
4. **スワイプ削除**: カスタム習慣のみ削除可能（デフォルト習慣は無効化のみ）
5. **トグル配置**: 右端に配置し、Apple時計アプリ風のUIを実現
6. **DateComponentsのCodable対応**: `DateComponents`は`Codable`に準拠していないため、`[String: Int]`形式で保存・読み込み。エラーハンドリングを実装済み
7. **NavigationStack互換性**: iOS 16以降で`NavigationStack`、それ以前で`NavigationView`を使用
8. **HabitTypeのIdentifiable対応**: `sheet(item:)`を使用するために`HabitType`を`Identifiable`に拡張、または`sheet(isPresented:)`を使用
9. **Dictionary拡張**: `compactMapKeys`と`mapKeys`は標準ライブラリにないため、カスタム拡張を追加
10. **UserProfileの後方互換性**: 既存データとの互換性を保つため、カスタムデコーディングを実装
11. **ForEach内の条件分岐回避**: SwiftUIのベストプラクティスに従い、`ForEach`内での条件分岐を避け、事前にフィルタリングしたcomputed propertyを使用
12. **alert内のTextField**: iOS 15以降のAPI。iOS 14以前もサポートする場合は`.sheet`を使用すること
13. **UserDefaults.synchronize()**: iOSでは自動同期されるため非推奨。削除すること
14. **時刻表示のローカライズ**: `String(format:)` ではなく `date.formatted(date: .omitted, time: .shortened)` を使用すること
15. **EditButton**: `.onMove` を使用する場合は `.toolbar { EditButton() }` を追加して編集モードを有効化すること
16. **sheetの一元化**: 複数の `.sheet` を避け、`enum SheetRoute: Identifiable` + `sheet(item:)` で一元管理すること
17. **WakePromptBuilderのDI化**: `AppState.shared` の直接参照を避け、`UserProfile` を引数として依存注入すること
18. **HabitsSectionViewの再利用**: 習慣UIは `HabitsSectionView` を唯一のコンポーネントとして再利用し、重複を作らないこと

## 重要な修正点まとめ

### ✅ 修正済みの項目

1. **DateComponentsのCodable対応**
   - `loadCustomHabitSchedules()`: `[String: [String: Int]]`形式でデコードし、`DateComponents`に変換。エラーハンドリングを追加
   - `saveCustomHabitSchedules()`: `DateComponents`を`[String: Int]`形式に変換してエンコード。エラーハンドリングを追加

2. **Dictionary拡張の追加**
   - `compactMapKeys`: キーを変換し、nilの場合は除外
   - `mapKeys`: キーを変換

3. **HabitTypeのIdentifiable対応**
   - `extension HabitType: Identifiable`を追加
   - または`sheet(isPresented:)`を使用する方法に変更

4. **NavigationStack互換性**
   - iOS 16以降で`NavigationStack`、それ以前で`NavigationView`を使用するヘルパーメソッドを追加

5. **UserProfileの後方互換性**
   - カスタム`init(from decoder:)`を実装し、既存データとの互換性を保証

6. **sheet(item:)の修正**
   - `sheet(item:)`の代わりに`sheet(isPresented:)`を使用する方法に変更（より安全）

7. **ForEach内の条件分岐回避（パフォーマンス改善）**
   - `ForEach`内での`if`文による条件分岐を削除
   - `inactiveDefaultHabits`と`inactiveCustomHabits`をcomputed propertyとして事前にフィルタリング
   - SwiftUIのベストプラクティスに準拠

8. **alert内のTextFieldの互換性注記**
   - iOS 15以降のAPIであることを明記
   - iOS 14以前もサポートする場合の代替案（`.sheet`使用）を記載

---

## レビュー結果に基づく追加修正点

### ❌ 修正が必要な項目

#### 1. alert内のTextFieldの使い方が不正

**問題箇所**: `SettingsView.swift` の908-916行目、`HabitSetupStepView.swift` の572-580行目

**問題**: `alert(_:isPresented:actions:)` の `actions` クロージャ内で `TextField` は使用できません。iOS 15以降でも `TextField` は `alert` の `actions` 内では動作しません。

**修正案**: `.sheet` を使用してください。

```swift
// ❌ 間違い
.alert("habit_add_custom", isPresented: $showingAddCustomHabit) {
    TextField("habit_custom_name_placeholder", text: $newCustomHabitName)
    Button("common_cancel", role: .cancel) { ... }
    Button("common_add") { ... }
}

// ✅ 正しい
.sheet(isPresented: $showingAddCustomHabit) {
    NavigationView {
        Form {
            Section {
                TextField("habit_custom_name_placeholder", text: $newCustomHabitName)
            }
            Section {
                Button("common_add") {
                    addCustomHabit()
                }
                Button("common_cancel", role: .cancel) {
                    showingAddCustomHabit = false
                    newCustomHabitName = ""
                }
            }
        }
        .navigationTitle("habit_add_custom")
        .navigationBarTitleDisplayMode(.inline)
    }
}
```

#### 2. ForEach内のenumerated()の使い方

**問題箇所**: `HabitWakeFollowUpView.swift` の1149行目、`HabitSleepFollowUpView.swift` の1220行目

**問題**: `id: \.offset` は配列変更時にインデックスがずれ、SwiftUIの識別が不正確になる可能性があります。

**修正案**: 各ルーティンにUUIDを付与するか、`id: \.element` を使用してください。

```swift
// ❌ 間違い
ForEach(Array(routines.enumerated()), id: \.offset) { index, routine in
    // ...
}

// ✅ 正しい（方法1: UUIDを付与 - 推奨）
struct RoutineItem: Identifiable {
    let id = UUID()
    var text: String
}

@State private var routines: [RoutineItem] = [
    RoutineItem(text: ""),
    RoutineItem(text: ""),
    RoutineItem(text: "")
]

ForEach(routines) { routine in
    TextField("habit_routine_placeholder", text: Binding(
        get: { routine.text },
        set: { newValue in
            if let index = routines.firstIndex(where: { $0.id == routine.id }) {
                routines[index].text = newValue
            }
        }
    ))
}
.onMove { indices, newOffset in
    routines.move(fromOffsets: indices, toOffset: newOffset)
}

// ✅ 正しい（方法2: id: \.element を使用 - 配列内に重複がない場合のみ）
ForEach(Array(routines.enumerated()), id: \.element) { index, routine in
    // ただし、空文字列が複数ある場合は問題が発生する可能性がある
}
```

#### 3. Arrayのmoveメソッドの実装

**問題箇所**: `Array+Extensions.swift` の304-320行目

**問題**: `destination` が配列の範囲外の場合の処理がありません。

**修正案**: 範囲チェックを追加してください。

```swift
// ❌ 間違い
mutating func move(fromOffsets source: IndexSet, toOffset destination: Int) {
    var itemsToMove = source.map { self[$0] }
    var adjustedDestination = destination
    
    for sourceIndex in source.sorted(by: >) {
        self.remove(at: sourceIndex)
        if sourceIndex < destination {
            adjustedDestination -= 1
        }
    }
    
    for (index, item) in itemsToMove.enumerated() {
        self.insert(item, at: adjustedDestination + index)
    }
}

// ✅ 正しい
mutating func move(fromOffsets source: IndexSet, toOffset destination: Int) {
    guard !source.isEmpty else { return }
    
    // destinationを有効な範囲に制限
    let validDestination = max(0, min(destination, self.count))
    
    var itemsToMove = source.map { self[$0] }
    var adjustedDestination = validDestination
    
    // 後ろから削除することで、インデックスのずれを防ぐ
    for sourceIndex in source.sorted(by: >) {
        self.remove(at: sourceIndex)
        if sourceIndex < validDestination {
            adjustedDestination -= 1
        }
    }
    
    // 新しい位置に挿入
    for (index, item) in itemsToMove.enumerated() {
        self.insert(item, at: adjustedDestination + index)
    }
}
```

#### 4. HabitTrainingFollowUpViewのsave()メソッド

**問題箇所**: `HabitTrainingFollowUpView.swift` の1318-1321行目

**問題**: `selectedOption!` の強制アンラップは避けるべきです。

**修正案**: 安全にアンラップしてください。

```swift
// ❌ 間違い
func save() {
    appState.updateTrainingGoal(trainingGoal)
    appState.updateTrainingFocus(selectedOption != nil ? [selectedOption!] : [])
}

// ✅ 正しい
func save() {
    appState.updateTrainingGoal(trainingGoal)
    if let option = selectedOption {
        appState.updateTrainingFocus([option])
    } else {
        appState.updateTrainingFocus([])
    }
}
```

#### 5. Form内でのonMoveの適用位置

**問題箇所**: `HabitWakeFollowUpView.swift` の1171-1173行目、`HabitSleepFollowUpView.swift` の1242-1244行目

**問題**: `onMove` は `ForEach` に直接適用されていますが、`Form` 内では `List` を使用する必要があります。

**修正案**: `Form` を `List` に変更するか、`List` 内で使用してください。

```swift
// ❌ 間違い
var body: some View {
    Form {
        Section("habit_wake_routines") {
            ForEach(Array(routines.enumerated()), id: \.offset) { index, routine in
                // ...
            }
            .onMove { indices, newOffset in
                routines.move(fromOffsets: indices, toOffset: newOffset)
            }
        }
    }
}

// ✅ 正しい（方法1: Listを使用）
var body: some View {
    List {
        Section("habit_wake_location") {
            TextField("habit_wake_location_placeholder", text: $wakeLocation)
        }
        
        Section("habit_wake_routines") {
            ForEach(Array(routines.enumerated()), id: \.offset) { index, routine in
                // ...
            }
            .onMove { indices, newOffset in
                routines.move(fromOffsets: indices, toOffset: newOffset)
            }
            
            Button(action: { routines.append("") }) {
                // ...
            }
        }
    }
}

// ✅ 正しい（方法2: Formを使い続ける場合は、Listスタイルを適用）
var body: some View {
    Form {
        // ...
    }
    .listStyle(.insetGrouped)
}
```

#### 6. SettingsView: LazyVStackからListへの変更が必要

**問題箇所**: `SettingsView.swift` の `body` プロパティ

**問題**: `swipeActions`は`List`内でのみ動作します。現在のコードベースでは`LazyVStack`を使用していますが、`swipeActions`を使用するには`List`に変更する必要があります。

**修正案**: `ScrollView` + `LazyVStack` を `List` に変更してください。

```swift
// ❌ 間違い（現在のコードベース）
var body: some View {
    NavigationView {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(HabitType.allCases, id: \.self) { habit in
                    habitCard(for: habit)
                }
            }
        }
    }
}

// ✅ 正しい（擬似パッチの修正版）
var body: some View {
    navigationContainer {
        List {
            Section("settings_personalization") {
                TextField("settings_name", text: $displayName)
                Picker("settings_language", selection: $preferredLanguage) {
                    // ...
                }
            }
            
            Section("settings_habits") {
                // デフォルト習慣（時系列順）
                ForEach(sortedHabits, id: \.habit) { item in
                    habitRow(for: item.habit, time: item.time)
                }
                
                // カスタム習慣（時系列順）
                ForEach(sortedCustomHabits, id: \.id) { item in
                    customHabitRow(id: item.id, name: item.name, time: item.time)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                habitToDelete = item.id
                                showingDeleteAlert = true
                            } label: {
                                Label("common_delete", systemImage: "trash")
                            }
                        }
                }
                
                // 「習慣を追加」ボタン
                Button(action: { showingAddCustomHabit = true }) {
                    // ...
                }
            }
        }
        .navigationTitle(String(localized: "settings_title"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
```

**理由**: `swipeActions`は`List`専用のモディファイアです。`LazyVStack`や`ScrollView`内では動作しません。

#### 7. HabitSetupStepView: ScrollView + VStackからListへの変更が必要

**問題箇所**: `HabitSetupStepView.swift` の `body` プロパティ

**問題**: カスタム習慣の削除に`swipeActions`を使用する場合、`ScrollView`内の`VStack`ではなく`List`が必要です。

**修正案**: `ScrollView` + `VStack` を `List` に変更してください。

```swift
// ❌ 間違い（現在の擬似パッチ）
var body: some View {
    VStack(spacing: 24) {
        // ...
        ScrollView {
            VStack(spacing: 16) {
                // デフォルト習慣
                ForEach([HabitType.wake, .training, .bedtime], id: \.self) { habit in
                    habitCard(for: habit, isCustom: false)
                }
                
                // カスタム習慣
                ForEach(appState.customHabits) { customHabit in
                    customHabitCard(for: customHabit)
                    // ← swipeActionsをここに適用したい場合、Listが必要
                }
            }
        }
    }
}

// ✅ 正しい（修正版）
var body: some View {
    VStack(spacing: 24) {
        Text("onboarding_habit_title")
            .font(.title)
            .padding(.top, 40)
        
        Text("onboarding_habit_description")
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal)
        
        List {
            Section {
                // デフォルト習慣
                ForEach([HabitType.wake, .training, .bedtime], id: \.self) { habit in
                    habitCard(for: habit, isCustom: false)
                }
                
                // カスタム習慣
                ForEach(appState.customHabits) { customHabit in
                    customHabitCard(for: customHabit)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                appState.removeCustomHabit(id: customHabit.id)
                            } label: {
                                Label("common_delete", systemImage: "trash")
                            }
                        }
                }
                
                // 「習慣を追加」ボタン
                Button(action: { showingAddCustomHabit = true }) {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text("habit_add_custom")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        
        Spacer()
        
        SUButton(
            // ...
        )
    }
}
```

**理由**: `swipeActions`は`List`専用です。`ScrollView`内では動作しません。

---

## 修正後の実装チェックリスト

- [ ] `SettingsView.swift`: 
  - [ ] `LazyVStack`を`List`に変更
  - [ ] `Section`を使用して構造化
  - [ ] `swipeActions`をカスタム習慣に適用
- [ ] `HabitSetupStepView.swift`: 
  - [ ] `ScrollView` + `VStack`を`List`に変更
  - [ ] `swipeActions`をカスタム習慣に適用（オンボーディング中は削除を許可しない場合は不要）
- [ ] `HabitWakeFollowUpView.swift`: 
  - [ ] `RoutineItem`構造体を追加（UUID付与）
  - [ ] `List`を使用（既に`List`の場合は確認のみ）
  - [ ] `ForEach`のid指定を修正
- [ ] `HabitSleepFollowUpView.swift`: 
  - [ ] `RoutineItem`構造体を追加（UUID付与）
  - [ ] `List`を使用（既に`List`の場合は確認のみ）
  - [ ] `ForEach`のid指定を修正
- [ ] `Array+Extensions.swift`: `move`メソッドに範囲チェックを追加（既に追加済みの場合は確認のみ）
- [ ] `HabitTrainingFollowUpView.swift`: `save()`メソッドの強制アンラップを安全なアンラップに変更（既に修正済みの場合は確認のみ）

---

## 10. ローカライズキーの追加（必須）

以下のローカライズキーを `aniccaios/aniccaios/Resources/en.lproj/Localizable.strings` と `aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings` の両方に追加してください。

### 10.1 英語（en.lproj/Localizable.strings）に追加

```strings
"settings_habits" = "Habits";
"settings_ideal_traits" = "Ideal Traits";
"habit_add_custom" = "Add Habit";
"habit_add_routine" = "Add Routine";
"habit_routine_placeholder" = "Routine";
"habit_wake_location" = "Wake Location";
"habit_wake_location_placeholder" = "e.g., Third-floor bedroom";
"habit_wake_routines" = "Wake Routines";
"habit_sleep_location" = "Sleep Location";
"habit_sleep_location_placeholder" = "e.g., Third-floor bedroom";
"habit_sleep_routines" = "Sleep Routines";
"habit_training_goal" = "Training Goal";
"habit_training_goal_placeholder" = "e.g., 15 reps";
"habit_training_types" = "Training Type";
"habit_delete_confirm" = "Are you sure you want to delete this habit?";
"common_delete" = "Delete";
"common_add" = "Add";
"common_wake_location_fallback" = "Bed";
"settings_contact_support" = "Contact Support";
```

### 10.2 日本語（ja.lproj/Localizable.strings）に追加

```strings
"settings_habits" = "習慣";
"settings_ideal_traits" = "理想の姿";
"habit_add_custom" = "習慣を追加";
"habit_add_routine" = "ルーティンを追加";
"habit_routine_placeholder" = "ルーティン";
"habit_wake_location" = "起床場所";
"habit_wake_location_placeholder" = "例：3階ベッドルーム";
"habit_wake_routines" = "起床後ルーティン";
"habit_sleep_location" = "就寝場所";
"habit_sleep_location_placeholder" = "例：3階ベッドルーム";
"habit_sleep_routines" = "就寝前ルーティン";
"habit_training_goal" = "トレーニング目標";
"habit_training_goal_placeholder" = "例：15回";
"habit_training_types" = "トレーニングの種類";
"habit_delete_confirm" = "この習慣を削除してもよろしいですか？";
"common_delete" = "削除";
"common_add" = "追加";
"common_wake_location_fallback" = "ベッド";
"settings_contact_support" = "サポートに連絡";
```

### 10.3 既存コードの英語固定文字列の修正

`SettingsView.swift` の以下の箇所を修正してください：

```swift
// ❌ 修正前
Link(destination: URL(string: "https://aniccaai.com/support")!) {
    Text("Contact support")
        .font(.footnote)
        .foregroundStyle(.secondary)
}

// ✅ 修正後
Link(destination: URL(string: "https://aniccaai.com/support")!) {
    Text(String(localized: "settings_contact_support"))
        .font(.footnote)
        .foregroundStyle(.secondary)
}
```

---

この計画で実装を進められます。不明点があれば知らせてください。