import XCTest
@testable import aniccaios

final class ProblemNotificationSchedulerTests: XCTestCase {

    var scheduler: ProblemNotificationScheduler!

    override func setUp() {
        super.setUp()
        scheduler = ProblemNotificationScheduler.shared
    }

    // MARK: - calculateNewShift Tests

    /// consecutive < 2 ならシフトなし
    func test_calculateNewShift_no_shift_when_consecutive_less_than_2() {
        // consecutive = 0
        XCTAssertEqual(scheduler.calculateNewShift(currentShift: 0, consecutiveIgnored: 0), 0)

        // consecutive = 1
        XCTAssertEqual(scheduler.calculateNewShift(currentShift: 0, consecutiveIgnored: 1), 0)

        // currentShift があっても consecutive < 2 なら変わらない
        XCTAssertEqual(scheduler.calculateNewShift(currentShift: 30, consecutiveIgnored: 1), 30)
    }

    /// consecutive >= 2 で +30分シフト
    func test_calculateNewShift_adds_30_when_consecutive_2_or_more() {
        // consecutive = 2, currentShift = 0 → 30
        XCTAssertEqual(scheduler.calculateNewShift(currentShift: 0, consecutiveIgnored: 2), 30)

        // consecutive = 3, currentShift = 30 → 60
        XCTAssertEqual(scheduler.calculateNewShift(currentShift: 30, consecutiveIgnored: 3), 60)

        // consecutive = 5, currentShift = 60 → 90
        XCTAssertEqual(scheduler.calculateNewShift(currentShift: 60, consecutiveIgnored: 5), 90)
    }

    /// 最大シフトは 120分
    func test_calculateNewShift_respects_max_120_minutes() {
        // currentShift = 90, consecutive = 10 → 120 (capped)
        XCTAssertEqual(scheduler.calculateNewShift(currentShift: 90, consecutiveIgnored: 10), 120)

        // currentShift = 100, consecutive = 5 → 120 (capped, not 130)
        XCTAssertEqual(scheduler.calculateNewShift(currentShift: 100, consecutiveIgnored: 5), 120)

        // currentShift = 120 (already max), consecutive = 10 → 120 (stays at max)
        XCTAssertEqual(scheduler.calculateNewShift(currentShift: 120, consecutiveIgnored: 10), 120)
    }
}
