import SwiftUI

// Sheetの種類を一元管理
enum SheetRoute: Identifiable {
    case habit(HabitType)
    case custom(UUID)
    case addCustom
    case editor(HabitType) // 統合エディタ
    case customEditor(UUID) // カスタム習慣エディタ
    
    var id: String {
        switch self {
        case .habit(let h): return "habit:\(h.id)"
        case .custom(let id): return "custom:\(id.uuidString)"
        case .addCustom: return "addCustom"
        case .editor(let h): return "editor:\(h.id)"
        case .customEditor(let id): return "customEditor:\(id.uuidString)"
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
    @State private var isAdding = false
    // 削除確認を廃止（即時削除）
    
    // 時系列順にソートされた全習慣（デフォルト習慣とカスタム習慣を統合）
    private var sortedAllHabits: [(id: String, habit: HabitType?, customId: UUID?, name: String, time: DateComponents?, isActive: Bool)] {
        var allHabits: [(id: String, habit: HabitType?, customId: UUID?, name: String, time: DateComponents?, isActive: Bool)] = []
        
        // デフォルト習慣を追加（時刻設定済み）
        for habit in [HabitType.wake, .training, .bedtime] {
            // AppStateから時刻を取得（habitTimesにない場合も含む）
            if let components = appState.habitSchedules[habit],
               let date = Calendar.current.date(from: components) {
                let components = Calendar.current.dateComponents([.hour, .minute], from: date)
                allHabits.append((
                    id: habit.rawValue,
                    habit: habit,
                    customId: nil,
                    name: habit.title,
                    time: components,
                    isActive: activeHabits.contains(habit)
                ))
            } else if let date = habitTimes[habit] {
                // habitTimesから取得（フォールバック）
                let components = Calendar.current.dateComponents([.hour, .minute], from: date)
                allHabits.append((
                    id: habit.rawValue,
                    habit: habit,
                    customId: nil,
                    name: habit.title,
                    time: components,
                    isActive: activeHabits.contains(habit)
                ))
            }
        }
        
        // カスタム習慣を追加（時刻設定済み）
        for customHabit in appState.customHabits {
            // AppStateから時刻を取得（customHabitTimesにない場合も含む）
            if let components = appState.customHabitSchedules[customHabit.id],
               let date = Calendar.current.date(from: components) {
                let components = Calendar.current.dateComponents([.hour, .minute], from: date)
                allHabits.append((
                    id: customHabit.id.uuidString,
                    habit: nil,
                    customId: customHabit.id,
                    name: customHabit.name,
                    time: components,
                    isActive: activeCustomHabits.contains(customHabit.id)
                ))
            } else if let date = customHabitTimes[customHabit.id] {
                // customHabitTimesから取得（フォールバック）
                let components = Calendar.current.dateComponents([.hour, .minute], from: date)
                allHabits.append((
                    id: customHabit.id.uuidString,
                    habit: nil,
                    customId: customHabit.id,
                    name: customHabit.name,
                    time: components,
                    isActive: activeCustomHabits.contains(customHabit.id)
                ))
            }
        }
        
        // 時系列順にソート（時刻が早い順）
        return allHabits.sorted { item1, item2 in
            guard let time1 = item1.time, let time2 = item2.time else {
                // 時刻未設定のものは最後に
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
        // "未設定（時刻が無い）"を非アクティブとして扱う
        [HabitType.wake, .training, .bedtime].filter { habit in
            appState.habitSchedules[habit] == nil && habitTimes[habit] == nil
        }
    }
    
    private var inactiveCustomHabits: [CustomHabitConfiguration] {
        // カスタムも"未設定（時刻が無い）"を非アクティブとして扱う
        appState.customHabits.filter { cfg in
            appState.customHabitSchedules[cfg.id] == nil && customHabitTimes[cfg.id] == nil
        }
    }
    
    var body: some View {
        List {
            Section(String(localized: "settings_habits")) {
                // 全習慣を時系列順に表示（時刻設定済み）
                ForEach(sortedAllHabits, id: \.id) { item in
                    if let habit = item.habit {
                        habitRow(for: habit, time: item.time)
                    } else if let customId = item.customId {
                        customHabitRow(id: customId, name: item.name, time: item.time)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    appState.removeCustomHabit(id: customId)
                                } label: {
                                    Label(String(localized: "common_delete"), systemImage: "trash")
                                }
                            }
                    }
                }
                
                // 時間未設定のデフォルト習慣
                ForEach(inactiveDefaultHabits, id: \.self) { habit in
                    habitRow(for: habit, time: nil)
                }
                
                // 時間未設定のカスタム習慣
                ForEach(inactiveCustomHabits, id: \.id) { habit in
                    customHabitRow(id: habit.id, name: habit.name, time: nil)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                appState.removeCustomHabit(id: habit.id)
                            } label: {
                                Label(String(localized: "common_delete"), systemImage: "trash")
                            }
                        }
                }
                
                // 「習慣を追加」ボタン
                Button(action: { activeSheet = .addCustom }) {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text(String(localized: "habit_add_custom"))
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
                            TextField(String(localized: "habit_custom_name_placeholder"), text: $newCustomHabitName)
                        }
                        Section {
                            Button(String(localized: "common_add")) {
                                guard !isAdding else { return }
                                isAdding = true
                                addCustomHabit()
                                isAdding = false
                            }
                            .disabled(isAdding)
                            Button(String(localized: "common_cancel"), role: .cancel) {
                                activeSheet = nil
                                newCustomHabitName = ""
                            }
                        }
                    }
                    .navigationTitle(String(localized: "habit_add_custom"))
                    .navigationBarTitleDisplayMode(.inline)
                }
            case .editor(let habit):
                HabitEditSheet(habit: habit, onSave: {
                    // 保存後に習慣時刻を再読み込み
                    loadHabitTimes()
                })
                    .environmentObject(appState)
            case .customEditor(let id):
                CustomHabitEditSheet(customId: id) {
                    loadHabitTimes()
                }
                    .environmentObject(appState)
            }
        }
        // 削除確認UIは廃止
        .onAppear {
            loadHabitTimes()
        }
        .onChange(of: appState.habitSchedules) { _ in
            // AppStateのhabitSchedulesが変更されたときに再読み込み
            loadHabitTimes()
        }
        .onChange(of: appState.customHabitSchedules) { _ in
            // AppStateのcustomHabitSchedulesが変更されたときに再読み込み
            loadHabitTimes()
        }
    }
    
    private func loadHabitTimes() {
        let calendar = Calendar.current
        let schedules = appState.habitSchedules
        var times: [HabitType: Date] = [:]
        var active: Set<HabitType> = []
        for (habit, components) in schedules {
            if let date = calendar.date(from: components) {
                times[habit] = date
                active.insert(habit)
            }
        }
        habitTimes = times
        activeHabits = active
        
        // カスタム習慣の時刻を読み込み
        let customSchedules = appState.customHabitSchedules
        var customTimes: [UUID: Date] = [:]
        var activeCustom: Set<UUID> = []
        for (id, components) in customSchedules {
            if let date = calendar.date(from: components) {
                customTimes[id] = date
                activeCustom.insert(id)
            }
        }
        customHabitTimes = customTimes
        activeCustomHabits = activeCustom
    }
    
    @ViewBuilder
    private func habitRow(for habit: HabitType, time: DateComponents?) -> some View {
        let isActive = activeHabits.contains(habit)
        let date = time.flatMap { Calendar.current.date(from: $0) }
        
        HStack {
            // 左側ラベル領域のみタップ可能にして、トグル操作時にシートが開かないようにする
            VStack(alignment: .leading, spacing: 8) {
                Text(habit.title)
                    .font(.headline)
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
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
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
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                // デフォルト習慣の削除＝スケジュールのクリア
                appState.removeHabitSchedule(habit)
                activeHabits.remove(habit)
                habitTimes.removeValue(forKey: habit)
            } label: {
                Label(String(localized: "common_delete"), systemImage: "trash")
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
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
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
    
    @ViewBuilder
    private func timePickerSheet(for habit: HabitType) -> some View {
        NavigationView {
            VStack(spacing: 24) {
                Text(String(localized: "common_set_time"))
                    .font(.title2)
                    .padding(.top)
                
                DatePicker(
                    String(localized: "common_time"),
                    selection: $sheetTime,
                    displayedComponents: [.hourAndMinute]
                )
                .datePickerStyle(.wheel)
                .labelsHidden()
                
                Spacer()
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "common_cancel")) {
                        // Cancel時はトグルをOFFに戻す
                        if !habitTimes.keys.contains(habit) {
                            activeHabits.remove(habit)
                        }
                        activeSheet = nil
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common_save")) {
                        habitTimes[habit] = sheetTime
                        activeHabits.insert(habit)
                        _ = Calendar.current.dateComponents([.hour, .minute], from: sheetTime)
                        Task {
                            await appState.updateHabit(habit, time: sheetTime)
                        }
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
                Text(String(localized: "common_set_time"))
                    .font(.title2)
                    .padding(.top)
                
                DatePicker(
                    String(localized: "common_time"),
                    selection: $sheetTime,
                    displayedComponents: [.hourAndMinute]
                )
                .datePickerStyle(.wheel)
                .labelsHidden()
                
                Spacer()
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "common_cancel")) {
                        // Cancel時はトグルをOFFに戻す
                        if !customHabitTimes.keys.contains(id) {
                            activeCustomHabits.remove(id)
                        }
                        activeSheet = nil
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common_save")) {
                        customHabitTimes[id] = sheetTime
                        appState.updateCustomHabitSchedule(id: id, time: Calendar.current.dateComponents([.hour, .minute], from: sheetTime))
                        activeCustomHabits.insert(id)
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

// 統合エディタ（時刻＋フォローアップ）
struct HabitEditSheet: View {
    @EnvironmentObject private var appState: AppState
    let habit: HabitType
    let onSave: (() -> Void)?
    @State private var time = Date()
    @State private var followups: Int = 2
    @State private var wakeLocation: String = ""
    @State private var sleepLocation: String = ""
    @State private var wakeRoutines: [RoutineItem] = []
    @State private var sleepRoutines: [RoutineItem] = []
    @Environment(\.dismiss) private var dismiss
    
    init(habit: HabitType, onSave: (() -> Void)? = nil) {
        self.habit = habit
        self.onSave = onSave
    }
    
    var body: some View {
        NavigationView {
            Form {
                // Time（全習慣共通）
                Section {
                    DatePicker(String(localized: "common_time"), selection: $time, displayedComponents: [.hourAndMinute])
                }
                
                // Follow-ups（全習慣共通）
                Section(String(localized: "followup_repeats_title")) {
                    Stepper(value: $followups, in: 1...10) {
                        Text("\(followups) \(String(localized: "followup_times_unit"))")
                    }
                    Text(String(localized: "followup_repeats_help"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                
                // Follow-ups（習慣タイプ別）
                switch habit {
                case .wake:
                    // 起床場所
                    Section(String(localized: "habit_wake_location")) {
                        TextField(String(localized: "habit_wake_location_placeholder"), text: $wakeLocation)
                    }
                    // 起床後のルーティン
                    routinesSection(
                        titleKey: "habit_wake_routines",
                        routines: $wakeRoutines
                    )
                    
                case .bedtime:
                    // 就寝場所
                    Section(String(localized: "habit_sleep_location")) {
                        TextField(String(localized: "habit_sleep_location_placeholder"), text: $sleepLocation)
                    }
                    // 就寝前のルーティン
                    routinesSection(
                        titleKey: "habit_sleep_routines",
                        routines: $sleepRoutines
                    )
                    
                case .training:
                    // トレーニング目標と種類（直接実装）
                    trainingSection
                    
                case .custom:
                    EmptyView()
                }
            }
            .navigationTitle(habit.title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common_cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common_save")) {
                        save()
                    }
                }
                // Editボタンは不要のため削除（ドラッグハンドルで順序変更可能）
            }
        }
        .onAppear {
            load()
            followups = appState.followupCount(for: habit)
        }
    }
    
    // トレーニングセクション（目標＋種類選択を直接実装）
    @ViewBuilder
    private var trainingSection: some View {
        // 目標入力フィールド
        Section(String(localized: "habit_training_goal")) {
            TextField(String(localized: "habit_training_goal_placeholder"), text: Binding(
                get: { appState.userProfile.trainingGoal },
                set: { appState.updateTrainingGoal($0) }
            ))
        }
        
        // トレーニング種類選択（トグルスイッチ形式）
        Section(String(localized: "habit_training_types")) {
            let options: [(id: String, labelKey: LocalizedStringKey)] = [
                ("Push-up", "training_focus_option_pushup"),
                ("Core", "training_focus_option_core"),
                ("Cardio", "training_focus_option_cardio"),
                ("Stretch", "training_focus_option_stretch")
            ]
            
            ForEach(options, id: \.id) { option in
                Toggle(isOn: Binding(
                    get: { appState.userProfile.trainingFocus.first == option.id },
                    set: { isOn in
                        if isOn {
                            // 一つのトグルをONにすると、他のトグルは自動的にOFFになる
                            appState.updateTrainingFocus([option.id])
                        } else {
                            // トグルをOFFにする場合は選択をクリア
                            appState.updateTrainingFocus([])
                        }
                    }
                )) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(option.labelKey)
                            .font(.body)
                            .foregroundStyle(.primary)
                        // 説明テキスト
                        if option.id == "Push-up" || option.id == "Core" {
                            Text(String(localized: "training_measure_reps"))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else if option.id == "Cardio" || option.id == "Stretch" {
                            Text(String(localized: "training_measure_time"))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
    
    @ViewBuilder
    private func routinesSection(titleKey: LocalizedStringKey, routines: Binding<[RoutineItem]>) -> some View {
        Section(titleKey) {
            ForEach(routines.wrappedValue) { routine in
                HStack {
                    // ドラッグハンドル（三本線アイコン）
                    Image(systemName: "line.3.horizontal")
                        .foregroundColor(.secondary)
                        .padding(.trailing, 8)
                    
                    if let index = routines.wrappedValue.firstIndex(where: { $0.id == routine.id }) {
                        // ナンバリング
                        Text("\(index + 1).")
                            .frame(width: 30)
                        
                        // テキストフィールド
                        TextField(String(localized: "habit_routine_placeholder"), text: Binding(
                            get: { routines.wrappedValue[index].text },
                            set: { routines.wrappedValue[index].text = $0 }
                        ))
                    }
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        if let index = routines.wrappedValue.firstIndex(where: { $0.id == routine.id }) {
                            routines.wrappedValue.remove(at: index)
                        }
                    } label: {
                        Label(String(localized: "common_delete"), systemImage: "trash")
                    }
                }
            }
            .onMove { indices, newOffset in
                routines.wrappedValue.move(fromOffsets: indices, toOffset: newOffset)
            }
            
            // 「+」ボタンで新しいルーティン項目を追加
            Button(action: {
                routines.wrappedValue.append(RoutineItem(text: ""))
            }) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text(String(localized: "habit_add_routine"))
                }
            }
        }
    }
    
    private func load() {
        // 現在の時刻を読み込む
        if let components = appState.habitSchedules[habit],
           let date = Calendar.current.date(from: components) {
            time = date
        }
        
        // Wake/Sleepの場所とルーティンを読み込む
        switch habit {
        case .wake:
            wakeLocation = appState.userProfile.wakeLocation
            let savedRoutines = appState.userProfile.wakeRoutines
            if savedRoutines.isEmpty {
                wakeRoutines = [
                    RoutineItem(text: ""),
                    RoutineItem(text: ""),
                    RoutineItem(text: "")
                ]
            } else {
                wakeRoutines = savedRoutines.map { RoutineItem(text: $0) }
                if wakeRoutines.count < 3 {
                    wakeRoutines.append(contentsOf: Array(repeating: RoutineItem(text: ""), count: 3 - wakeRoutines.count))
                }
            }
        case .bedtime:
            sleepLocation = appState.userProfile.sleepLocation
            let savedRoutines = appState.userProfile.sleepRoutines
            if savedRoutines.isEmpty {
                sleepRoutines = [
                    RoutineItem(text: ""),
                    RoutineItem(text: ""),
                    RoutineItem(text: "")
                ]
            } else {
                sleepRoutines = savedRoutines.map { RoutineItem(text: $0) }
                if sleepRoutines.count < 3 {
                    sleepRoutines.append(contentsOf: Array(repeating: RoutineItem(text: ""), count: 3 - sleepRoutines.count))
                }
            }
        default:
            break
        }
    }
    
    private func save() {
        // 時刻を保存
        Task {
            await appState.updateHabit(habit, time: time)
            appState.updateFollowupCount(for: habit, count: followups)
            // 保存後にコールバックを呼び出し
            await MainActor.run {
                onSave?()
            }
        }
        
        // Wake/Sleepの場所とルーティンを保存
        switch habit {
        case .wake:
            appState.updateWakeLocation(wakeLocation)
            appState.updateWakeRoutines(wakeRoutines.map { $0.text }.filter { !$0.isEmpty })
        case .bedtime:
            appState.updateSleepLocation(sleepLocation)
            appState.updateSleepRoutines(sleepRoutines.map { $0.text }.filter { !$0.isEmpty })
        case .training:
            // トレーニングの目標と種類は既にAppStateで更新済み（リアルタイム更新）
            break
        default:
            break
        }
        
        dismiss()
    }
}

struct CustomHabitEditSheet: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    let customId: UUID
    let onSave: () -> Void
    @State private var time = Date()
    @State private var followups: Int = 2
    
    var body: some View {
        NavigationView {
            Form {
                Section {
                    DatePicker(String(localized: "common_time"), selection: $time, displayedComponents: [.hourAndMinute])
                }
                Section(String(localized: "followup_repeats_title")) {
                    Stepper(value: $followups, in: 1...10) {
                        Text("\(followups) \(String(localized: "followup_times_unit"))")
                    }
                    Text(String(localized: "followup_repeats_help"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle(appState.customHabits.first(where: { $0.id == customId })?.name ?? String(localized: "habit_title_custom_fallback"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common_cancel")) {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common_save")) {
                        save()
                    }
                }
            }
        }
        .onAppear {
            if let comps = appState.customHabitSchedules[customId],
               let d = Calendar.current.date(from: comps) {
                time = d
            }
            followups = appState.customFollowupCount(for: customId)
        }
    }
    
    private func save() {
        appState.updateCustomHabitSchedule(id: customId, time: Calendar.current.dateComponents([.hour, .minute], from: time))
        appState.updateCustomFollowupCount(id: customId, count: followups)
        Task {
            await MainActor.run {
                onSave()
                dismiss()
            }
        }
    }
}

