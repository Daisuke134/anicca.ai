import SwiftUI
import DeviceActivity
import os

/// v0.3 Behavior タブ: Today's Insights / 24h Timeline / Highlights / 10 Years From Now
struct BehaviorView: View {
    @EnvironmentObject private var appState: AppState
    @State private var isLoading = false
    @State private var summary: BehaviorSummary?
    @State private var errorText: String?
    @State private var showScreenTimeReport = false
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "BehaviorView")

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
                            streaks: summary.streaks ?? BehaviorSummary.Streaks(wake: 0, screen: 0, workout: 0, rumination: 0)
                        )

                        FutureScenarioView(future: summary.futureScenario)
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, AppTheme.Spacing.md)
            }
            .background(AppBackground())
            .task { await load() }
            // v3.1: Hidden DeviceActivityReport を表示してデータ収集をトリガー
            .background {
                if showScreenTimeReport && appState.sensorAccess.screenTimeEnabled {
                    DeviceActivityReport(
                        .init(rawValue: "TotalActivity"),
                        filter: DeviceActivityFilter(
                            segment: .daily(during: DateInterval(
                                start: Calendar.current.startOfDay(for: Date()),
                                end: Date()
                            ))
                        )
                    )
                    .frame(width: 1, height: 1)
                    .opacity(0.01)
                }
            }
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
        
        // v3.1: Screen Time データを更新するために DeviceActivityReport を表示
        if appState.sensorAccess.screenTimeEnabled {
            showScreenTimeReport = true
            // Extension がデータを App Groups に保存するのを待つ
            try? await Task.sleep(nanoseconds: 500_000_000) // 0.5秒
            showScreenTimeReport = false
        }
        
        // v3.1: 最新の HealthKit データを即座にバックエンドへ送信
        await MetricsUploader.shared.runUploadIfDue(force: true)
        
        do {
            let data = try await BehaviorSummaryService.shared.fetchSummary()
            summary = data
        } catch {
            errorText = String(localized: "behavior_error_failed_load")
        }
        isLoading = false
    }
}

