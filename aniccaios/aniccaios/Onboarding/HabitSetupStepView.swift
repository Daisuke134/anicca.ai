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
                        showingTimePicker = nil
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common_save")) {
                        habitTimes[habit] = sheetTime
                        showingTimePicker = nil
                    }
                }
            }
        }
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

}

extension HabitType: Identifiable {
    public var id: String { rawValue }
}

