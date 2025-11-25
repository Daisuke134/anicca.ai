import ComponentsKit
import SwiftUI

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
    
    // 時系列順にソートされた全習慣（デフォルト習慣とカスタム習慣を統合）
    private var sortedAllHabits: [(id: String, name: String, time: Date?, isCustom: Bool, customId: UUID?)] {
        var allHabits: [(id: String, name: String, time: Date?, isCustom: Bool, customId: UUID?)] = []
        
        // デフォルト習慣を追加
        for habit in [HabitType.wake, .training, .bedtime] {
            // 未選択（Toggle OFF）は時刻nilで末尾に送る
            let time = habitTimes[habit]
            allHabits.append((
                id: habit.rawValue,
                name: habit.title,
                time: time,
                isCustom: false,
                customId: nil
            ))
        }
        
        // カスタム習慣を追加（時刻が設定されていなくても表示）
        for customHabit in appState.customHabits {
            let time = customHabitTimes[customHabit.id]  // nilでも追加
            allHabits.append((
                id: customHabit.id.uuidString,
                name: customHabit.name,
                time: time,
                isCustom: true,
                customId: customHabit.id
            ))
        }
        
        // 時系列順にソート（時刻が早い順、未設定は最後）
        // Dateの基準日差による誤差を排除するため、時・分のみで比較する
        return allHabits.sorted { item1, item2 in
            guard let time1 = item1.time, let time2 = item2.time else {
                // 時刻未設定のものは最後に
                return item1.time != nil
            }
            let cal = Calendar.current
            let c1 = cal.dateComponents([.hour, .minute], from: time1)
            let c2 = cal.dateComponents([.hour, .minute], from: time2)
            let hour1 = c1.hour ?? 0
            let hour2 = c2.hour ?? 0
            let minute1 = c1.minute ?? 0
            let minute2 = c2.minute ?? 0
            return hour1 < hour2 || (hour1 == hour2 && minute1 < minute2)
        }
    }

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
                    // 全習慣を時系列順に表示
                    ForEach(sortedAllHabits, id: \.id) { item in
                        if item.isCustom, let customId = item.customId {
                            customHabitCard(for: appState.customHabits.first(where: { $0.id == customId })!)
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        appState.removeCustomHabit(id: customId)
                                    } label: {
                                        Label(String(localized: "common_delete"), systemImage: "trash")
                                    }
                                }
                        } else if let habit = HabitType(rawValue: item.id) {
                            habitCard(for: habit, isCustom: false)
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
                        TextField(String(localized: "habit_custom_name_placeholder"), text: $newCustomHabitName)
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
        
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                Text(habit.title)
                    .font(.headline)
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
        .contentShape(Rectangle())
        .onTapGesture {
            sheetTime = customHabitTimes[customHabit.id] ?? Date()
            showingCustomTimePicker = customHabit.id
        }
    }
    
    private func addCustomHabit() {
        let trimmed = newCustomHabitName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        
        let config = CustomHabitConfiguration(name: trimmed)
        appState.addCustomHabit(config)
        newCustomHabitName = ""
        showingAddCustomHabit = false
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
                        showingCustomTimePicker = nil
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common_save")) {
                        customHabitTimes[id] = sheetTime
                        showingCustomTimePicker = nil
                    }
                }
            }
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
                // システムロケールに委ねる（固定ロケールは削除）

                Spacer()
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "common_cancel")) {
                        // キャンセルしてもトグル状態は保持
                        showingTimePicker = nil
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common_save")) {
                        habitTimes[habit] = sheetTime
                        // 注意: selectedHabitsには既に含まれている（Toggle ON時に追加済み）
                        showingTimePicker = nil
                    }
                }
            }
        }
    }

    private var canSave: Bool {
        guard !isSaving else { return false }
        
        // 選択されたデフォルト習慣が全て時間設定済みかチェック
        let defaultHabitsHaveTime = selectedHabits.allSatisfy { habitTimes[$0] != nil }
        
        // 時刻が設定されているカスタム習慣のみをチェック
        // （時刻未設定のカスタム習慣は無視）
        let customHabitsWithTime = appState.customHabits.filter { customHabitTimes[$0.id] != nil }
        let customHabitsHaveTime = customHabitsWithTime.isEmpty || customHabitsWithTime.allSatisfy { customHabitTimes[$0.id] != nil }
        
        // 最低1つでも習慣が設定されていればOK
        let hasAtLeastOneHabit = !selectedHabits.isEmpty || !customHabitsWithTime.isEmpty
        
        return hasAtLeastOneHabit && defaultHabitsHaveTime && customHabitsHaveTime
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

}

extension HabitType: Identifiable {
    public var id: String { rawValue }
}

