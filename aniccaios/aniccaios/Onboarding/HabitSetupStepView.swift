import ComponentsKit
import SwiftUI

struct HabitSetupStepView: View {
    let next: () -> Void

    @EnvironmentObject private var appState: AppState
    @State private var selectedHabits: Set<HabitType> = []
    @State private var habitTimes: [HabitType: Date] = [:]
    @State private var sheetTime = Date()
    @State private var showingTimePicker: HabitType?
    @State private var isSaving = false
    @State private var customHabitName: String = AppState.shared.customHabit?.name ?? ""
    @State private var customHabitError: LocalizedStringKey?
    @FocusState private var isCustomHabitNameFocused: Bool

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

            ScrollView {
                VStack(spacing: 16) {
                    ForEach(HabitType.allCases, id: \.self) { habit in
                        habitCard(for: habit)
                    }
                }
                .padding(.horizontal)
            }

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
        .contentShape(Rectangle())
        .onTapGesture {
            isCustomHabitNameFocused = false
        }
        .sheet(item: $showingTimePicker) { habit in
            timePickerSheet(for: habit)
        }
    }

    @ViewBuilder
    private func habitCard(for habit: HabitType) -> some View {
        let isSelected = selectedHabits.contains(habit)
        let hasTime = habitTimes[habit] != nil
        let checkboxBinding = Binding(
            get: { isSelected },
            set: { isOn in
                if isOn {
                    selectedHabits.insert(habit)
                } else {
                    selectedHabits.remove(habit)
                    habitTimes.removeValue(forKey: habit)
                    if habit == .custom {
                        customHabitError = nil
                    }
                }
            }
        )

        VStack(spacing: 12) {
            SUCard(
                model: {
                    var vm = CardVM()
                    vm.isTappable = false
                    return vm
                }(),
                content: {
                    VStack(spacing: 12) {
                        HStack(spacing: 16) {
                            SUCheckbox(
                                isSelected: checkboxBinding,
                                model: {
                                    var vm = CheckboxVM()
                                    vm.size = .large
                                    return vm
                                }()
                            )
                            VStack(alignment: .leading, spacing: 8) {
                                if habit == .custom {
                                    HabitNameField(text: $customHabitName)
                                        .focused($isCustomHabitNameFocused)
                                        .onChange(of: customHabitName) { _, newValue in
                                            let sanitized = newValue.replacingOccurrences(of: "\n", with: "")
                                            if sanitized != customHabitName { customHabitName = sanitized }
                                            customHabitError = nil
                                        }
                                } else {
                                    Text(habit.title)
                                        .font(.headline)
                                    Text(habit.detail)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }

                            Spacer()

                            if isSelected {
                                VStack(alignment: .trailing, spacing: 8) {
                                    if let time = habitTimes[habit] {
                                        Text(timeFormatter.string(from: time))
                                            .font(.headline)
                                    } else {
                                        Text(LocalizedStringKey("common_set_time"))
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    }
                                    SUButton(
                                        model: {
                                            var vm = ButtonVM()
                                            vm.title = hasTime ? String(localized: "common_change") : String(localized: "common_set_time")
                                            vm.style = hasTime ? .bordered(.medium) : .filled
                                            vm.size = .small
                                            vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
                                            return vm
                                        }(),
                                        action: {
                                            sheetTime = habitTimes[habit] ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
                                            showingTimePicker = habit
                                        }
                                    )
                                }
                            } else {
                                Text(LocalizedStringKey("common_not_selected"))
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        if habit == .custom && isSelected {
                            Text("habit_custom_card_description")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            if let customHabitError {
                                Text(customHabitError)
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                            }
                        }
                    }
                }
            )
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
            .navigationBarItems(
                leading: Button(String(localized: "common_cancel")) {
                    showingTimePicker = nil
                },
                trailing: Button(String(localized: "common_save")) {
                    habitTimes[habit] = sheetTime
                    showingTimePicker = nil
                }
            )
        }
    }

    private var timeFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter
    }

    private var canSave: Bool {
        guard !isSaving, !selectedHabits.isEmpty else { return false }
        let allHaveTime = selectedHabits.allSatisfy { habitTimes[$0] != nil }
        guard allHaveTime else { return false }
        if selectedHabits.contains(.custom) {
            return !customHabitName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        return true
    }

    private func save() {
        guard canSave else {
            if selectedHabits.contains(.custom) &&
                customHabitName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                customHabitError = "habit_custom_name_required"
                isCustomHabitNameFocused = true
            }
            return
        }
        isSaving = true

        Task {
            var schedules: [HabitType: Date] = [:]
            for habit in selectedHabits {
                if let time = habitTimes[habit] {
                    schedules[habit] = time
                }
            }

            await appState.updateHabits(schedules)

            if selectedHabits.contains(.custom) {
                appState.setCustomHabitName(customHabitName)
            } else {
                appState.clearCustomHabit()
            }
            
            // Prepare follow-up questions based on selected habits
            appState.prepareHabitFollowUps(selectedHabits: selectedHabits)
            
            await MainActor.run {
                isSaving = false
                customHabitError = nil
                next()
            }
        }
    }

}

extension HabitType: Identifiable {
    public var id: String { rawValue }
}

