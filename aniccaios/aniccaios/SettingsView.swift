import ComponentsKit
import RevenueCat
import RevenueCatUI
import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @State private var habitTimes: [HabitType: Date] = [:]
    @State private var activeHabits: Set<HabitType> = []
    @State private var showingTimePicker: HabitType?
    @State private var sheetTime = Date()
    @State private var isSaving = false
    @State private var displayName: String = ""
    @State private var preferredLanguage: LanguagePreference = .en
    @State private var sleepLocation: String = ""
    @State private var trainingFocus: String = ""
    @State private var showingCustomerCenter = false
    // ▼▼▼ 忘れずに追加してください ▼▼▼
    @State private var showingPaywall = false
    // ▲▲▲ 追加 ▲▲▲
    @State private var customHabitName: String = AppState.shared.customHabit?.name ?? ""
    @FocusState private var isCustomHabitNameFocused: Bool
    @State private var customHabitValidationError: LocalizedStringKey?

    private struct TrainingFocusOption: Identifiable {
        let id: String
        let label: LocalizedStringKey
    }

    private let trainingFocusOptions: [TrainingFocusOption] = [
        .init(id: "Push-up", label: "training_focus_option_pushup"),
        .init(id: "Core", label: "training_focus_option_core"),
        .init(id: "Cardio", label: "training_focus_option_cardio"),
        .init(id: "Stretch", label: "training_focus_option_stretch")
    ]

    init() {
        // Initialize habitTimes from AppState
        let calendar = Calendar.current
        let schedules = AppState.shared.habitSchedules
        var times: [HabitType: Date] = [:]
        var active: Set<HabitType> = []
        for (habit, components) in schedules {
            if let date = calendar.date(from: components) {
                times[habit] = date
                active.insert(habit)
            }
        }
        _habitTimes = State(initialValue: times)
        _activeHabits = State(initialValue: active)
        _customHabitName = State(initialValue: AppState.shared.customHabit?.name ?? "")
    }

    var body: some View {
        NavigationView {
            ScrollView {
                LazyVStack(spacing: 16) {
                    subscriptionCard
                    // Personalization section
                    personalizationCard
                    
                    // Habits section
                    ForEach(HabitType.allCases, id: \.self) { habit in
                        habitCard(for: habit)
                    }
                    
                    // Sign Out button
                    signOutButton
                }
                .frame(maxWidth: .infinity)
                .padding()
            }
            .contentShape(Rectangle())
            .onTapGesture {
                isCustomHabitNameFocused = false
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
            .sheet(item: $showingTimePicker) { habit in
                timePickerSheet(for: habit)
            }
            .onAppear {
                loadPersonalizationData()
                Task { await SubscriptionManager.shared.syncNow() }
            }
        }
    }
    
    private func loadPersonalizationData() {
        displayName = appState.userProfile.displayName
        preferredLanguage = appState.userProfile.preferredLanguage
        sleepLocation = appState.userProfile.sleepLocation
        trainingFocus = appState.userProfile.trainingFocus.first ?? ""
        customHabitName = appState.customHabit?.name ?? ""
        if let components = appState.habitSchedules[.custom],
           let date = Calendar.current.date(from: components) {
            habitTimes[.custom] = date
            activeHabits.insert(.custom)
        }
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
                    Text("settings_personalization_title")
                        .font(.headline)
                    
                    VStack(alignment: .leading, spacing: 16) {
                        // Name
                        VStack(alignment: .leading, spacing: 4) {
                            Text("settings_name_label")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            TextField(String(localized: "settings_name_placeholder"), text: $displayName)
                                .textFieldStyle(.roundedBorder)
                                .textInputAutocapitalization(.words)
                                .autocorrectionDisabled()
                        }
                        
                        // Language
                        VStack(alignment: .leading, spacing: 4) {
                            Text("settings_language_label")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Picker("Language", selection: $preferredLanguage) {
                                Text(NSLocalizedString("language_preference_ja", comment: "")).tag(LanguagePreference.ja)
                                Text(NSLocalizedString("language_preference_en", comment: "")).tag(LanguagePreference.en)
                            }
                            .pickerStyle(.segmented)
                        }
                        
                        // Sleep Location
                        VStack(alignment: .leading, spacing: 4) {
                            Text("settings_sleep_location_label")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            TextField(String(localized: "settings_sleep_location_placeholder"), text: $sleepLocation)
                                .textFieldStyle(.roundedBorder)
                                .textInputAutocapitalization(.words)
                                .autocorrectionDisabled()
                        }
                        
                        // Training Focus
                        VStack(alignment: .leading, spacing: 4) {
                            Text("settings_training_focus_label")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Picker("settings_training_focus_label", selection: $trainingFocus) {
                                Text("settings_training_focus_none").tag("")
                                ForEach(trainingFocusOptions, id: \.id) { option in
                                    Text(option.label).tag(option.id)
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
            Text("settings_sign_out")
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
        let isActive = activeHabits.contains(habit)
        let isCustomHabit = habit == .custom
        let checkboxBinding = Binding(
            get: { isActive },
            set: { isOn in
                if isOn {
                    activeHabits.insert(habit)
                } else {
                    activeHabits.remove(habit)
                    habitTimes.removeValue(forKey: habit)
                }
            }
        )

        SUCard(
            model: {
                var vm = CardVM()
                vm.isTappable = false
                return vm
            }(),
            content: {
                HStack(spacing: 16) {
                    SUCheckbox(
                        isSelected: Binding(
                            get: { checkboxBinding.wrappedValue },
                            set: { newValue in
                                withAnimation(.linear(duration: 0.08)) {
                                    checkboxBinding.wrappedValue = newValue
                                    if !newValue && habit == .custom {
                                        customHabitValidationError = nil
                                    }
                                }
                            }
                        ),
                        model: {
                            var vm = CheckboxVM()
                            vm.size = .large
                            return vm
                        }()
                    )
                    VStack(alignment: .leading, spacing: 8) {
                        if isCustomHabit {
                            HabitNameField(text: $customHabitName)
                                .focused($isCustomHabitNameFocused)
                                .onChange(of: customHabitName) { _, newValue in
                                    let sanitized = newValue.replacingOccurrences(of: "\n", with: "")
                                    if sanitized != customHabitName { customHabitName = sanitized }
                                    customHabitValidationError = nil
                                }
                        } else {
                            Text(habit.title)
                                .font(.headline)
                            Text(habit.detail)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        if isCustomHabit {
                            Text("settings_custom_card_description")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            if let customHabitValidationError, isActive {
                                Text(customHabitValidationError)
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                            }
                        }
                    }

                    Spacer()

                    if isActive {
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
                                    sheetTime = habitTimes[habit]
                                        ?? Calendar.current.date(from: habit.defaultTime)
                                        ?? Date()
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
            }
        )
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
                .environment(\.locale, Locale(identifier: "en_GB"))

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

    private var timeFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }
    
    private var subscriptionCard: some View {
        SUCard(model: CardVM(), content: {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("settings_subscription_title")
                            .font(.headline)
                        Text(subscriptionSummary)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        if let limit = appState.subscriptionInfo.monthlyUsageLimit,
                           let _ = appState.subscriptionInfo.monthlyUsageRemaining,
                           let count = appState.subscriptionInfo.monthlyUsageCount {
                            Text(String(format: NSLocalizedString("settings_usage_this_month_format", comment: ""), count, limit))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            
                            // 修正: 値がtotalを超えないように min() で制限する
                            ProgressView(value: min(Double(count), Double(limit)), total: Double(limit))
                                .progressViewStyle(.linear)
                        }
                    }
                    Spacer(minLength: 12)
                    Button("settings_subscription_manage") {
                        showingCustomerCenter = true
                    }
                    .buttonStyle(.borderedProminent)
                }
                
                Link(destination: URL(string: "https://aniccaai.com/support")!) {
                    Text("Contact support")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        })
        .frame(maxWidth: .infinity)
        .sheet(isPresented: $showingCustomerCenter, onDismiss: {
            Task { await SubscriptionManager.shared.syncNow() }
        }) {
            RevenueCatUI.CustomerCenterView()
                .onCustomerCenterRestoreFailed { error in
                    // XPCエラー（コード4099）は無視（機能には影響なし）
                    if let nsError = error as NSError?,
                       nsError.domain == "NSCocoaErrorDomain",
                       nsError.code == 4099 {
                        // iOS内部サービスへのアクセス試行エラー（無視してOK）
                        return
                    }
                    // その他のエラーは通常通り処理
                    print("[CustomerCenter] Restore failed: \(error.localizedDescription)")
                }
                .onCustomerCenterRestoreCompleted { customerInfo in
                    // 復元完了時の処理（必要に応じて）
                    print("[CustomerCenter] Restore completed")
                }
                // 管理/変更シート提示はCustomer Center内部に委譲（ここでは何もしない）
        }
        // ▼▼▼ 追加: Paywall用のシート定義 ▼▼▼
        .sheet(isPresented: $showingPaywall) {
            PaywallContainerView(
                onPurchaseCompleted: {
                    showingPaywall = false
                    Task { await SubscriptionManager.shared.syncNow() }
                },
                onDismissRequested: {
                    showingPaywall = false
                }
            )
            .environmentObject(appState) // これがないとクラッシュします！
        }
        // ▲▲▲ 追加終わり ▲▲▲
    }
    
    private var subscriptionSummary: String {
        let info = appState.subscriptionInfo
        guard info.plan != .free else {
            return NSLocalizedString("settings_subscription_free", comment: "")
        }
        return resolvedPlanLabel(for: info)
    }
    
    private func resolvedPlanLabel(for info: SubscriptionInfo) -> String {
        // 常に人間可読。IDは絶対に表示しない
        if let name = info.planDisplayName, !name.isEmpty {
            return name
        }
        if info.productIdentifier == "ai.anicca.app.ios.annual" {
            return NSLocalizedString("subscription_plan_annual", comment: "")
        }
        if info.productIdentifier == "ai.anicca.app.ios.monthly" {
            return NSLocalizedString("subscription_plan_monthly", comment: "")
        }
        return NSLocalizedString("settings_subscription_pro", comment: "")
    }
    
    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }

    private func save() {
        guard !isSaving else { return }

        let trimmedCustomName = customHabitName.trimmingCharacters(in: .whitespacesAndNewlines)
        let isCustomActive = activeHabits.contains(.custom)
        if isCustomActive && trimmedCustomName.isEmpty {
            customHabitValidationError = "habit_custom_name_required"
            isCustomHabitNameFocused = true
            return
        }
        if isCustomActive && habitTimes[.custom] == nil {
            customHabitValidationError = "settings_custom_time_required"
            return
        }

        isSaving = true

        Task {
            let shouldSaveCustom = isCustomActive && habitTimes[.custom] != nil

            // Update habit schedules - only save active habits with times
            var schedules: [HabitType: Date] = [:]
            for habit in activeHabits {
                guard let time = habitTimes[habit] else { continue }
                if habit == .custom && !shouldSaveCustom { continue }
                schedules[habit] = time
            }
            await appState.updateHabits(schedules)
            
            // Update custom habit
            if shouldSaveCustom {
                appState.setCustomHabitName(trimmedCustomName)
            } else {
                appState.clearCustomHabit()
            }
            
            // Update user profile
            var updatedProfile = appState.userProfile
            updatedProfile.displayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            updatedProfile.preferredLanguage = preferredLanguage
            updatedProfile.sleepLocation = sleepLocation.trimmingCharacters(in: .whitespacesAndNewlines)
            updatedProfile.trainingFocus = trainingFocus.isEmpty ? [] : [trainingFocus]
            appState.updateUserProfile(updatedProfile, sync: true)
            
            await MainActor.run {
                isSaving = false
                customHabitValidationError = nil
                dismiss()
            }
        }
    }
}
