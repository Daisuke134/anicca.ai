import ComponentsKit
import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @State private var habitTimes: [HabitType: Date] = [:]
    @State private var showingTimePicker: HabitType?
    @State private var isSaving = false
    @State private var displayName: String = ""
    @State private var preferredLanguage: LanguagePreference = .en
    @State private var sleepLocation: String = ""
    @State private var trainingFocus: String = ""

    private let trainingFocusOptions = ["Push-up", "Core", "Cardio", "Stretch"]

    init() {
        // Initialize habitTimes from AppState
        let calendar = Calendar.current
        let schedules = AppState.shared.habitSchedules
        var times: [HabitType: Date] = [:]
        for (habit, components) in schedules {
            if let date = calendar.date(from: components) {
                times[habit] = date
            }
        }
        _habitTimes = State(initialValue: times)
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 16) {
                    // Personalization section
                    personalizationCard
                    
                    // Habits section
                    ForEach(HabitType.allCases, id: \.self) { habit in
                        habitCard(for: habit)
                    }
                    
                    // Sign Out button
                    signOutButton
                }
                .padding()
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        save()
                    }
                    .disabled(isSaving)
                }
            }
            .sheet(item: $showingTimePicker) { habit in
                timePickerSheet(for: habit)
            }
            .onAppear {
                loadPersonalizationData()
            }
        }
    }
    
    private func loadPersonalizationData() {
        displayName = appState.userProfile.displayName
        preferredLanguage = appState.userProfile.preferredLanguage
        sleepLocation = appState.userProfile.sleepLocation
        trainingFocus = appState.userProfile.trainingFocus.first ?? ""
    }
    
    private var personalizationCard: some View {
        SUCard(
            model: {
                var vm = CardVM()
                vm.isTappable = false
                return vm
            }(),
            content: {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Personalization")
                        .font(.headline)
                    
                    VStack(alignment: .leading, spacing: 16) {
                        // Name
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Name")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            TextField("John", text: $displayName)
                                .textFieldStyle(.roundedBorder)
                                .textInputAutocapitalization(.words)
                                .autocorrectionDisabled()
                        }
                        
                        // Language
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Language")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Picker("Language", selection: $preferredLanguage) {
                                Text("日本語").tag(LanguagePreference.ja)
                                Text("English").tag(LanguagePreference.en)
                            }
                            .pickerStyle(.segmented)
                        }
                        
                        // Sleep Location
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Sleep Location")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            TextField("Third-floor bedroom", text: $sleepLocation)
                                .textFieldStyle(.roundedBorder)
                                .textInputAutocapitalization(.words)
                                .autocorrectionDisabled()
                        }
                        
                        // Training Focus
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Training Focus")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Picker("Training Focus", selection: $trainingFocus) {
                                Text("None").tag("")
                                ForEach(trainingFocusOptions, id: \.self) { option in
                                    Text(option).tag(option)
                                }
                            }
                            .pickerStyle(.menu)
                        }
                    }
                }
            }
        )
    }
    
    private var signOutButton: some View {
        Button(action: {
            AuthCoordinator.shared.signOut()
            dismiss()
        }) {
            Text("Sign Out")
                .frame(maxWidth: .infinity)
                .padding()
                .foregroundStyle(.red)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.red.opacity(0.1))
                )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func habitCard(for habit: HabitType) -> some View {
        let hasTime = habitTimes[habit] != nil
        let isEnabled = appState.habitSchedules[habit] != nil

        SUCard(
            model: {
                var vm = CardVM()
                vm.isTappable = false
                return vm
            }(),
            content: {
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
                        if isEnabled, let time = habitTimes[habit] {
                            Text(timeFormatter.string(from: time))
                                .font(.headline)
                                .foregroundStyle(.primary)
                        } else {
                            Text("Not Set")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        SUButton(
                            model: {
                                var vm = ButtonVM()
                                vm.title = isEnabled ? (hasTime ? "Change" : "Set Time") : "Enable"
                                vm.style = isEnabled ? .bordered(.medium) : .filled
                                vm.size = .small
                                vm.color = isEnabled ? .init(main: .universal(.uiColor(.systemBlue)), contrast: .white) : .init(main: .success, contrast: .white)
                                return vm
                            }(),
                            action: {
                                if !isEnabled {
                                    // Enable this habit
                                    let defaultDate = Calendar.current.date(from: habit.defaultTime) ?? Date()
                                    habitTimes[habit] = defaultDate
                                }
                                showingTimePicker = habit
                            }
                        )
                    }
                }
            }
        )
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
                    selection: Binding(
                        get: {
                            habitTimes[habit] ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
                        },
                        set: { newValue in
                            habitTimes[habit] = newValue
                        }
                    ),
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
        guard !isSaving else { return }
        isSaving = true

        Task {
            // Update habit schedules
            var schedules: [HabitType: Date] = [:]
            for (habit, time) in habitTimes {
                schedules[habit] = time
            }
            await appState.updateHabits(schedules)
            
            // Update user profile
            var updatedProfile = appState.userProfile
            updatedProfile.displayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            updatedProfile.preferredLanguage = preferredLanguage
            updatedProfile.sleepLocation = sleepLocation.trimmingCharacters(in: .whitespacesAndNewlines)
            updatedProfile.trainingFocus = trainingFocus.isEmpty ? [] : [trainingFocus]
            appState.updateUserProfile(updatedProfile, sync: true)
            
            await MainActor.run {
                isSaving = false
                dismiss()
            }
        }
    }
}
