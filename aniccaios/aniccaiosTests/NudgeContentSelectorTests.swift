import XCTest
@testable import aniccaios

@MainActor
final class NudgeContentSelectorTests: XCTestCase {

    // NudgeContentSelector はシングルトンなので shared を使用
    private var selector: NudgeContentSelector!

    // MARK: - Test Helpers

    private var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    /// テスト用ヘルパー: LLMGeneratedNudgeを作成
    private func makeTestNudge(
        id: String = "llm-123",
        problemType: ProblemType = .cantWakeUp,
        scheduledHour: Int = 7
    ) throws -> LLMGeneratedNudge {
        let json = """
        {
            "id": "\(id)",
            "problemType": "\(problemType.rawValue)",
            "scheduledHour": \(scheduledHour),
            "hook": "LLM生成",
            "content": "LLMコンテンツ",
            "tone": "strict",
            "reasoning": "test",
            "createdAt": "2026-01-24T05:00:00Z"
        }
        """.data(using: .utf8)!
        return try decoder.decode(LLMGeneratedNudge.self, from: json)
    }

    override func setUp() {
        super.setUp()
        selector = NudgeContentSelector.shared
        // テスト前に統計とキャッシュをリセット
        NudgeStatsManager.shared.resetAllStats()
        LLMNudgeCache.shared.clear()
        // デフォルトの乱数プロバイダーに戻す
        selector.randomProvider = { Double.random(in: 0...1) }
    }

    override func tearDown() {
        NudgeStatsManager.shared.resetAllStats()
        LLMNudgeCache.shared.clear()
        selector.randomProvider = { Double.random(in: 0...1) }
        super.tearDown()
    }

    // MARK: - Phase 6: LLM Selection Tests

    /// LLMキャッシュがあり、乱数が0.5未満の場合、LLM Nudgeが選択される
    func test_selectVariant_withLLMAvailable() throws {
        // LLM nudgeをキャッシュに設定
        let llmNudge = try makeTestNudge()
        LLMNudgeCache.shared.setNudges([llmNudge])

        // 乱数を0.3（< 0.5）に固定 → LLM選択
        selector.randomProvider = { 0.3 }

        let result = selector.selectVariant(for: .cantWakeUp, scheduledHour: 7)

        XCTAssertTrue(result.isAIGenerated)
        XCTAssertEqual(result.variantIndex, -1)
        XCTAssertNotNil(result.content)
        XCTAssertEqual(result.content?.id, "llm-123")
        XCTAssertEqual(result.content?.problemType, .cantWakeUp)
    }

    /// 乱数が0.5以上の場合、LLMキャッシュがあっても既存バリアントが選択される
    func test_selectVariant_existingWhenRandomHigh() throws {
        // LLM nudgeをキャッシュに設定
        let llmNudge = try makeTestNudge()
        LLMNudgeCache.shared.setNudges([llmNudge])

        // 乱数を0.7（>= 0.5）に固定 → 既存バリアント選択
        selector.randomProvider = { 0.7 }

        let result = selector.selectVariant(for: .cantWakeUp, scheduledHour: 7)

        XCTAssertFalse(result.isAIGenerated)
        XCTAssertGreaterThanOrEqual(result.variantIndex, 0)
        XCTAssertNil(result.content)
    }

    /// LLMキャッシュが空の場合、乱数が0.5未満でも既存バリアントにフォールバック
    func test_selectVariant_fallbackToExisting() {
        // キャッシュを空にする
        LLMNudgeCache.shared.clear()

        // 乱数を0.3（< 0.5）に固定してもキャッシュが空ならfallback
        selector.randomProvider = { 0.3 }

        let result = selector.selectVariant(for: .cantWakeUp, scheduledHour: 7)

        XCTAssertFalse(result.isAIGenerated)
        XCTAssertGreaterThanOrEqual(result.variantIndex, 0)
        XCTAssertNil(result.content)
    }

    /// 問題タイプと時刻の組み合わせが一致しない場合はLLMキャッシュから取得できない
    func test_selectVariant_llmCacheMismatch() throws {
        // cant_wake_up の hour=7 にNudgeを設定
        let llmNudge = try makeTestNudge(problemType: .cantWakeUp, scheduledHour: 7)
        LLMNudgeCache.shared.setNudges([llmNudge])

        // 乱数を0.3に固定
        selector.randomProvider = { 0.3 }

        // 異なる時刻で取得 → LLMなし
        let result = selector.selectVariant(for: .cantWakeUp, scheduledHour: 8)
        XCTAssertFalse(result.isAIGenerated)

        // 異なる問題タイプで取得 → LLMなし
        let result2 = selector.selectVariant(for: .stayingUpLate, scheduledHour: 7)
        XCTAssertFalse(result2.isAIGenerated)
    }

    // MARK: - Existing Variant Selection Tests

    /// 初回呼び出しで有効なバリアントを返すこと (stayingUpLate)
    func test_selectVariant_returns_valid_variant_for_stayingUpLate() {
        // 乱数を高めに設定して既存ロジックを使用
        selector.randomProvider = { 0.9 }

        let result = selector.selectVariant(for: .stayingUpLate, scheduledHour: 22)

        // stayingUpLate の汎用バリアントは [0, 1, 2, 5, 6, 7, 8, 9]
        let validVariants = [0, 1, 2, 5, 6, 7, 8, 9]
        XCTAssertTrue(validVariants.contains(result.variantIndex), "Variant \(result.variantIndex) should be in \(validVariants)")
        XCTAssertFalse(result.isAIGenerated)
    }

    /// 他の問題タイプでは 0〜7 のバリアントを返すこと
    func test_selectVariant_returns_valid_variant_for_other_problems() {
        // 乱数を高めに設定して既存ロジックを使用
        selector.randomProvider = { 0.9 }

        let problems: [ProblemType] = [.cantWakeUp, .selfLoathing, .procrastination, .anxiety]

        for problem in problems {
            let result = selector.selectVariant(for: problem, scheduledHour: 9)
            XCTAssertGreaterThanOrEqual(result.variantIndex, 0)
            XCTAssertLessThanOrEqual(result.variantIndex, 7)
            XCTAssertFalse(result.isAIGenerated)
        }
    }

    /// 時刻固定バリアントが正しく選択されること（0時と1時）
    func test_selectVariant_returns_time_specific_variant_at_correct_hour() {
        // 乱数を高めに設定して既存ロジックを使用
        selector.randomProvider = { 0.9 }

        // 0時（深夜0時）は stayingUpLate の時刻固定バリアント 3
        let result0 = selector.selectVariant(for: .stayingUpLate, scheduledHour: 0)
        XCTAssertEqual(result0.variantIndex, 3, "At 00:00, should select variant 3 (midnight)")

        // 1時（深夜1時）は stayingUpLate の時刻固定バリアント 4
        let result1 = selector.selectVariant(for: .stayingUpLate, scheduledHour: 1)
        XCTAssertEqual(result1.variantIndex, 4, "At 01:00, should select variant 4 (1 AM)")
    }

    /// 22時などの通常時間帯では汎用バリアントから選択されること
    func test_selectVariant_does_not_return_time_specific_variant_at_other_hours() {
        // 乱数を高めに設定して既存ロジックを使用
        selector.randomProvider = { 0.9 }

        let result22 = selector.selectVariant(for: .stayingUpLate, scheduledHour: 22)

        // 22時は時刻固定が発動しないので、Thompson Sampling が汎用バリアント [0,1,2,5,6,7,8,9] から選択
        // Note: 3, 4 は genericVariants に含まれないため、絶対に返らない
        let validVariants = [0, 1, 2, 5, 6, 7, 8, 9]
        XCTAssertTrue(validVariants.contains(result22.variantIndex), "At 22:00, should select a generic variant")
    }

    // MARK: - Thompson Sampling Tests

    /// tapped が多いバリアントが選ばれやすいこと
    func test_selectVariant_favors_high_tapped_variants() {
        // 乱数を高めに設定して既存ロジック（Thompson Sampling）を使用
        selector.randomProvider = { 0.9 }

        // バリアント 0 に多くの tapped を記録
        for _ in 0..<20 {
            NudgeStatsManager.shared.recordTapped(
                problemType: "procrastination",
                variantIndex: 0,
                scheduledHour: 10
            )
        }

        // バリアント 1 に多くの ignored を記録
        NudgeStatsManager.shared.debugRecordIgnored(
            problemType: "procrastination",
            variantIndex: 1,
            scheduledHour: 10,
            count: 20
        )

        // 100回選択して、バリアント 0 が多く選ばれることを確認
        var variant0Count = 0
        for _ in 0..<100 {
            let result = selector.selectVariant(for: .procrastination, scheduledHour: 10)
            if result.variantIndex == 0 {
                variant0Count += 1
            }
        }

        XCTAssertGreaterThan(variant0Count, 60, "High-tapped variant should be selected > 60% of the time")
    }

    // MARK: - 50% Distribution Test

    /// LLMとExisting が約50/50で選択されること（統計的テスト）
    func test_selectVariant_50_50_distribution() throws {
        // LLM nudgeをキャッシュに設定
        let llmNudge = try makeTestNudge()
        LLMNudgeCache.shared.setNudges([llmNudge])

        // デフォルトの乱数プロバイダーを使用
        selector.randomProvider = { Double.random(in: 0...1) }

        var llmCount = 0
        let iterations = 1000

        for _ in 0..<iterations {
            let result = selector.selectVariant(for: .cantWakeUp, scheduledHour: 7)
            if result.isAIGenerated {
                llmCount += 1
            }
        }

        // 許容誤差 ±10% (40-60%)
        let llmRatio = Double(llmCount) / Double(iterations)
        XCTAssertGreaterThan(llmRatio, 0.40, "LLM should be selected at least 40% of the time")
        XCTAssertLessThan(llmRatio, 0.60, "LLM should be selected at most 60% of the time")
    }
}
