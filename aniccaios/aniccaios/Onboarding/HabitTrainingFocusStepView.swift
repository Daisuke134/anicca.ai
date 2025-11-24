import ComponentsKit
import SwiftUI

struct HabitTrainingFocusStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var selectedTrainingFocus: String = ""
    @State private var trainingGoal: String = ""
    @State private var isSaving = false

    private struct TrainingFocusOption: Identifiable {
        let id: String
        let labelKey: LocalizedStringKey
    }

    private let trainingFocusOptions: [TrainingFocusOption] = [
        .init(id: "Push-up", labelKey: "training_focus_option_pushup"),
        .init(id: "Core", labelKey: "training_focus_option_core"),
        .init(id: "Cardio", labelKey: "training_focus_option_cardio"),
        .init(id: "Stretch", labelKey: "training_focus_option_stretch")
    ]

    var body: some View {
        navigationContainer {
            Form {
                // 上に「目標」入力フィールド（KOUJI.md仕様）
                Section(String(localized: "habit_training_goal")) {
                    TextField(String(localized: "habit_training_goal_placeholder"), text: $trainingGoal)
                }
                
                // 下に「トレーニングの種類を選択」（KOUJI.md仕様）
                Section(String(localized: "habit_training_types")) {
                    ForEach(trainingFocusOptions) { option in
                        // トグルスイッチ形式（KOUJI.md仕様）
                        Toggle(isOn: Binding(
                            get: { selectedTrainingFocus == option.id },
                            set: { isOn in
                                if isOn {
                                    // 一つのトグルをONにすると、他のトグルは自動的にOFFになる
                                    selectedTrainingFocus = option.id
                                } else {
                                    // トグルをOFFにする場合は選択をクリア
                                    selectedTrainingFocus = ""
                                }
                            }
                        )) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(option.labelKey)
                                    .font(.body)
                                    .foregroundStyle(.primary)
                                // 説明テキスト（Push-up/Coreは回数、Cardio/Stretchは時間）
                                if option.id == "Push-up" || option.id == "Core" {
                                    Text("回数で計測")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                } else if option.id == "Cardio" || option.id == "Stretch" {
                                    Text("時間で計測")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common_save")) {
                        save()
                    }
                    .disabled(selectedTrainingFocus.isEmpty || isSaving)
                }
            }
            .onAppear {
                // 既存の値を読み込む
                trainingGoal = appState.userProfile.trainingGoal
                selectedTrainingFocus = appState.userProfile.trainingFocus.first ?? ""
            }
        }
    }
    
    // iOS 16以降でNavigationStack、それ以前でNavigationViewを使用
    @ViewBuilder
    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if #available(iOS 16.0, *) {
            NavigationStack {
                content()
            }
        } else {
            NavigationView {
                content()
            }
        }
    }

    private func save() {
        guard !selectedTrainingFocus.isEmpty, !isSaving else { return }
        isSaving = true
        Task {
            appState.updateTrainingGoal(trainingGoal)
            appState.updateTrainingFocus([selectedTrainingFocus])
            await MainActor.run {
                isSaving = false
                next()
            }
        }
    }
}


