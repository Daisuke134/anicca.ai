import SwiftUI

/// My Path タブ - ユーザーが選択した問題（苦しみ）のリストを表示
struct MyPathTabView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedProblem: ProblemType?
    @State private var showAddSheet = false

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
                }
                .padding(.bottom, 100)
            }
            .navigationTitle("My Path")
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
        }
    }

    private var userProblems: [ProblemType] {
        appState.userProfile.struggles.compactMap { ProblemType(rawValue: $0) }
    }

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
