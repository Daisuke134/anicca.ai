import XCTest
@testable import aniccaios

@MainActor
final class NudgeStatsManagerTests: XCTestCase {

    override func setUp() {
        super.setUp()
        NudgeStatsManager.shared.resetAllStats()
    }

    override func tearDown() {
        NudgeStatsManager.shared.resetAllStats()
        super.tearDown()
    }

    // MARK: - isCompletelyUnresponsive() のテスト
    // 実装: 全バリアントが 7日以上連続 ignored なら true

    /// 連続 ignored が 7日未満では false を返すこと
    func test_isCompletelyUnresponsive_returns_false_when_consecutive_less_than_7() {
        // 6日連続 ignored を記録（7日未満）
        NudgeStatsManager.shared.debugRecordIgnored(
            problemType: "staying_up_late",
            variantIndex: 0,
            scheduledHour: 22,
            count: 6
        )

        let result = NudgeStatsManager.shared.isCompletelyUnresponsive(
            for: "staying_up_late",
            hour: 22
        )

        XCTAssertFalse(result, "Should return false when consecutiveIgnoredDays < 7")
    }

    /// 全バリアントが 7日以上連続 ignored なら true を返すこと
    func test_isCompletelyUnresponsive_returns_true_when_all_variants_7_consecutive_ignored() {
        // 全バリアント（0-7）に 7日連続 ignored を記録
        for variant in 0..<8 {
            NudgeStatsManager.shared.debugRecordIgnored(
                problemType: "staying_up_late",
                variantIndex: variant,
                scheduledHour: 22,
                count: 7
            )
        }

        let result = NudgeStatsManager.shared.isCompletelyUnresponsive(
            for: "staying_up_late",
            hour: 22
        )

        XCTAssertTrue(result, "Should return true when all variants have 7+ consecutive ignored days")
    }

    /// tapped が記録されると連続 ignored がリセットされること
    func test_recordTapped_resets_consecutive_ignored() {
        // 5日連続 ignored を記録
        NudgeStatsManager.shared.debugRecordIgnored(
            problemType: "staying_up_late",
            variantIndex: 0,
            scheduledHour: 22,
            count: 5
        )

        // tapped を記録（連続 ignored がリセットされる）
        NudgeStatsManager.shared.recordTapped(
            problemType: "staying_up_late",
            variantIndex: 0,
            scheduledHour: 22
        )

        let consecutive = NudgeStatsManager.shared.getConsecutiveIgnoredDays(
            problemType: "staying_up_late",
            hour: 22
        )

        XCTAssertEqual(consecutive, 0, "Consecutive ignored days should reset to 0 after tap")
    }

    // MARK: - selectUntriedVariant() のテスト

    /// まだ試されていないバリアントを返すこと
    func test_selectUntriedVariant_returns_untried_variant() {
        // バリアント 0, 1, 2 を試したことにする
        for variant in 0..<3 {
            NudgeStatsManager.shared.debugRecordIgnored(
                problemType: "anxiety",
                variantIndex: variant,
                scheduledHour: 9,
                count: 1
            )
        }

        let availableVariants = [0, 1, 2, 3, 4, 5, 6, 7]
        let untried = NudgeStatsManager.shared.selectUntriedVariant(
            for: "anxiety",
            hour: 9,
            availableVariants: availableVariants
        )

        XCTAssertNotNil(untried)
        XCTAssertTrue([3, 4, 5, 6, 7].contains(untried!), "Should return an untried variant")
    }

    /// 全バリアントが試されていたらサンプル数最小のバリアントを返すこと
    func test_selectUntriedVariant_returns_least_tested_when_all_tried() {
        // 全バリアントを試す（バリアント 0 は 1回、他は 3回）
        NudgeStatsManager.shared.debugRecordIgnored(
            problemType: "anxiety",
            variantIndex: 0,
            scheduledHour: 9,
            count: 1
        )
        for variant in 1..<8 {
            NudgeStatsManager.shared.debugRecordIgnored(
                problemType: "anxiety",
                variantIndex: variant,
                scheduledHour: 9,
                count: 3
            )
        }

        let availableVariants = [0, 1, 2, 3, 4, 5, 6, 7]
        let selected = NudgeStatsManager.shared.selectUntriedVariant(
            for: "anxiety",
            hour: 9,
            availableVariants: availableVariants
        )

        // サンプル数最小のバリアント 0 が選ばれるはず
        XCTAssertEqual(selected, 0, "Should return the least tested variant")
    }

    // MARK: - consecutiveIgnoredDays のテスト

    /// 連続 ignored 日数が正しくカウントされること
    func test_getConsecutiveIgnoredDays_increments_correctly() {
        // 初期状態は 0
        let initial = NudgeStatsManager.shared.getConsecutiveIgnoredDays(
            problemType: "rumination",
            hour: 20
        )
        XCTAssertEqual(initial, 0)

        // 3回 ignored を記録
        NudgeStatsManager.shared.debugRecordIgnored(
            problemType: "rumination",
            variantIndex: 0,
            scheduledHour: 20,
            count: 3
        )

        let afterThree = NudgeStatsManager.shared.getConsecutiveIgnoredDays(
            problemType: "rumination",
            hour: 20
        )
        XCTAssertEqual(afterThree, 3)
    }

    /// 連続 ignored 日数がバリアント横断で最大値を返すこと
    func test_getConsecutiveIgnoredDays_returns_max_across_variants() {
        // variant 0 に 5日、variant 1 に 3日の ignored を記録
        NudgeStatsManager.shared.debugRecordIgnored(
            problemType: "staying_up_late",
            variantIndex: 0,
            scheduledHour: 22,
            count: 5
        )
        NudgeStatsManager.shared.debugRecordIgnored(
            problemType: "staying_up_late",
            variantIndex: 1,
            scheduledHour: 22,
            count: 3
        )

        // 最大値（5）が返る
        let consecutive = NudgeStatsManager.shared.getConsecutiveIgnoredDays(
            problemType: "staying_up_late",
            hour: 22
        )
        XCTAssertEqual(consecutive, 5, "Should return max consecutive ignored days across variants")
    }
}

