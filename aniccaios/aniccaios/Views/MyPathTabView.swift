import SwiftUI
import RevenueCat
import RevenueCatUI

/// My Path タブ - ユーザーが選択した問題（苦しみ）のリストを表示
struct MyPathTabView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedProblem: ProblemType?
    @State private var showAddSheet = false
    @State private var showSignOutConfirm = false
    @State private var showDeleteAccountConfirm = false
    @State private var isDeletingAccount = false
    @State private var deleteAccountError: Error?
    @State private var showingManageSubscription = false
    #if DEBUG
    @State private var showLLMCacheEmptyAlert = false
    #endif

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // ヘッダー説明
                    Text(String(localized: "mypath_header_description"))
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 20)
                        .padding(.top, 8)

                    // 今向き合っている課題セクション
                    VStack(alignment: .leading, spacing: 12) {
                        Text(String(localized: "mypath_section_current_struggles"))
                            .font(.headline)
                            .foregroundStyle(AppTheme.Colors.label)
                            .padding(.horizontal, 20)

                        if userProblems.isEmpty {
                            emptyStateView
                        } else {
                            LazyVStack(spacing: 12) {
                                ForEach(userProblems, id: \.self) { problem in
                                    ProblemCardView(
                                        problem: problem,
                                        onTap: {
                                            selectedProblem = problem
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    }

                    // Tell Anicca セクション
                    VStack(alignment: .leading, spacing: 12) {
                        Text(String(localized: "mypath_section_tell_anicca"))
                            .font(.headline)
                            .foregroundStyle(AppTheme.Colors.label)
                            .padding(.horizontal, 20)

                        VStack(spacing: 12) {
                            TellAniccaCard(
                                title: String(localized: "mypath_tell_struggling_with"),
                                icon: "✏️",
                                memoryStore: MemoryStore.shared,
                                problemType: nil
                            )
                            TellAniccaCard(
                                title: String(localized: "mypath_tell_my_goal_is"),
                                icon: "🎯",
                                memoryStore: MemoryStore.shared,
                                problemType: nil
                            )
                            TellAniccaCard(
                                title: String(localized: "mypath_tell_remember_that"),
                                icon: "💭",
                                memoryStore: MemoryStore.shared,
                                problemType: nil
                            )
                        }
                        .padding(.horizontal, 16)
                    }

                    // Subscription セクション
                    subscriptionSection
                        .padding(.horizontal, 16)
                        .padding(.top, 24)

                    // Account セクション（サインイン時のみ）
                    if appState.isSignedIn {
                        accountSection
                            .padding(.horizontal, 16)
                            .padding(.top, 8)
                    }

                    // Legal Links (Footer)
                    LegalLinksView()
                        .padding(.top, 24)

                    // DEBUG: テスト状態注入UI
                    #if DEBUG
                    debugStateInjectionSection
                        .padding(.top, 24)
                    #endif
                }
                .padding(.bottom, 0)
            }
            .navigationTitle(String(localized: "tab_mypath"))
            .background(AppBackground())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { showAddSheet = true }) {
                        Image(systemName: "plus")
                            .foregroundStyle(AppTheme.Colors.buttonSelected)
                    }
                }
            }
            .sheet(isPresented: $showAddSheet) {
                AddProblemSheetView()
                    .environmentObject(appState)
            }
            .sheet(item: $selectedProblem) { problem in
                DeepDiveSheetView(problem: problem)
                    .environmentObject(appState)
            }
            .alert(String(localized: "common_error"), isPresented: Binding(
                get: { deleteAccountError != nil },
                set: { if !$0 { deleteAccountError = nil } }
            )) {
                Button(String(localized: "common_ok")) { deleteAccountError = nil }
            } message: {
                if let error = deleteAccountError { Text(error.localizedDescription) }
            }
        }
    }

    private var userProblems: [ProblemType] {
        appState.userProfile.struggles.compactMap { ProblemType(rawValue: $0) }
    }

    // MARK: - Subscription Section

    @ViewBuilder
    private var subscriptionSection: some View {
        if appState.subscriptionInfo.plan == .free {
            // Free: セカンダリボタン（Upgrade to Pro）
            Button {
                SuperwallManager.shared.register(placement: SuperwallPlacement.profilePlanTap.rawValue)
            } label: {
                Text(String(localized: "single_screen_subscribe"))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(AppTheme.Colors.buttonSelected)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)  // 44pt タップエリア確保
                    .background(AppTheme.Colors.buttonUnselected)
                    .clipShape(Capsule())
            }
        } else {
            // Pro: セカンダリボタン（Manage Subscription）
            Button {
                showingManageSubscription = true
            } label: {
                Text(String(localized: "single_screen_cancel_subscription"))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(AppTheme.Colors.buttonSelected)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)  // 44pt タップエリア確保
                    .background(AppTheme.Colors.buttonUnselected)
                    .clipShape(Capsule())
            }
            .sheet(isPresented: $showingManageSubscription) {
                customerCenterContent
            }
        }
    }

    // MARK: - Account Section

    @ViewBuilder
    private var accountSection: some View {
        VStack(spacing: 16) {
            // Sign Out: テキストリンク風（グレー）
            Button {
                showSignOutConfirm = true
            } label: {
                Text(String(localized: "single_screen_sign_out"))
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .frame(minHeight: 44)  // 44pt タップエリア確保
            }
            .alert(String(localized: "sign_out_confirm_title"), isPresented: $showSignOutConfirm) {
                Button(String(localized: "common_cancel"), role: .cancel) { }
                Button(String(localized: "single_screen_sign_out"), role: .destructive) {
                    signOut()
                }
            } message: {
                Text(String(localized: "sign_out_confirm_message"))
            }

            // Delete Account: テキストリンク風（システム赤）
            Button {
                showDeleteAccountConfirm = true
            } label: {
                Text(String(localized: "single_screen_delete_account"))
                    .font(.subheadline)
                    .foregroundStyle(Color(.systemRed))  // ダークモード対応
                    .frame(minHeight: 44)  // 44pt タップエリア確保
            }
            .alert(String(localized: "delete_account_confirm_title"), isPresented: $showDeleteAccountConfirm) {
                Button(String(localized: "common_cancel"), role: .cancel) { }
                Button(String(localized: "single_screen_delete_account"), role: .destructive) {
                    deleteAccount()
                }
            } message: {
                Text(String(localized: "delete_account_confirm_message"))
            }
        }
    }

    // MARK: - Customer Center

    @ViewBuilder
    private var customerCenterContent: some View {
        RevenueCatUI.CustomerCenterView()
            .onCustomerCenterRestoreCompleted { customerInfo in
                Task {
                    let subscription = SubscriptionInfo(info: customerInfo)
                    await MainActor.run { appState.updateSubscriptionInfo(subscription) }
                }
            }
    }

    // MARK: - Actions

    private func signOut() {
        appState.signOutPreservingSensorAccess()
    }

    private func deleteAccount() {
        Task {
            isDeletingAccount = true
            deleteAccountError = nil
            defer { isDeletingAccount = false }

            guard case .signedIn(let credentials) = appState.authStatus else {
                await MainActor.run {
                    deleteAccountError = NSError(domain: "AccountDeletionError", code: 1, userInfo: [NSLocalizedDescriptionKey: "Not signed in"])
                }
                return
            }

            var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("mobile/account"))
            request.httpMethod = "DELETE"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
            request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
            try? await NetworkSessionManager.shared.setAuthHeaders(for: &request)

            do {
                let (_, response) = try await NetworkSessionManager.shared.session.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw NSError(domain: "AccountDeletionError", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
                }
                if httpResponse.statusCode == 204 {
                    await SubscriptionManager.shared.handleLogout()
                    await MainActor.run { appState.signOutAndWipe() }
                } else {
                    throw NSError(domain: "AccountDeletionError", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Server error: \(httpResponse.statusCode)"])
                }
            } catch {
                await MainActor.run { deleteAccountError = error }
            }
        }
    }

    // MARK: - DEBUG State Injection

    #if DEBUG
    @ViewBuilder
    private var debugStateInjectionSection: some View {
        VStack(spacing: 12) {
            Text("DEBUG: State Injection")
                .font(.caption)
                .foregroundStyle(.gray)

            Button {
                let testCredentials = UserCredentials(
                    userId: "test-user-id-\(UUID().uuidString.prefix(8))",
                    displayName: "Test User",
                    email: "test@example.com",
                    jwtAccessToken: nil
                )
                appState.setAuthStatus(.signedIn(testCredentials))
            } label: {
                Text("Set Signed In")
                    .font(.subheadline)
                    .foregroundStyle(.blue)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.blue.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .accessibilityIdentifier("debug_set_signed_in")

            Button {
                let proInfo = SubscriptionInfo(
                    plan: .pro,
                    status: "active",
                    currentPeriodEnd: Date().addingTimeInterval(86400 * 30),
                    managementURL: nil,
                    lastSyncedAt: .now,
                    productIdentifier: nil,
                    planDisplayName: "Pro",
                    priceDescription: nil,
                    monthlyUsageLimit: nil,
                    monthlyUsageRemaining: nil,
                    monthlyUsageCount: nil,
                    willRenew: true
                )
                appState.updateSubscriptionInfo(proInfo)
            } label: {
                Text("Set Pro Plan")
                    .font(.subheadline)
                    .foregroundStyle(.purple)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.purple.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .accessibilityIdentifier("debug_set_pro")

            Button {
                appState.setAuthStatus(.signedOut)
                appState.updateSubscriptionInfo(.free)
            } label: {
                Text("Reset to Free + Signed Out")
                    .font(.subheadline)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .accessibilityIdentifier("debug_reset_state")

            Divider()
                .padding(.vertical, 8)

            Text("DEBUG: Nudge Test Buttons")
                .font(.caption)
                .foregroundStyle(.gray)

            LazyVStack(spacing: 8) {
                ForEach(ProblemType.allCases, id: \.self) { problemType in
                    Button {
                        let content = NudgeContent.contentForToday(for: problemType)
                        appState.pendingNudgeCard = content
                    } label: {
                        HStack {
                            Text(problemType.icon)
                            Text(problemType.displayName)
                                .font(.subheadline)
                                .foregroundStyle(.blue)
                            Spacer()
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .background(Color.blue.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .accessibilityIdentifier("debug-nudge-test-\(problemType.rawValue)")
                }
            }

            Divider()
                .padding(.vertical, 8)

            Text("DEBUG: LLM Nudge Test")
                .font(.caption)
                .foregroundStyle(.gray)

            Button {
                if let realNudge = LLMNudgeCache.shared.getFirstNudge() {
                    let content = NudgeContent.content(from: realNudge)
                    appState.pendingNudgeCard = content
                } else {
                    showLLMCacheEmptyAlert = true
                }
            } label: {
                HStack {
                    Text("🤖")
                    Text("Show LLM Nudge (real data)")
                        .font(.subheadline)
                        .foregroundStyle(.green)
                    Spacer()
                    Text("\(LLMNudgeCache.shared.count)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Circle()
                        .fill(Color.blue.opacity(0.6))
                        .frame(width: 6, height: 6)
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
                .background(Color.green.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .accessibilityIdentifier("debug-nudge-test-llm")
            .alert("LLM Cache Empty", isPresented: $showLLMCacheEmptyAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("LLM Nudge がまだ取得されていません。アプリ起動時に自動フェッチされます。")
            }

            NavigationLink {
                LLMNudgeDebugView()
            } label: {
                HStack {
                    Text("📋")
                    Text("Nudge Cache List")
                        .font(.subheadline)
                        .foregroundStyle(.orange)
                    Spacer()
                    Text("\(LLMNudgeCache.shared.count) cached")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
                .background(Color.orange.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .accessibilityIdentifier("debug-nudge-cache-list")
        }
        .padding(.horizontal, 16)
    }
    #endif

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "leaf.fill")
                .font(.system(size: 48))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)

            Text(String(localized: "mypath_empty_title"))
                .font(.headline)
                .foregroundStyle(AppTheme.Colors.label)

            PrimaryButton(
                title: String(localized: "mypath_empty_action"),
                style: .primary
            ) {
                showAddSheet = true
            }
            .padding(.horizontal, 40)
        }
        .padding(40)
    }
}

// MARK: - ProblemCardView
struct ProblemCardView: View {
    let problem: ProblemType
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Text(problem.icon)
                    .font(.system(size: 32))

                Text(problem.displayName)
                    .font(.headline)
                    .foregroundStyle(AppTheme.Colors.label)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            .padding(16)
            .background(AppTheme.Colors.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - TellAniccaCard
struct TellAniccaCard: View {
    let title: String
    let icon: String
    @ObservedObject var memoryStore: MemoryStore
    let problemType: ProblemType?
    @State private var showSheet = false

    var body: some View {
        Button(action: { showSheet = true }) {
            HStack(spacing: 12) {
                Text(icon)
                    .font(.system(size: 24))

                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.Colors.label)
                    .multilineTextAlignment(.leading)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            .padding(16)
            .background(AppTheme.Colors.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showSheet) {
            TellAniccaSheetView(
                title: title,
                icon: icon,
                problemType: problemType
            )
        }
    }
}

// MARK: - TellAniccaSheetView
struct TellAniccaSheetView: View {
    let title: String
    let icon: String
    let problemType: ProblemType?
    @Environment(\.dismiss) private var dismiss
    @StateObject private var memoryStore = MemoryStore.shared
    @State private var text: String = ""
    @State private var showSaved = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if showSaved {
                    savedView
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(title)
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(AppTheme.Colors.label)

                        TextEditor(text: $text)
                            .frame(minHeight: 200)
                            .padding(12)
                            .background(AppTheme.Colors.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(AppTheme.Colors.border, lineWidth: 1)
                            )

                        PrimaryButton(
                            title: String(localized: "common_save"),
                            style: .primary
                        ) {
                            saveMemory()
                        }
                    }
                    .padding(20)
                }
            }
            .background(AppBackground())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    }
                }
            }
            .onAppear {
                if let problemType = problemType {
                    text = memoryStore.memory(for: problemType)?.text ?? ""
                }
            }
        }
    }

    private var savedView: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(AppTheme.Colors.buttonSelected)

            Text(String(localized: "mypath_tell_saved"))
                .font(.title2.weight(.semibold))
                .foregroundStyle(AppTheme.Colors.label)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                dismiss()
            }
        }
    }

    private func saveMemory() {
        if let problemType = problemType {
            memoryStore.save(text: text, for: problemType)
        }
        showSaved = true
    }
}

// MARK: - DeepDiveSheetView
struct DeepDiveSheetView: View {
    let problem: ProblemType
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @StateObject private var memoryStore = MemoryStore.shared
    @State private var selectedAnswers: [String: Set<String>] = [:]
    @State private var memoryText: String = ""
    @State private var showDeleteAlert = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // ヘッダー
                    VStack(alignment: .center, spacing: 12) {
                        Text(problem.icon)
                            .font(.system(size: 48))

                        Text(problem.displayName)
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(AppTheme.Colors.label)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 16)

                    Divider()
                        .padding(.horizontal, 20)

                    // 共通質問: どのくらい前からこの問題がある？
                    questionSection(question: DeepDiveQuestionsData.commonDurationQuestion)

                    // 問題固有の質問
                    ForEach(Array(DeepDiveQuestionsData.questions(for: problem).enumerated()), id: \.offset) { index, questionData in
                        questionSection(question: questionData, questionIndex: index)
                    }

                    // Tell Anicca セクション
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text(String(localized: "deep_dive_tell_anicca_title"))
                                .font(.headline)
                                .foregroundStyle(AppTheme.Colors.label)
                            Spacer()
                            if !memoryText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Button(action: saveMemory) {
                                    Text(String(localized: "common_save"))
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(AppTheme.Colors.buttonSelected)
                                }
                            }
                        }

                        Text(String(localized: "deep_dive_tell_anicca_subtitle"))
                            .font(.caption)
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)

                        TextEditor(text: $memoryText)
                            .frame(minHeight: 100)
                            .padding(12)
                            .background(AppTheme.Colors.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 24)

                    // 保存ボタン
                    PrimaryButton(
                        title: String(localized: "mypath_deepdive_save"),
                        style: .primary
                    ) {
                        saveAnswers()
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 24)

                    Divider()
                        .padding(.horizontal, 20)
                        .padding(.top, 24)

                    // 削除ボタン
                    Button(role: .destructive, action: { showDeleteAlert = true }) {
                        HStack {
                            Image(systemName: "trash")
                            Text(String(localized: "mypath_deepdive_delete"))
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.red)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .alert(String(localized: "mypath_deepdive_delete_confirm_title"), isPresented: $showDeleteAlert) {
                        Button(String(localized: "common_cancel"), role: .cancel) { }
                        Button(String(localized: "common_delete"), role: .destructive) {
                            deleteProblem()
                        }
                    } message: {
                        Text(String(localized: "mypath_deepdive_delete_confirm_message"))
                    }
                }
                .padding(.bottom, 40)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    }
                }
            }
            .background(AppBackground())
            .onAppear {
                memoryText = memoryStore.memory(for: problem)?.text ?? ""
                // 既存の回答を読み込む
                let details = appState.userProfile.problemDetails
                // 共通質問の回答
                if let commonAnswers = details["common_duration"] {
                    selectedAnswers[DeepDiveQuestionsData.commonDurationQuestion.questionKey] = Set(commonAnswers)
                }
                // 問題固有の質問の回答
                for questionData in DeepDiveQuestionsData.questions(for: problem) {
                    if let answers = details[questionData.questionKey] {
                        selectedAnswers[questionData.questionKey] = Set(answers)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func questionSection(question: DeepDiveQuestion, questionIndex: Int? = nil) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: String.LocalizationValue(stringLiteral: question.questionKey)))
                .font(.headline)
                .foregroundStyle(AppTheme.Colors.label)

            FlowLayout(spacing: 12) {
                ForEach(question.optionKeys, id: \.self) { optionKey in
                    let questionKey = question.questionKey
                    let isSelected = selectedAnswers[questionKey]?.contains(optionKey) ?? false
                    Button {
                        if selectedAnswers[questionKey] == nil {
                            selectedAnswers[questionKey] = []
                        }
                        // Duration質問（共通質問）は単一選択
                        let isDurationQuestion = question.questionKey == DeepDiveQuestionsData.commonDurationQuestion.questionKey
                        if isDurationQuestion {
                            selectedAnswers[questionKey] = [optionKey]
                        } else {
                            if isSelected {
                                selectedAnswers[questionKey]?.remove(optionKey)
                            } else {
                                selectedAnswers[questionKey]?.insert(optionKey)
                            }
                        }
                    } label: {
                        Text(String(localized: String.LocalizationValue(stringLiteral: optionKey)))
                            .font(.system(size: 16, weight: .medium))
                            .fixedSize(horizontal: true, vertical: false)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 14)
                            .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
                            .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.label)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 20)
    }

    private func saveAnswers() {
        var profile = appState.userProfile
        // 選択した回答をproblemDetailsに保存
        var details: [String: [String]] = profile.problemDetails
        // 共通質問の回答
        if let commonAnswers = selectedAnswers[DeepDiveQuestionsData.commonDurationQuestion.questionKey] {
            details["common_duration"] = Array(commonAnswers)
        }
        // 問題固有の質問の回答
        for questionData in DeepDiveQuestionsData.questions(for: problem) {
            if let answers = selectedAnswers[questionData.questionKey] {
                details[questionData.questionKey] = Array(answers)
            }
        }
        profile.problemDetails = details
        appState.updateUserProfile(profile, sync: true)
        dismiss()
    }

    private func saveMemory() {
        memoryStore.save(text: memoryText, for: problem)
    }

    private func deleteProblem() {
        var profile = appState.userProfile
        profile.problems.removeAll { $0 == problem.rawValue }
        appState.updateUserProfile(profile, sync: true)

        Task {
            await ProblemNotificationScheduler.shared.cancelAllNotifications()
            await ProblemNotificationScheduler.shared.scheduleNotifications(for: profile.problems)
        }
        dismiss()
    }
}


// MARK: - ProblemType Identifiable
extension ProblemType: Identifiable {
    var id: String { rawValue }
}

#Preview {
    MyPathTabView()
        .environmentObject(AppState.shared)
}
