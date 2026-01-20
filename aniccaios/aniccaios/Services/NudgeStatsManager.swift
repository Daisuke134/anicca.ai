import Foundation
import OSLog

/// Nudge統計データ
struct NudgeStats: Codable, Equatable {
    let problemType: String
    let variantIndex: Int
    let scheduledHour: Int

    var tappedCount: Int = 0
    var ignoredCount: Int = 0
    var thumbsUpCount: Int = 0
    var thumbsDownCount: Int = 0
    var consecutiveIgnoredDays: Int = 0
    var lastTappedDate: Date?
    var lastScheduledDate: Date?

    /// tap率を計算
    var tapRate: Double {
        let total = tappedCount + ignoredCount
        guard total > 0 else { return 0.5 }
        return Double(tappedCount) / Double(total)
    }

    /// 👍率を計算
    var thumbsUpRate: Double {
        let total = thumbsUpCount + thumbsDownCount
        guard total > 0 else { return 0.5 }
        return Double(thumbsUpCount) / Double(total)
    }

    /// 総サンプル数
    var totalSamples: Int {
        tappedCount + ignoredCount
    }

    /// 一意キー
    var key: String {
        "\(problemType)_\(variantIndex)_\(scheduledHour)"
    }
}

/// スケジュールされたNudge（ignored判定用）
struct ScheduledNudge: Codable {
    let problemType: String
    let variantIndex: Int
    let scheduledHour: Int
    let scheduledDate: Date
    var wasTapped: Bool = false
}

/// Nudge統計管理
@MainActor
final class NudgeStatsManager {
    static let shared = NudgeStatsManager()

    private let logger = Logger(subsystem: "com.anicca.ios", category: "NudgeStats")
    private let queue = DispatchQueue(label: "com.anicca.nudgeStats", qos: .utility)

    // Storage keys
    private let statsKey = "com.anicca.nudgeStats"
    private let scheduledKey = "com.anicca.scheduledNudges"

    // In-memory cache
    private var stats: [String: NudgeStats] = [:]
    private var scheduledNudges: [String: ScheduledNudge] = [:]

    private init() {
        loadFromStorage()
    }

    // MARK: - Public API

    /// 通知スケジュール成功時に記録
    func recordScheduled(problemType: String, variantIndex: Int, scheduledHour: Int) {
        let key = "\(problemType)_\(variantIndex)_\(scheduledHour)"
        let nudge = ScheduledNudge(
            problemType: problemType,
            variantIndex: variantIndex,
            scheduledHour: scheduledHour,
            scheduledDate: Date()
        )
        scheduledNudges[key] = nudge

        // statsも更新
        var stat = stats[key] ?? NudgeStats(problemType: problemType, variantIndex: variantIndex, scheduledHour: scheduledHour)
        stat.lastScheduledDate = Date()
        stats[key] = stat

        saveToStorage()
        logger.info("Recorded scheduled: \(key)")
    }

    /// 通知タップ時に記録
    func recordTapped(problemType: String, variantIndex: Int, scheduledHour: Int) {
        let key = "\(problemType)_\(variantIndex)_\(scheduledHour)"

        // scheduledNudgesを更新
        if var nudge = scheduledNudges[key] {
            nudge.wasTapped = true
            scheduledNudges[key] = nudge
        }

        // statsを更新
        var stat = stats[key] ?? NudgeStats(problemType: problemType, variantIndex: variantIndex, scheduledHour: scheduledHour)
        stat.tappedCount += 1
        stat.consecutiveIgnoredDays = 0  // リセット
        stat.lastTappedDate = Date()
        stats[key] = stat

        saveToStorage()
        logger.info("Recorded tapped: \(key), tapRate: \(stat.tapRate)")
    }

    /// ignored判定（アプリ起動時に呼び出す）
    func checkAndRecordIgnored() async {
        let now = Date()
        let calendar = Calendar.current

        for (key, nudge) in scheduledNudges {
            // 24時間以上前 & 未tapped = ignored
            guard let scheduledDate = nudge.scheduledDate as Date?,
                  !nudge.wasTapped,
                  let hoursDiff = calendar.dateComponents([.hour], from: scheduledDate, to: now).hour,
                  hoursDiff >= 24 else {
                continue
            }

            recordIgnored(
                problemType: nudge.problemType,
                variantIndex: nudge.variantIndex,
                scheduledHour: nudge.scheduledHour
            )

            // Mixpanelに送信
            AnalyticsManager.shared.track(.nudgeIgnored, properties: [
                "problem_type": nudge.problemType,
                "variant_index": nudge.variantIndex,
                "scheduled_hour": nudge.scheduledHour
            ])

            // scheduledNudgesから削除
            scheduledNudges.removeValue(forKey: key)
        }

        saveToStorage()
    }

    /// ignored記録
    private func recordIgnored(problemType: String, variantIndex: Int, scheduledHour: Int) {
        let key = "\(problemType)_\(variantIndex)_\(scheduledHour)"

        var stat = stats[key] ?? NudgeStats(problemType: problemType, variantIndex: variantIndex, scheduledHour: scheduledHour)
        stat.ignoredCount += 1
        stat.consecutiveIgnoredDays += 1
        stats[key] = stat

        logger.info("Recorded ignored: \(key), consecutiveIgnoredDays: \(stat.consecutiveIgnoredDays)")
    }

    /// 👍記録
    func recordThumbsUp(problemType: String, variantIndex: Int) {
        // scheduledHourは不明なので、全時間帯の同じvariantを更新
        for (key, var stat) in stats {
            if stat.problemType == problemType && stat.variantIndex == variantIndex {
                stat.thumbsUpCount += 1
                stats[key] = stat
            }
        }
        saveToStorage()

        AnalyticsManager.shared.track(.nudgeFeedback, properties: [
            "problem_type": problemType,
            "variant_index": variantIndex,
            "is_positive": true
        ])
    }

    /// 👎記録
    func recordThumbsDown(problemType: String, variantIndex: Int) {
        for (key, var stat) in stats {
            if stat.problemType == problemType && stat.variantIndex == variantIndex {
                stat.thumbsDownCount += 1
                stats[key] = stat
            }
        }
        saveToStorage()

        AnalyticsManager.shared.track(.nudgeFeedback, properties: [
            "problem_type": problemType,
            "variant_index": variantIndex,
            "is_positive": false
        ])
    }

    /// 統計取得
    func getStats(problemType: String, variantIndex: Int, hour: Int) -> NudgeStats? {
        let key = "\(problemType)_\(variantIndex)_\(hour)"
        return stats[key]
    }

    /// 問題タイプの全バリアント統計取得
    func getAllStats(for problemType: String, hour: Int) -> [NudgeStats] {
        return stats.values.filter { $0.problemType == problemType && $0.scheduledHour == hour }
    }

    /// 時間帯の連続ignored日数取得
    func getConsecutiveIgnoredDays(problemType: String, hour: Int) -> Int {
        let hourStats = stats.values.filter { $0.problemType == problemType && $0.scheduledHour == hour }
        return hourStats.map { $0.consecutiveIgnoredDays }.max() ?? 0
    }

    // MARK: - Storage

    private func loadFromStorage() {
        let defaults = UserDefaults.standard

        if let data = defaults.data(forKey: statsKey),
           let decoded = try? JSONDecoder().decode([String: NudgeStats].self, from: data) {
            stats = decoded
        }

        if let data = defaults.data(forKey: scheduledKey),
           let decoded = try? JSONDecoder().decode([String: ScheduledNudge].self, from: data) {
            scheduledNudges = decoded
        }
    }

    private func saveToStorage() {
        queue.async { [stats, scheduledNudges] in
            let defaults = UserDefaults.standard

            if let data = try? JSONEncoder().encode(stats) {
                defaults.set(data, forKey: self.statsKey)
            }

            if let data = try? JSONEncoder().encode(scheduledNudges) {
                defaults.set(data, forKey: self.scheduledKey)
            }
        }
    }

    // MARK: - Debug

    #if DEBUG
    func resetAllStats() {
        stats = [:]
        scheduledNudges = [:]
        saveToStorage()
        logger.info("All stats reset")
    }
    #endif
}

