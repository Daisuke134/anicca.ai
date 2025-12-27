@preconcurrency import DeviceActivity
import SwiftUI
import os.log
import ExtensionKit
import ExtensionFoundation
import ManagedSettings

@main
struct AniccaScreenTimeReportExtension: DeviceActivityReportExtension {
    // Xcode 26 / iOS 26 SDK では DeviceActivityReportExtension が AppExtension を継承するため
    // AppExtension 要件（extensionPoint）を満たす必要がある。
    // iOS 16–25 ではこのAPI自体が unavailable なので、runtime では参照されない。
    @MainActor
    @available(iOS 26.2, *)
    var extensionPoint: AppExtensionPoint {
        do {
            // DeviceActivityReport のドキュメントに明記されている extension point identifier
            return try AppExtensionPoint(identifier: "com.apple.deviceactivityui.report-extension")
        } catch {
            fatalError("Failed to create AppExtensionPoint: \(error)")
        }
    }

    @MainActor
    var body: some DeviceActivityReportScene {
        TotalActivityReport { activityReport in
            TotalActivityView(report: activityReport)
        }
    }
}
private func resolvedAppGroupDefaults() -> UserDefaults {
    if let defaults = UserDefaults(suiteName: "group.ai.anicca.app.ios") {
        return defaults
    }
    if let defaults = UserDefaults(suiteName: "group.ai.anicca.app") {
        return defaults
    }
    return .standard
}


// MARK: - Report Context

extension DeviceActivityReport.Context {
    static let totalActivity = Self("TotalActivity")
}

// MARK: - Report Scene

struct TotalActivityReport: DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = .totalActivity
    let content: (ActivityReport) -> TotalActivityView
    
    nonisolated func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> ActivityReport {
        let logger = Logger(subsystem: "ai.anicca.app.ios.screentime-report", category: "Report")
        let appGroupDefaults = resolvedAppGroupDefaults()
        
        var totalMinutes: Double = 0
        var lateNightMinutes: Double = 0
        var socialMinutes: Double = 0
        var receivedAny = false
        var snsSessionsPayload: [[String: Any]] = []
        
        let calendar = Calendar.current
        
        // ★ DeviceActivityResults は AsyncSequence なので、すべて for await を使用
        for await dataItem in data {
            for await segment in dataItem.activitySegments {
                let segmentStart = segment.dateInterval.start
                let hour = calendar.component(.hour, from: segmentStart)
                let isLateNight = hour >= 23 || hour < 6
                
                // LaunchServices DB に触れないため、bundleIdentifier 依存をやめる。
                // まずは「総スクリーン時間」と「夜間スクリーン時間」を安定して出す。
                let minutes = segment.totalActivityDuration / 60.0
                guard minutes > 0 else { continue }
                
                totalMinutes += minutes
                if isLateNight { lateNightMinutes += minutes }
                
                // 現行SDKでは CategoryActivitySegment のカテゴリ詳細を公開していないため、
                // 区別せず総スクリーン時間を social として扱う（UI表示目的の暫定措置）
                let primaryCategory = "screen"
                socialMinutes += minutes
                
                snsSessionsPayload.append([
                    "startAt": ISO8601DateFormatter().string(from: segment.dateInterval.start),
                    "endAt": ISO8601DateFormatter().string(from: segment.dateInterval.end),
                    "category": primaryCategory,
                    "totalMinutes": minutes
                ])
            }
        }
        
        // App Groups に保存（メインアプリで読み取り）
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        let todayKey = String(today)
        
        // 重要: データが返ってこないケース（未承認/未生成）で 0 を書いて上書きしない
        if receivedAny {
            appGroupDefaults.set(Int(totalMinutes), forKey: "screenTime_totalMinutes_\(todayKey)")
            // socialMinutes が未取得の場合は total をフォールバック
            let socialValue = socialMinutes > 0 ? socialMinutes : totalMinutes
            appGroupDefaults.set(Int(socialValue), forKey: "screenTime_socialMinutes_\(todayKey)")
            appGroupDefaults.set(Int(lateNightMinutes), forKey: "screenTime_lateNightMinutes_\(todayKey)")
            if let json = try? JSONSerialization.data(withJSONObject: snsSessionsPayload) {
                appGroupDefaults.set(String(data: json, encoding: .utf8), forKey: "screenTime_snsSessions_\(todayKey)")
            }
            appGroupDefaults.set(Date().timeIntervalSince1970, forKey: "screenTime_lastUpdate")
            logger.info("Saved screen time: total=\(Int(totalMinutes))m, lateNight=\(Int(lateNightMinutes))m, sessions=\(snsSessionsPayload.count)")
        } else {
            logger.info("No device activity data received; skipping App Group write")
        }
        
        return ActivityReport(
            totalMinutes: Int(totalMinutes),
            socialMinutes: Int(socialMinutes),
            lateNightMinutes: Int(lateNightMinutes)
        )
    }
}

// MARK: - Data Model

struct ActivityReport {
    let totalMinutes: Int
    let socialMinutes: Int
    let lateNightMinutes: Int
}

// MARK: - View (Extension 内でのみ使用)

struct TotalActivityView: View {
    let report: ActivityReport
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Screen Time Today")
                .font(.headline)
            Text("\(report.totalMinutes / 60)h \(report.totalMinutes % 60)m")
                .font(.largeTitle.bold())
            
            HStack(spacing: 32) {
                VStack {
                    Text("Social")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(report.socialMinutes)m")
                        .font(.title3.bold())
                }
                VStack {
                    Text("Late Night")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(report.lateNightMinutes)m")
                        .font(.title3.bold())
                        .foregroundStyle(report.lateNightMinutes > 30 ? .red : .primary)
                }
            }
        }
        .padding()
    }
}

