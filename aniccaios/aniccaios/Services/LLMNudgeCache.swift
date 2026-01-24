import Foundation

/// LLM生成Nudgeのキャッシュ（@MainActorでスレッド安全性を保証）
@MainActor
final class LLMNudgeCache {
    static let shared = LLMNudgeCache()

    private var cache: [String: LLMGeneratedNudge] = [:]  // key: "\(problemType)_\(hour)"

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
    }

    /// キャッシュをクリア（テスト用）
    func clear() {
        cache = [:]
    }
}

