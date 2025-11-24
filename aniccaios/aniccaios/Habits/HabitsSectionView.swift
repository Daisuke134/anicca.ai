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
            Section(String(localized: "settings_habits")) {
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
                                Label(String(localized: "common_delete"), systemImage: "trash")
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
                                addCustomHabit()
                            }
                            Button(String(localized: "common_cancel"), role: .cancel) {
                                activeSheet = nil
                                newCustomHabitName = ""
                            }
                        }
                    }
                    .navigationTitle(String(localized: "habit_add_custom"))
                    .navigationBarTitleDisplayMode(.inline)
                }
            }
        }
        .alert(String(localized: "habit_delete_confirm"), isPresented: $showingDeleteAlert) {
            Button(String(localized: "common_cancel"), role: .cancel) {
                habitToDelete = nil
            }
            Button(String(localized: "common_delete"), role: .destructive) {
                if let id = habitToDelete {
                    appState.removeCustomHabit(id: id)
                    habitToDelete = nil
                }
            }
        }
        .onAppear {
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
                        let components = Calendar.current.dateComponents([.hour, .minute], from: sheetTime)
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

