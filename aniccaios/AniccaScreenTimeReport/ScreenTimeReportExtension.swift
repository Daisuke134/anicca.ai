import DeviceActivity
import SwiftUI
import os.log

@main
struct AniccaScreenTimeReportExtension: DeviceActivityReportExtension {
    var body: some DeviceActivityReportScene {
        TotalActivityReport { activityReport in
            TotalActivityView(report: activityReport)
        }
    }
}

// MARK: - Report Context

extension DeviceActivityReport.Context {
    static let totalActivity = Self("TotalActivity")
}

// MARK: - Report Scene

@MainActor
struct TotalActivityReport: DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = .totalActivity
    let content: (ActivityReport) -> TotalActivityView
    
    nonisolated func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> ActivityReport {
        let logger = Logger(subsystem: "ai.anicca.app.ios.screentime-report", category: "Report")
        let appGroupDefaults = UserDefaults(suiteName: "group.ai.anicca.app.ios")
        
        var totalMinutes: Double = 0
        var socialMinutes: Double = 0
        var lateNightMinutes: Double = 0
        var snsSessions: [[String: Any]] = []
        
        let calendar = Calendar.current
        
        // SNS アプリの Bundle ID リスト
        let snsBundleIds = [
            "com.twitter", "com.atebits.tweetie2",  // Twitter/X
            "com.burbn.instagram",                   // Instagram
            "com.zhiliaoapp.musically",              // TikTok
            "com.facebook.Facebook",                 // Facebook
            "com.toyopagroup.picaboo",               // Snapchat
            "com.pinterest",                         // Pinterest
            "com.reddit.Reddit",                     // Reddit
            "net.whatsapp.WhatsApp",                 // WhatsApp
            "jp.naver.line",                         // LINE
            "com.facebook.Messenger",                // Messenger
            "com.google.ios.youtube"                 // YouTube
        ]
        
        // ★ DeviceActivityResults は AsyncSequence なので、すべて for await を使用
        for await dataItem in data {
            for await segment in dataItem.activitySegments {
                let segmentStart = segment.dateInterval.start
                let segmentEnd = segment.dateInterval.end
                let hour = calendar.component(.hour, from: segmentStart)
                let isLateNight = hour >= 23 || hour < 6
                
                // ★ segment.categories を経由して applications を取得
                for await category in segment.categories {
                    for await app in category.applications {
                        let minutes = app.totalActivityDuration / 60.0
                        totalMinutes += minutes
                        
                        // SNS かどうか判定
                        let bundleId = app.application.bundleIdentifier ?? ""
                        let isSns = snsBundleIds.contains { bundleId.hasPrefix($0) }
                        
                        if isSns {
                            socialMinutes += minutes
                            if isLateNight {
                                lateNightMinutes += minutes
                            }
                            
                            // snsSessions に追加
                            snsSessions.append([
                                "bundleId": bundleId,
                                "startAt": ISO8601DateFormatter().string(from: segmentStart),
                                "endAt": ISO8601DateFormatter().string(from: segmentEnd),
                                "totalMinutes": Int(minutes)
                            ])
                        }
                    }
                }
            }
        }
        
        // App Groups に保存（メインアプリで読み取り）
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        let todayKey = String(today)
        
        appGroupDefaults?.set(Int(totalMinutes), forKey: "screenTime_totalMinutes_\(todayKey)")
        appGroupDefaults?.set(Int(socialMinutes), forKey: "screenTime_socialMinutes_\(todayKey)")
        appGroupDefaults?.set(Int(lateNightMinutes), forKey: "screenTime_lateNightMinutes_\(todayKey)")
        
        // v3.1: snsSessions を JSON として保存
        if let sessionsData = try? JSONSerialization.data(withJSONObject: snsSessions),
           let sessionsJSON = String(data: sessionsData, encoding: .utf8) {
            appGroupDefaults?.set(sessionsJSON, forKey: "screenTime_snsSessions_\(todayKey)")
        }
        
        appGroupDefaults?.set(Date().timeIntervalSince1970, forKey: "screenTime_lastUpdate")
        
        logger.info("Saved screen time: total=\(Int(totalMinutes))m, social=\(Int(socialMinutes))m, lateNight=\(Int(lateNightMinutes))m, sessions=\(snsSessions.count)")
        
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

