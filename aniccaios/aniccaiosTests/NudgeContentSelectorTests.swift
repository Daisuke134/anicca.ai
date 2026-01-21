import XCTest
@testable import aniccaios

@MainActor
final class NudgeContentSelectorTests: XCTestCase {

    // NudgeContentSelector はシングルトンなので shared を使用

    override func setUp() {
        super.setUp()
        // テスト前に統計をリセット
        NudgeStatsManager.shared.resetAllStats()
    }

    override func tearDown() {
        NudgeStatsManager.shared.resetAllStats()
        super.tearDown()
    }

    // MARK: - selectVariant() のテスト

    /// 初回呼び出しで有効なバリアントを返すこと (stayingUpLate)
    func test_selectVariant_returns_valid_variant_for_stayingUpLate() {
        let variant = NudgeContentSelector.shared.selectVariant(for: .stayingUpLate, scheduledHour: 22)

        // stayingUpLate の汎用バリアントは [0, 1, 2, 5, 6, 7, 8, 9]
        let validVariants = [0, 1, 2, 5, 6, 7, 8, 9]
        XCTAssertTrue(validVariants.contains(variant), "Variant \(variant) should be in \(validVariants)")
    }

    /// 他の問題タイプでは 0〜7 のバリアントを返すこと
    func test_selectVariant_returns_valid_variant_for_other_problems() {
        let problems: [ProblemType] = [.cantWakeUp, .selfLoathing, .procrastination, .anxiety]

        for problem in problems {
            let variant = NudgeContentSelector.shared.selectVariant(for: problem, scheduledHour: 9)
            XCTAssertGreaterThanOrEqual(variant, 0)
            XCTAssertLessThanOrEqual(variant, 7)
        }
    }

    /// 時刻固定バリアントが正しく選択されること（0時と1時）
    func test_selectVariant_returns_time_specific_variant_at_correct_hour() {
        // 0時（深夜0時）は stayingUpLate の時刻固定バリアント 3
        let variant0 = NudgeContentSelector.shared.selectVariant(for: .stayingUpLate, scheduledHour: 0)
        XCTAssertEqual(variant0, 3, "At 00:00, should select variant 3 (midnight)")

        // 1時（深夜1時）は stayingUpLate の時刻固定バリアント 4
        let variant1 = NudgeContentSelector.shared.selectVariant(for: .stayingUpLate, scheduledHour: 1)
        XCTAssertEqual(variant1, 4, "At 01:00, should select variant 4 (1 AM)")
    }

    /// 22時などの通常時間帯では汎用バリアントから選択されること
    func test_selectVariant_does_not_return_time_specific_variant_at_other_hours() {
        let variant22 = NudgeContentSelector.shared.selectVariant(for: .stayingUpLate, scheduledHour: 22)

        // 22時は時刻固定が発動しないので、Thompson Sampling が汎用バリアント [0,1,2,5,6,7,8,9] から選択
        // Note: 3, 4 は genericVariants に含まれないため、絶対に返らない
        let validVariants = [0, 1, 2, 5, 6, 7, 8, 9]
        XCTAssertTrue(validVariants.contains(variant22), "At 22:00, should select a generic variant")
    }
    
    // MARK: - Thompson Sampling のテスト

    /// tapped が多いバリアントが選ばれやすいこと
    func test_selectVariant_favors_high_tapped_variants() {
        // バリアント 0 に多くの tapped を記録
        for _ in 0..<20 {
            NudgeStatsManager.shared.recordTapped(
                problemType: "procrastination",
                variantIndex: 0,
                scheduledHour: 10
            )
        }

        // バリアント 1 に多くの ignored を記録（debugRecordIgnored を使用）
        NudgeStatsManager.shared.debugRecordIgnored(
            problemType: "procrastination",
            variantIndex: 1,
            scheduledHour: 10,
            count: 20
        )

        // 100回選択して、バリアント 0 が多く選ばれることを確認
        var variant0Count = 0
        for _ in 0..<100 {
            let variant = NudgeContentSelector.shared.selectVariant(for: .procrastination, scheduledHour: 10)
            if variant == 0 {
                variant0Count += 1
            }
        }

        XCTAssertGreaterThan(variant0Count, 60, "High-tapped variant should be selected > 60% of the time")
    }
}

