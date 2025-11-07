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
    
    private let trainingFocusOptions = ["Push-up", "Core", "Cardio", "Stretch"]

    var body: some View {
        VStack(spacing: 24) {
            Text("Set Your Habits")
                .font(.title)
                .padding(.top, 40)

            Text("Choose which habits you want to build and set their times.")
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
                    vm.title = isSaving ? "Saving…" : "Done"
                    vm.style = .filled
                    vm.size = .large
                    vm.isFullWidth = true
                    vm.isEnabled = !selectedHabits.isEmpty && !isSaving
                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
                    return vm
                }(),
                action: save
            )
            .padding(.horizontal)
            .padding(.bottom)
        }
        .sheet(item: $showingTimePicker) { habit in
            timePickerSheet(for: habit)
        }
    }

    @ViewBuilder
    private func habitCard(for habit: HabitType) -> some View {
        let isSelected = selectedHabits.contains(habit)
        let hasTime = habitTimes[habit] != nil

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
                            VStack(alignment: .leading, spacing: 8) {
                                Text(habit.title)
                                    .font(.headline)
                                Text(habit.detail)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            VStack(alignment: .trailing, spacing: 8) {
                                if isSelected {
                                    if let time = habitTimes[habit] {
                                        Text(timeFormatter.string(from: time))
                                            .font(.headline)
                                            .foregroundStyle(.primary)
                                    } else {
                                        Text("Set Time")
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    }
                                } else {
                                    Text("Not Selected")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }

                                SUButton(
                                    model: {
                                        var vm = ButtonVM()
                                        vm.title = isSelected ? (hasTime ? "Change" : "Set Time") : "Enable"
                                        vm.style = isSelected ? .bordered(.medium) : .filled
                                        vm.size = .small
                                        vm.color = isSelected ? .init(main: .universal(.uiColor(.systemBlue)), contrast: .white) : .init(main: .success, contrast: .white)
                                        return vm
                                    }(),
                                    action: {
                                        let initialTime = habitTimes[habit] ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
                                        sheetTime = initialTime

                                        if isSelected {
                                            showingTimePicker = habit
                                        } else {
                                            selectedHabits.insert(habit)
                                            showingTimePicker = habit
                                        }
                                    }
                                )
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
                Text("Set \(habit.title) Time")
                    .font(.title2)
                    .padding(.top)

                DatePicker(
                    "Time",
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
                    Button("Cancel") {
                        showingTimePicker = nil
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        habitTimes[habit] = sheetTime
                        showingTimePicker = nil
                    }
                }
            }
        }
    }

    private var timeFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter
    }

    private func save() {
        guard !isSaving, !selectedHabits.isEmpty else { return }
        isSaving = true

        Task {
            var schedules: [HabitType: Date] = [:]
            for habit in selectedHabits {
                if let time = habitTimes[habit] {
                    schedules[habit] = time
                } else {
                    // Use default time if not set
                    if let defaultDate = Calendar.current.date(from: habit.defaultTime) {
                        schedules[habit] = defaultDate
                    }
                }
            }

            await appState.updateHabits(schedules)
            
            // Prepare follow-up questions based on selected habits
            appState.prepareHabitFollowUps(selectedHabits: selectedHabits)
            
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

