import SwiftUI

/// v0.3 Behavior タブ: Today's Insights / 24h Timeline / Highlights / 10 Years From Now
struct BehaviorView: View {
    @State private var isLoading = false
    @State private var summary: BehaviorSummary?
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.md) {
                    header

                    if isLoading {
                        CardView {
                            HStack(spacing: 12) {
                                ProgressView()
                                Text(String(localized: "common_loading"))
                                    .font(AppTheme.Typography.subheadlineDynamic)
                                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            }
                        }
                    }

                    if let errorText = errorText {
                        CardView {
                            VStack(spacing: 12) {
                                Text(errorText)
                                    .font(AppTheme.Typography.subheadlineDynamic)
                                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                                    .multilineTextAlignment(.center)
                                Button(String(localized: "common_retry")) { Task { await load() } }
                                    .font(AppTheme.Typography.subheadlineDynamic)
                            }
                        }
                    }

                    if let summary = summary {
                        insightsCard(text: summary.todayInsight)

                        TimelineView(segments: summary.timeline)

                        HighlightsCard(
                            highlights: summary.highlights,
                            streaks: BehaviorHighlightsStreakStore.shared.streaks(for: summary.highlights)
                        )

                        FutureScenarioView(future: summary.futureScenario)
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, AppTheme.Spacing.md)
            }
            .background(AppBackground())
            .task { await load() }
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Text(String(localized: "behavior_title_today_insights"))
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 12)
        }
    }

    private func insightsCard(text: String) -> some View {
        CardView {
            Text(text)
                .font(AppTheme.Typography.subheadlineDynamic)
                .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
                .multilineTextAlignment(.center)
                .lineSpacing(3)
        }
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorText = nil
        do {
            let data = try await BehaviorSummaryService.shared.fetchSummary()
            summary = data
            BehaviorHighlightsStreakStore.shared.updateIfNeeded(with: data.highlights)
        } catch {
            errorText = String(localized: "behavior_error_failed_load")
        }
        isLoading = false
    }
}

/// v3-ui.md の「🌱ストリーク」を、API(6.1)を変更せずクライアント側で暫定算出するための簡易ストア。
/// - 正式にはサーバー集計が望ましいが、フェーズ6はUI実装が主目的なのでローカル永続で最小限に実装する。
final class BehaviorHighlightsStreakStore {
    static let shared = BehaviorHighlightsStreakStore()
    private init() {}

    private let defaults = UserDefaults.standard
    private let key = "com.anicca.behavior.highlightStreaks"

    struct Streaks: Codable, Equatable {
        var wake: Int
        var screen: Int
        var workout: Int
        var rumination: Int
    }

    /// UI側の3値（v3-ui.md）
    enum UIStatus { case movingForward, stable, needsAttention }

    func streaks(for h: BehaviorSummary.Highlights) -> Streaks {
        (try? load()) ?? Streaks(wake: 0, screen: 0, workout: 0, rumination: 0)
    }

    func updateIfNeeded(with h: BehaviorSummary.Highlights) {
        // NOTE: 日付判定はフェーズ6では省略（開いたタイミングで1回加算される可能性あり）。
        // フェーズ7+で日次集計/タイムゾーン整合を入れる。
        var current = (try? load()) ?? Streaks(wake: 0, screen: 0, workout: 0, rumination: 0)

        current.wake = nextStreak(prev: current.wake, status: mapToUIStatus(h.wake.status))
        current.screen = nextStreak(prev: current.screen, status: mapToUIStatus(h.screen.status))
        current.workout = nextStreak(prev: current.workout, status: mapToUIStatus(h.workout.status))
        current.rumination = nextStreak(prev: current.rumination, status: mapToUIStatus(h.rumination.status))

        save(current)
    }

    private func nextStreak(prev: Int, status: UIStatus) -> Int {
        switch status {
        case .needsAttention:
            return 0
        case .movingForward, .stable:
            return max(1, prev + 1)
        }
    }

    private func mapToUIStatus(_ apiStatus: String) -> UIStatus {
        // migration-patch-v3.md 6.1 の status 値を v3-ui.md の3値へ寄せる
        switch apiStatus {
        case "warning", "missed":
            return .needsAttention
        case "on_track":
            return .movingForward
        case "ok":
            return .stable
        default:
            return .stable
        }
    }

    private func load() throws -> Streaks {
        guard let data = defaults.data(forKey: key) else {
            return Streaks(wake: 0, screen: 0, workout: 0, rumination: 0)
        }
        return try JSONDecoder().decode(Streaks.self, from: data)
    }

    private func save(_ streaks: Streaks) {
        if let data = try? JSONEncoder().encode(streaks) {
            defaults.set(data, forKey: key)
        }
    }
}

