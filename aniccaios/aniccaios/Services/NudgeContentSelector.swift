import Foundation
import OSLog

/// Nudgeコンテンツ選択ロジック
@MainActor
final class NudgeContentSelector {
    static let shared = NudgeContentSelector()

    private let logger = Logger(subsystem: "com.anicca.ios", category: "NudgeContentSelector")

    // テスト用: 乱数生成を注入可能にする
    var randomProvider: () -> Double = { Double.random(in: 0...1) }

    // Phase 6: 交互切り替え用フラグ（問題タイプ+時刻ごと）
    private var lastWasLLM: [String: Bool] = [:]

    private init() {}

    /// テスト用: 交互切り替え状態をリセット
    func resetAlternatingState() {
        lastWasLLM.removeAll()
    }

    /// 問題タイプと時刻からベストなバリアントを選択（Phase 6: LLM生成対応・交互）
    /// - Returns: (variantIndex: Int, isAIGenerated: Bool, content: LLMGeneratedNudge?)
    func selectVariant(for problem: ProblemType, scheduledHour: Int) -> (variantIndex: Int, isAIGenerated: Bool, content: LLMGeneratedNudge?) {
        let key = "\(problem.rawValue)_\(scheduledHour)"

        // 交互切り替え: 前回がルールベースならLLMを試みる
        let shouldTryLLM = !(lastWasLLM[key] ?? false)

        if shouldTryLLM {
            if let llmNudge = LLMNudgeCache.shared.getNudge(for: problem, hour: scheduledHour) {
                lastWasLLM[key] = true
                logger.info("🤖 Selected LLM-generated nudge for \(problem.rawValue) at hour \(scheduledHour)")
                return (variantIndex: -1, isAIGenerated: true, content: llmNudge)
            }
            // LLMキャッシュがなければルールベースにフォールバック（フラグは更新しない）
        }

        // ルールベース
        lastWasLLM[key] = false
        let selectedVariant = selectExistingVariant(for: problem, scheduledHour: scheduledHour)
        logger.info("📋 Selected rule-based variant \(selectedVariant) for \(problem.rawValue) at hour \(scheduledHour)")
        return (variantIndex: selectedVariant, isAIGenerated: false, content: nil)
    }

    #if DEBUG
    /// デバッグ用: 時刻を無視してLLMを取得（交互切り替え）
    func selectVariantForDebug(for problem: ProblemType) -> (variantIndex: Int, isAIGenerated: Bool, content: LLMGeneratedNudge?) {
        let key = "debug_\(problem.rawValue)"

        // 交互切り替え: 前回がルールベースならLLMを試みる
        let shouldTryLLM = !(lastWasLLM[key] ?? false)

        if shouldTryLLM {
            // 時刻を無視してLLMを取得
            if let llmNudge = LLMNudgeCache.shared.getNudgeAnyHour(for: problem) {
                lastWasLLM[key] = true
                logger.info("🤖 [Debug] Selected LLM nudge for \(problem.rawValue)")
                return (variantIndex: -1, isAIGenerated: true, content: llmNudge)
            }
            // LLMキャッシュがなければルールベースにフォールバック
            logger.info("⚠️ [Debug] No LLM cache for \(problem.rawValue), using rule-based")
        }

        // ルールベース
        lastWasLLM[key] = false
        let selectedVariant = selectExistingVariant(for: problem, scheduledHour: 21)
        logger.info("📋 [Debug] Selected rule-based variant \(selectedVariant) for \(problem.rawValue)")
        return (variantIndex: selectedVariant, isAIGenerated: false, content: nil)
    }
    #endif

    /// 既存のバリアント選択ロジック（Phase 5: Thompson Sampling）
    private func selectExistingVariant(for problem: ProblemType, scheduledHour: Int) -> Int {
        // 0. 完全無反応ユーザーの場合、未試行バリアントを優先
        if NudgeStatsManager.shared.isCompletelyUnresponsive(for: problem.rawValue, hour: scheduledHour) {
            let allVariants = getGenericVariantIndices(for: problem)
            if let untriedVariant = NudgeStatsManager.shared.selectUntriedVariant(
                for: problem.rawValue,
                hour: scheduledHour,
                availableVariants: allVariants
            ) {
                logger.info("Unresponsive user: selected untried variant \(untriedVariant) for \(problem.rawValue)")
                return untriedVariant
            }
        }
        
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

        // 3. Thompson Samplingで選択
        let selectedVariant = selectByThompsonSampling(
            variants: genericVariants,
            problem: problem,
            hour: scheduledHour
        )

        logger.info("Selected variant \(selectedVariant) for \(problem.rawValue) at hour \(scheduledHour)")
        return selectedVariant
    }

    /// 後方互換: 既存コード用のselectVariant（Intを返す）
    /// Phase 6移行期間中は使用可能だが、将来的に削除予定
    @available(*, deprecated, message: "Use selectVariant returning tuple instead")
    func selectVariantLegacy(for problem: ProblemType, scheduledHour: Int) -> Int {
        let result = selectVariant(for: problem, scheduledHour: scheduledHour)
        return result.variantIndex
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

    /// 汎用バリアントのインデックス配列を返す（Phase 5拡充版）
    private func getGenericVariantIndices(for problem: ProblemType) -> [Int] {
        switch problem {
        case .stayingUpLate:
            // 10バリアント中、0-2, 5-9が汎用（3,4は時刻固定）
            return [0, 1, 2, 5, 6, 7, 8, 9]
        case .cantWakeUp:
            return Array(0..<8)  // 8バリアント
        case .selfLoathing:
            return Array(0..<8)
        case .rumination:
            return Array(0..<8)
        case .procrastination:
            return Array(0..<8)
        case .anxiety:
            return Array(0..<8)
        case .lying:
            return Array(0..<8)
        case .badMouthing:
            return Array(0..<8)
        case .pornAddiction:
            return Array(0..<8)
        case .alcoholDependency:
            return Array(0..<8)
        case .anger:
            return Array(0..<8)
        case .obsessive:
            return Array(0..<8)
        case .loneliness:
            return Array(0..<8)
        }
    }

    // MARK: - Thompson Sampling (Phase 5)

    /// Thompson Samplingによるバリアント選択
    private func selectByThompsonSampling(variants: [Int], problem: ProblemType, hour: Int) -> Int {
        let samples = variants.map { variantIndex -> (variantIndex: Int, sample: Double, alpha: Double, beta: Double) in
            let stats = NudgeStatsManager.shared.getStats(
                problemType: problem.rawValue,
                variantIndex: variantIndex,
                hour: hour
            )
            // alpha = tapped + 1 (事前分布)
            // beta = ignored + 1 (事前分布)
            let alpha = Double(stats?.tappedCount ?? 0) + 1.0
            let beta = Double(stats?.ignoredCount ?? 0) + 1.0
            let distribution = BetaDistribution(alpha: alpha, beta: beta)
            let sample = distribution.sample()
            
            logger.debug("Variant \(variantIndex): alpha=\(alpha), beta=\(beta), sample=\(String(format: "%.3f", sample))")
            return (variantIndex, sample, alpha, beta)
        }
        
        // 最大サンプル値のバリアントを選択
        if let best = samples.max(by: { $0.sample < $1.sample }) {
            logger.info("Thompson Sampling: selected variant \(best.variantIndex) with sample \(String(format: "%.3f", best.sample))")
            
            // Mixpanelに送信
            AnalyticsManager.shared.track(.nudgeScheduled, properties: [
                "problem_type": problem.rawValue,
                "variant_index": best.variantIndex,
                "scheduled_hour": hour,
                "selection_method": "thompson_sampling",
                "alpha": best.alpha,
                "beta": best.beta,
                "sample_value": best.sample,
                "tap_rate_estimate": best.alpha / (best.alpha + best.beta)
            ])
            
            return best.variantIndex
        }
        
        return variants[0]
    }
    
    // MARK: - Legacy Selection (Deprecated)

    /// データ量に応じた選択戦略（Phase 4互換、非推奨）
    @available(*, deprecated, message: "Use selectByThompsonSampling instead")
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

