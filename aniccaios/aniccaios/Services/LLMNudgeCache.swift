import Foundation
import OSLog

/// LLM生成Nudgeのキャッシュ（@MainActorでスレッド安全性を保証）
@MainActor
final class LLMNudgeCache {
    static let shared = LLMNudgeCache()

    private var cache: [String: LLMGeneratedNudge] = [:]  // key: "\(problemType)_\(hour)"
    private let logger = Logger(subsystem: "com.anicca.ios", category: "LLMNudgeCache")

    private init() {}

    /// 指定された問題タイプと時刻のNudgeを取得
    func getNudge(for problem: ProblemType, hour: Int) -> LLMGeneratedNudge? {
        let key = "\(problem.rawValue)_\(hour)"
        return cache[key]
    }

    /// Nudgeをキャッシュに設定（複数一括設定）
    func setNudges(_ nudges: [LLMGeneratedNudge]) {
        for nudge in nudges {
            let key = "\(nudge.problemType.rawValue)_\(nudge.scheduledHour)"
            cache[key] = nudge
        }
        logger.info("📦 [LLMCache] Set \(nudges.count) nudges")
    }

    /// キャッシュをクリア（テスト用）
    func clear() {
        cache = [:]
        logger.info("📦 [LLMCache] Cleared")
    }

    // MARK: - Debug Methods

    /// キャッシュ内のNudge数
    var count: Int { cache.count }

    /// 最初のNudgeを取得（デバッグ用）
    func getFirstNudge() -> LLMGeneratedNudge? {
        cache.values.first
    }

    /// デバッグ用サマリー
    func debugSummary() -> String {
        if cache.isEmpty { return "📦 LLMキャッシュ: 空" }
        let entries = cache.map { "\($0.value.problemType.rawValue)@\($0.value.scheduledHour): \"\($0.value.hook)\"" }
        return "📦 LLMキャッシュ (\(cache.count)件):\n" + entries.joined(separator: "\n")
    }
}

