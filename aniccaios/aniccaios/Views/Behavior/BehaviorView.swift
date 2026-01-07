import SwiftUI
#if canImport(DeviceActivity)
import DeviceActivity
#endif
import os
import Foundation
#if canImport(FamilyControls)
import FamilyControls
#endif

/// v0.3 Behavior タブ: Today's Insights / 24h Timeline / Highlights / 10 Years From Now
struct BehaviorView: View {
    @EnvironmentObject private var appState: AppState
    @State private var isLoading = false
    @State private var summary: BehaviorSummary?
    @State private var errorText: String?
    @State private var showScreenTimeReport = false
    @State private var allowDeviceActivityReport = ScreenTimeManager.shared.isAuthorized
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "BehaviorView")
    private let appGroupDefaults = AppGroup.userDefaults

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

                        // 一時的に非表示 - 復活させる時はコメントを外す
                        // FutureScenarioView(future: summary.futureScenario)
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, AppTheme.Spacing.md)
            }
            .background(AppBackground())
            .task { await bootstrapAndLoad() }
            // v3.1: Hidden DeviceActivityReport を表示してデータ収集をトリガー
            #if canImport(DeviceActivity)
            .background {
                if showScreenTimeReport && appState.sensorAccess.screenTimeEnabled && allowDeviceActivityReport {
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
            #endif
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

    private func bootstrapAndLoad() async {
        if let cached = BehaviorSummaryCache.shared.latest {
            summary = cached
        }
        await load()
    }
    
    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorText = nil
        
        // ★ デバッグログ追加
        logger.info("BehaviorView: Starting data load")
        logger.info("BehaviorView: screenTimeEnabled=\(appState.sensorAccess.screenTimeEnabled), sleepEnabled=\(appState.sensorAccess.sleepEnabled), stepsEnabled=\(appState.sensorAccess.stepsEnabled)")
        
        // v3.1: Screen Time データを更新するために DeviceActivityReport を表示
        let shouldForceUpload = true
        #if canImport(DeviceActivity)
        if appState.sensorAccess.screenTimeEnabled {
            allowDeviceActivityReport = ScreenTimeManager.shared.isAuthorized
            if allowDeviceActivityReport {
                showScreenTimeReport = true
                logger.info("BehaviorView: Waiting for DeviceActivityReport...")
                let startTs = appGroupDefaults.double(forKey: "screenTime_lastUpdate")
                for _ in 0..<25 {
                    try? await Task.sleep(nanoseconds: 200_000_000)
                    let nowTs = appGroupDefaults.double(forKey: "screenTime_lastUpdate")
                    if nowTs > startTs {
                        break
                    }
                }
                showScreenTimeReport = false
            } else {
                logger.info("BehaviorView: ScreenTime authorization unavailable, skipping DeviceActivityReport")
                showScreenTimeReport = false
            }
        } else {
            allowDeviceActivityReport = false
        }
        #else
        allowDeviceActivityReport = false
        showScreenTimeReport = false
        #endif
        
        logger.info("BehaviorView: Running MetricsUploader... force=\(shouldForceUpload)")
        await MetricsUploader.shared.runUploadIfDue(force: shouldForceUpload)
        
        do {
            logger.info("BehaviorView: Fetching summary from backend...")
            let data = try await BehaviorSummaryService.shared.fetchSummary()
            
            // ★ デバッグログ追加
            logger.info("BehaviorView: Summary received - timeline segments: \(data.timeline.count)")
            logger.info("BehaviorView: Highlights - wake: \(data.highlights.wake.label), screen: \(data.highlights.screen.label), workout: \(data.highlights.workout.label), rumination: \(data.highlights.rumination.label)")
            
            summary = data
            BehaviorSummaryCache.shared.update(data)
        } catch {
            logger.error("BehaviorView: Failed to load summary - \(error.localizedDescription)")
            errorText = String(localized: "behavior_error_failed_load")
        }
        isLoading = false
    }
}

