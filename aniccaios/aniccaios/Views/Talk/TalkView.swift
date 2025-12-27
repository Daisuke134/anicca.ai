import SwiftUI
import UIKit

struct TalkView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedTopic: FeelingTopic?

    // v3-ux: 上3つは動的。v0.3 ではまず「固定 + 軽い並べ替え」→ tool/context 導入後に差し替え。
    private var topics: [FeelingTopic] {
        // 最低限: Something else は常に末尾固定
        let base: [FeelingTopic] = [.selfLoathing, .anxiety, .irritation]

        // 既存 UserProfile.problems（例: rumination/self_criticism/anxiety）を軽く反映し、上に寄せる
        // ※厳密な選別は v3 の context_snapshot/mem0 連携後に置き換える（本フェーズではUI要件を満たすための最小実装）
        let problems = Set(appState.userProfile.problems)
        var prioritized: [FeelingTopic] = []
        if problems.contains("self_criticism") || problems.contains("rumination") { prioritized.append(.selfLoathing) }
        if problems.contains("anxiety") { prioritized.append(.anxiety) }
        // irritation は現状 profile からの確定キーが無いので、残り枠で補完

        let merged = (prioritized + base).removingDuplicates()
        return Array(merged.prefix(3)) + [.freeConversation]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.xl) {
                    // v3-ui: タイトルをヘッダとして表示（navigationTitleではなく）
                    Text(String(localized: "talk_nav_title"))
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.label)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.top, AppTheme.Spacing.md)

                    QuoteCard(quote: QuoteProvider.shared.todayQuote())

                    VStack(spacing: AppTheme.Spacing.lg) {
                        ForEach(topics, id: \.self) { topic in
                            Button {
                                selectedTopic = topic
                            } label: {
                                feelingCard(for: topic)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.top, AppTheme.Spacing.lg)
                .padding(.bottom, AppTheme.Spacing.xxl)
            }
            .background(AppBackground())
            .navigationBarTitleDisplayMode(.inline)
            .fullScreenCover(item: $selectedTopic) { topic in
                SessionView(topic: topic)
                    .environmentObject(appState)
            }
        }
    }

    @ViewBuilder
    private func feelingCard(for topic: FeelingTopic) -> some View {
        switch topic {
        case .selfLoathing:
            FeelingCard(
                emoji: "😔",
                title: "talk_feeling_self_loathing_title",
                subtitle: "talk_feeling_self_loathing_subtitle"
            )
        case .anxiety:
            FeelingCard(
                emoji: "😨",
                title: "talk_feeling_anxiety_title",
                subtitle: "talk_feeling_anxiety_subtitle"
            )
        case .irritation:
            FeelingCard(
                emoji: "😡",
                title: "talk_feeling_irritation_title",
                subtitle: "talk_feeling_irritation_subtitle"
            )
        case .freeConversation:
            FeelingCard(
                emoji: "💬",
                title: "talk_feeling_something_else_title",
                subtitle: "talk_feeling_something_else_subtitle"
            )
        }
    }
}

private extension Array where Element: Hashable {
    func removingDuplicates() -> [Element] {
        var seen = Set<Element>()
        return self.filter { seen.insert($0).inserted }
    }
}



