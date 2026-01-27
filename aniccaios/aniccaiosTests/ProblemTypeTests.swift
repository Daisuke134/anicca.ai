import Testing
@testable import aniccaios

struct ProblemTypeTests {

    // MARK: - AC1: 全13問題タイプが5回/日のタイムスロット

    @Test("All 13 problem types have exactly 5 slots")
    func test_allProblemTypes_have5Slots() {
        for problem in ProblemType.allCases {
            #expect(
                problem.notificationSchedule.count == 5,
                "\(problem.rawValue) has \(problem.notificationSchedule.count) slots, expected 5"
            )
        }
    }

    // MARK: - To-Be 1: 各問題のスロットが正しいか

    @Test("staying_up_late slots match research")
    func test_stayingUpLate_slotsMatchResearch() {
        let slots = ProblemType.stayingUpLate.notificationSchedule
        let expected: [(Int, Int)] = [(20, 30), (21, 30), (22, 30), (23, 30), (7, 30)]
        #expect(slots.count == expected.count)
        for (i, slot) in slots.enumerated() {
            #expect(slot.hour == expected[i].0, "Slot \(i) hour mismatch")
            #expect(slot.minute == expected[i].1, "Slot \(i) minute mismatch")
        }
    }

    @Test("cant_wake_up has correct wake window slots")
    func test_cantWakeUp_slotsMatchResearch() {
        let slots = ProblemType.cantWakeUp.notificationSchedule
        let expected: [(Int, Int)] = [(22, 0), (6, 0), (6, 15), (6, 30), (8, 0)]
        #expect(slots.count == expected.count)
        for (i, slot) in slots.enumerated() {
            #expect(slot.hour == expected[i].0, "Slot \(i) hour mismatch")
            #expect(slot.minute == expected[i].1, "Slot \(i) minute mismatch")
        }
    }

    // MARK: - AC14: validTimeRange削除

    @Test("cant_wake_up has no valid time range restriction")
    func test_cantWakeUp_noValidTimeRange() {
        #expect(ProblemType.cantWakeUp.validTimeRange == nil)
    }

    @Test("All problem types have no valid time range restriction")
    func test_allProblemTypes_noValidTimeRange() {
        for problem in ProblemType.allCases {
            #expect(problem.validTimeRange == nil, "\(problem.rawValue) should have nil validTimeRange")
        }
    }
}
