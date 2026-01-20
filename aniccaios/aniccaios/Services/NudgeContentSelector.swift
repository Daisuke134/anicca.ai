import Foundation
import OSLog

/// Nudgeコンテンツ選択ロジック
@MainActor
final class NudgeContentSelector {
    static let shared = NudgeContentSelector()

    private let logger = Logger(subsystem: "com.anicca.ios", category: "NudgeContentSelector")

    private init() {}

    /// 問題タイプと時刻からベストなバリアントを選択
    func selectVariant(for problem: ProblemType, scheduledHour: Int) -> Int {
        // 1. 時刻固定バリアントをチェック
        if let fixedVariant = getTimeSpecificVariant(problem: problem, hour: scheduledHour) {
            logger.info("Selected time-specific variant \(fixedVariant) for \(problem.rawValue) at hour \(scheduledHour)")
            return fixedVariant
        }

        // 2. 汎用バリアントから選択
        let genericVariants = getGenericVariantIndices(for: problem)
        guard !genericVariants.isEmpty else {
            return 0
        }

        // 3. データ量に応じた選択戦略
        let selectedVariant = selectByDataLevel(
            variants: genericVariants,
            problem: problem,
            hour: scheduledHour
        )

        logger.info("Selected variant \(selectedVariant) for \(problem.rawValue) at hour \(scheduledHour)")
        return selectedVariant
    }

    // MARK: - Time-Specific Variants

    /// 時刻固定バリアントを返す（該当しない場合はnil）
    private func getTimeSpecificVariant(problem: ProblemType, hour: Int) -> Int? {
        switch problem {
        case .stayingUpLate:
            // 深夜0時 → variant_4（インデックス3）
            if hour == 0 { return 3 }
            // 深夜1時 → variant_5（インデックス4）
            if hour == 1 { return 4 }
            return nil
        default:
            return nil
        }
    }

    /// 汎用バリアントのインデックス配列を返す
    private func getGenericVariantIndices(for problem: ProblemType) -> [Int] {
        switch problem {
        case .stayingUpLate:
            // variant_1, 2, 3 (インデックス0, 1, 2) が汎用
            return [0, 1, 2]
        case .cantWakeUp:
            return [0, 1, 2]
        case .selfLoathing:
            return [0, 1, 2]
        case .rumination:
            return [0, 1, 2]
        case .procrastination:
            return [0, 1, 2]
        case .anxiety:
            return [0, 1, 2]
        case .lying:
            return [0]  // 1種類のみ
        case .badMouthing:
            return [0, 1]
        case .pornAddiction:
            return [0, 1]
        case .alcoholDependency:
            return [0, 1]
        case .anger:
            return [0, 1]
        case .obsessive:
            return [0, 1, 2]
        case .loneliness:
            return [0, 1]
        }
    }

    // MARK: - Data-Level Selection

    /// データ量に応じた選択戦略
    private func selectByDataLevel(variants: [Int], problem: ProblemType, hour: Int) -> Int {
        // 各バリアントのサンプル数を取得
        let variantSamples = variants.map { variantIndex -> (Int, Int) in
            let stats = NudgeStatsManager.shared.getStats(
                problemType: problem.rawValue,
                variantIndex: variantIndex,
                hour: hour
            )
            let samples = stats?.totalSamples ?? 0
            return (variantIndex, samples)
        }

        let minSamples = variantSamples.map { $0.1 }.min() ?? 0
        let totalSamples = variantSamples.map { $0.1 }.reduce(0, +)

        // Phase A: 全バリアントが最低3回ずつ試されるまで
        // → 最もサンプル数が少ないバリアントを優先
        if minSamples < 3 {
            let leastTested = variantSamples.filter { $0.1 == minSamples }
            if let selected = leastTested.randomElement() {
                logger.info("Phase A (exploration): selected least tested variant \(selected.0)")
                return selected.0
            }
        }

        // Phase B: 全バリアントが3回以上 & 合計15回未満
        // → 50%活用 / 50%探索
        if totalSamples < 15 {
            if Double.random(in: 0...1) < 0.5 {
                logger.info("Phase B (50/50): exploitation")
                return selectByTapRate(variants: variants, problem: problem, hour: hour)
            } else {
                logger.info("Phase B (50/50): exploration")
                return variants.randomElement() ?? variants[0]
            }
        }

        // Phase C: 合計15回以上
        // → 80%活用 / 20%探索
        if Double.random(in: 0...1) < 0.8 {
            logger.info("Phase C (80/20): exploitation")
            return selectByTapRate(variants: variants, problem: problem, hour: hour)
        } else {
            logger.info("Phase C (80/20): exploration")
            return variants.randomElement() ?? variants[0]
        }
    }

    /// tap率ベースで選択
    private func selectByTapRate(variants: [Int], problem: ProblemType, hour: Int) -> Int {
        let variantRates = variants.map { variantIndex -> (Int, Double) in
            let stats = NudgeStatsManager.shared.getStats(
                problemType: problem.rawValue,
                variantIndex: variantIndex,
                hour: hour
            )
            let tapRate = stats?.tapRate ?? 0.5
            return (variantIndex, tapRate)
        }

        // 最高tap率のバリアントを選択
        if let best = variantRates.max(by: { $0.1 < $1.1 }) {
            return best.0
        }

        return variants[0]
    }

    // MARK: - Content Selection (Task 8)

    /// 👍率ベースでdetailを選択（通知とペアなので同じvariantIndexを使用）
    /// Phase 4ではペアのまま運用。将来的に分離可能。
    func selectContentVariant(for problem: ProblemType, notificationVariant: Int) -> Int {
        // 現在はnotificationとdetailはペア
        return notificationVariant
    }

    /// 複合スコアで選択（tap率 70% + 👍率 30%）
    func selectByCompositeScore(variants: [Int], problem: ProblemType, hour: Int) -> Int {
        let variantScores = variants.map { variantIndex -> (Int, Double) in
            let stats = NudgeStatsManager.shared.getStats(
                problemType: problem.rawValue,
                variantIndex: variantIndex,
                hour: hour
            )
            let tapRate = stats?.tapRate ?? 0.5
            let thumbsUpRate = stats?.thumbsUpRate ?? 0.5
            let score = tapRate * 0.7 + thumbsUpRate * 0.3
            return (variantIndex, score)
        }

        if let best = variantScores.max(by: { $0.1 < $1.1 }) {
            return best.0
        }

        return variants[0]
    }
}

