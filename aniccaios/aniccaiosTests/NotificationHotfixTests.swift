import XCTest
@testable import aniccaios

/// v1.5.1 通知システム修正テスト
/// P2: validTimeRange, P3: タイムスロット再設計, P5: Day 1 決定論的割り当て, P6: staying_up_late スケジュール
@MainActor
final class NotificationHotfixTests: XCTestCase {

    // MARK: - P3: 全67スロットがユニーク（バッティングゼロ）

    func test_allTimeSlotsAreUnique() {
        // 全13問題のスロットを収集
        var allSlots: [(problem: ProblemType, hour: Int, minute: Int)] = []
        for problem in ProblemType.allCases {
            for slot in problem.notificationSchedule {
                allSlots.append((problem: problem, hour: slot.hour, minute: slot.minute))
            }
        }

        // 時刻の重複チェック
        var seen: Set<String> = []
        var duplicates: [String] = []
        for slot in allSlots {
            let key = "\(slot.hour):\(String(format: "%02d", slot.minute))"
            if seen.contains(key) {
                duplicates.append("\(key) (\(slot.problem.rawValue))")
            }
            seen.insert(key)
        }

        XCTAssertTrue(duplicates.isEmpty, "Duplicate time slots found: \(duplicates.joined(separator: ", "))")
    }

    func test_totalSlotCountIs67() {
        let total = ProblemType.allCases.reduce(0) { $0 + $1.notificationSchedule.count }
        XCTAssertEqual(total, 67, "Total slots should be 67 (5×11 + 6×2)")
    }

    // MARK: - P3: スロット間の最低間隔（15分以上）

    func test_minimumGapBetweenSlots_is15minutes() {
        var allSlots: [(minutes: Int, problem: String)] = []
        for problem in ProblemType.allCases {
            for slot in problem.notificationSchedule {
                // 翌日スロット（0:00-1:30）は +1440 で計算
                let mins = slot.hour < 6 ? slot.hour * 60 + slot.minute + 1440 : slot.hour * 60 + slot.minute
                allSlots.append((minutes: mins, problem: problem.rawValue))
            }
        }
        allSlots.sort { $0.minutes < $1.minutes }

        for i in 1..<allSlots.count {
            let gap = allSlots[i].minutes - allSlots[i-1].minutes
            XCTAssertGreaterThanOrEqual(gap, 15,
                "Gap between \(allSlots[i-1].problem)@\(allSlots[i-1].minutes) and \(allSlots[i].problem)@\(allSlots[i].minutes) is only \(gap) minutes")
        }
    }

    // MARK: - P3: 同一問題内の最低間隔（30分以上、cantWakeUp wake window除く）

    func test_sameProblemGap_minimum30minutes() {
        for problem in ProblemType.allCases {
            let slots = problem.notificationSchedule.map { slot -> Int in
                slot.hour < 6 ? slot.hour * 60 + slot.minute + 1440 : slot.hour * 60 + slot.minute
            }.sorted()

            for i in 1..<slots.count {
                let gap = slots[i] - slots[i-1]
                // cantWakeUp wake window (6:00-6:30) は15分間隔許可
                if problem == .cantWakeUp && slots[i-1] >= 360 && slots[i] <= 390 {
                    XCTAssertGreaterThanOrEqual(gap, 15,
                        "\(problem.rawValue): gap between slots \(slots[i-1]) and \(slots[i]) is \(gap)min")
                } else {
                    XCTAssertGreaterThanOrEqual(gap, 30,
                        "\(problem.rawValue): gap between slots \(slots[i-1]) and \(slots[i]) is \(gap)min (minimum 30)")
                }
            }
        }
    }

    // MARK: - P2: validTimeRange

    func test_validTimeRange_sleepProblems() {
        // staying_up_late: 6:00-01:30
        let sul = ProblemType.stayingUpLate.validTimeRange
        XCTAssertNotNil(sul)
        XCTAssertEqual(sul?.startHour, 6)
        XCTAssertEqual(sul?.startMinute, 0)
        XCTAssertEqual(sul?.endHour, 1)
        XCTAssertEqual(sul?.endMinute, 31)

        // porn_addiction: 6:00-01:31 (exclusive, includes 1:30 slot)
        let pa = ProblemType.pornAddiction.validTimeRange
        XCTAssertNotNil(pa)
        XCTAssertEqual(pa?.startHour, 6)
        XCTAssertEqual(pa?.endHour, 1)
        XCTAssertEqual(pa?.endMinute, 31)
    }

    func test_validTimeRange_nonSleepProblems() {
        let nonSleep: [ProblemType] = [.cantWakeUp, .selfLoathing, .rumination, .procrastination,
                                        .anxiety, .lying, .badMouthing, .alcoholDependency,
                                        .anger, .obsessive, .loneliness]
        for problem in nonSleep {
            let range = problem.validTimeRange
            XCTAssertNotNil(range, "\(problem.rawValue) should have validTimeRange")
            XCTAssertEqual(range?.startHour, 6, "\(problem.rawValue) startHour")
            XCTAssertEqual(range?.endHour, 23, "\(problem.rawValue) endHour")
            XCTAssertEqual(range?.endMinute, 0, "\(problem.rawValue) endMinute")
        }
    }

    func test_isValidTime_crossesMidnight() {
        // staying_up_late: 6:00-01:30 (crosses midnight)
        let sul = ProblemType.stayingUpLate

        // 有効: 6:00, 20:00, 23:00, 0:00, 1:00, 1:29, 1:30
        XCTAssertTrue(sul.isValidTime(hour: 6, minute: 0))
        XCTAssertTrue(sul.isValidTime(hour: 20, minute: 0))
        XCTAssertTrue(sul.isValidTime(hour: 23, minute: 0))
        XCTAssertTrue(sul.isValidTime(hour: 0, minute: 0))
        XCTAssertTrue(sul.isValidTime(hour: 1, minute: 0))
        XCTAssertTrue(sul.isValidTime(hour: 1, minute: 29))
        XCTAssertTrue(sul.isValidTime(hour: 1, minute: 30))

        // 無効: 1:31, 2:00, 3:00, 5:59
        XCTAssertFalse(sul.isValidTime(hour: 1, minute: 31))
        XCTAssertFalse(sul.isValidTime(hour: 2, minute: 0))
        XCTAssertFalse(sul.isValidTime(hour: 3, minute: 0))
        XCTAssertFalse(sul.isValidTime(hour: 5, minute: 59))
    }

    func test_isValidTime_nonSleepProblem() {
        // anxiety: 6:00-23:00
        let anx = ProblemType.anxiety

        // 有効: 6:00, 12:00, 22:59
        XCTAssertTrue(anx.isValidTime(hour: 6, minute: 0))
        XCTAssertTrue(anx.isValidTime(hour: 12, minute: 0))
        XCTAssertTrue(anx.isValidTime(hour: 22, minute: 59))

        // 無効: 23:00, 23:15, 0:00, 5:59
        XCTAssertFalse(anx.isValidTime(hour: 23, minute: 0))
        XCTAssertFalse(anx.isValidTime(hour: 23, minute: 15))
        XCTAssertFalse(anx.isValidTime(hour: 0, minute: 0))
        XCTAssertFalse(anx.isValidTime(hour: 5, minute: 59))
    }

    func test_allSlotsWithinValidTimeRange() {
        // 全スロットが各問題の validTimeRange 内にあることを検証
        for problem in ProblemType.allCases {
            for slot in problem.notificationSchedule {
                XCTAssertTrue(problem.isValidTime(hour: slot.hour, minute: slot.minute),
                    "\(problem.rawValue) slot \(slot.hour):\(String(format: "%02d", slot.minute)) is outside validTimeRange")
            }
        }
    }

    // MARK: - P6: staying_up_late の新スケジュール

    func test_stayingUpLate_hasCorrectSlots() {
        let slots = ProblemType.stayingUpLate.notificationSchedule
        XCTAssertEqual(slots.count, 6, "staying_up_late should have 6 slots")

        let expected = [(20, 0), (21, 0), (22, 0), (23, 0), (0, 0), (1, 0)]
        for (i, exp) in expected.enumerated() {
            XCTAssertEqual(slots[i].hour, exp.0, "Slot \(i+1) hour")
            XCTAssertEqual(slots[i].minute, exp.1, "Slot \(i+1) minute")
        }
    }

    func test_stayingUpLate_noMoreSevenThirtyAM() {
        let slots = ProblemType.stayingUpLate.notificationSchedule
        let hasMorning = slots.contains { $0.hour == 7 && $0.minute == 30 }
        XCTAssertFalse(hasMorning, "staying_up_late should not have 7:30 AM slot")
    }

    // MARK: - P6: porn_addiction の新スケジュール

    func test_pornAddiction_hasCorrectSlots() {
        let slots = ProblemType.pornAddiction.notificationSchedule
        XCTAssertEqual(slots.count, 6, "porn_addiction should have 6 slots")

        let expected = [(20, 30), (21, 30), (22, 30), (23, 30), (0, 30), (1, 30)]
        for (i, exp) in expected.enumerated() {
            XCTAssertEqual(slots[i].hour, exp.0, "Slot \(i+1) hour")
            XCTAssertEqual(slots[i].minute, exp.1, "Slot \(i+1) minute")
        }
    }

    // MARK: - P3: 各問題タイプの正確なスロット

    func test_cantWakeUp_hasCorrectSlots() {
        let slots = ProblemType.cantWakeUp.notificationSchedule
        XCTAssertEqual(slots.count, 5)
        let expected = [(6, 0), (6, 15), (6, 30), (8, 0), (22, 15)]
        for (i, exp) in expected.enumerated() {
            XCTAssertEqual(slots[i].hour, exp.0, "cantWakeUp slot \(i+1) hour")
            XCTAssertEqual(slots[i].minute, exp.1, "cantWakeUp slot \(i+1) minute")
        }
    }

    func test_selfLoathing_hasCorrectSlots() {
        let slots = ProblemType.selfLoathing.notificationSchedule
        XCTAssertEqual(slots.count, 5)
        let expected = [(7, 0), (12, 0), (14, 45), (17, 0), (19, 0)]
        for (i, exp) in expected.enumerated() {
            XCTAssertEqual(slots[i].hour, exp.0, "selfLoathing slot \(i+1) hour")
            XCTAssertEqual(slots[i].minute, exp.1, "selfLoathing slot \(i+1) minute")
        }
    }

    func test_obsessive_hasCorrectSlots() {
        let slots = ProblemType.obsessive.notificationSchedule
        XCTAssertEqual(slots.count, 5)
        let expected = [(8, 45), (10, 30), (12, 15), (14, 15), (17, 45)]
        for (i, exp) in expected.enumerated() {
            XCTAssertEqual(slots[i].hour, exp.0, "obsessive slot \(i+1) hour")
            XCTAssertEqual(slots[i].minute, exp.1, "obsessive slot \(i+1) minute")
        }
    }

    // MARK: - P3: notificationVariantCount は全問題8以上（staying_up_late は10）

    func test_variantCount_allProblems() {
        XCTAssertEqual(ProblemType.stayingUpLate.notificationVariantCount, 10)
        XCTAssertEqual(ProblemType.pornAddiction.notificationVariantCount, 8)

        let eightVariantProblems: [ProblemType] = [.cantWakeUp, .selfLoathing, .rumination,
            .procrastination, .anxiety, .lying, .badMouthing, .alcoholDependency,
            .anger, .obsessive, .loneliness]
        for problem in eightVariantProblems {
            XCTAssertEqual(problem.notificationVariantCount, 8, "\(problem.rawValue) should have 8 variants")
        }
    }

    // MARK: - P5: Day 1 決定論的バリアント割り当て

    func test_day1DeterministicVariant_sequentialAssignment() {
        // Day 1: スロット順にバリアント 0,1,2,3,4 を割り当て
        // slotIndex 0 → variant 0, slotIndex 1 → variant 1, etc.
        let selector = NudgeContentSelector.shared

        // anxiety (5スロット) — Day 1
        for slotIndex in 0..<5 {
            let variant = selector.day1VariantIndex(for: .anxiety, slotIndex: slotIndex)
            XCTAssertEqual(variant, slotIndex, "anxiety Day 1 slot \(slotIndex) should be variant \(slotIndex)")
        }
    }

    func test_day1DeterministicVariant_stayingUpLate_timeAwareMapping() {
        let selector = NudgeContentSelector.shared

        // staying_up_late: スロット0-2は順番(0,1,2)、スロット3-5は時間対応(5,3,4)
        XCTAssertEqual(selector.day1VariantIndex(for: .stayingUpLate, slotIndex: 0), 0) // 20:00
        XCTAssertEqual(selector.day1VariantIndex(for: .stayingUpLate, slotIndex: 1), 1) // 21:00
        XCTAssertEqual(selector.day1VariantIndex(for: .stayingUpLate, slotIndex: 2), 2) // 22:00
        XCTAssertEqual(selector.day1VariantIndex(for: .stayingUpLate, slotIndex: 3), 5) // 23:00 → "Put down your phone"
        XCTAssertEqual(selector.day1VariantIndex(for: .stayingUpLate, slotIndex: 4), 3) // 0:00 → "It's past midnight"
        XCTAssertEqual(selector.day1VariantIndex(for: .stayingUpLate, slotIndex: 5), 4) // 1:00 → "It's 1 AM"
    }

    func test_day1_noDuplicateVariants() {
        // Day 1 で同じバリアントが2回以上使われないことを検証
        let selector = NudgeContentSelector.shared

        for problem in ProblemType.allCases {
            let slotCount = problem.notificationSchedule.count
            var usedVariants: Set<Int> = []
            var duplicates: [Int] = []

            for slotIndex in 0..<slotCount {
                let variant = selector.day1VariantIndex(for: problem, slotIndex: slotIndex)
                if usedVariants.contains(variant) {
                    duplicates.append(variant)
                }
                usedVariants.insert(variant)
            }

            XCTAssertTrue(duplicates.isEmpty,
                "\(problem.rawValue) Day 1 has duplicate variants: \(duplicates)")
        }
    }

    // MARK: - P4: usedVariants 重複排除

    func test_selectVariant_respectsUsedVariants() {
        let selector = NudgeContentSelector.shared

        // usedVariants に variant 0 を入れると、別のバリアントが選ばれるはず
        // Thompson Sampling でも usedVariants を除外する
        let result1 = selector.selectExistingVariantTestable(for: .anxiety, scheduledHour: 10, usedVariants: [0, 1, 2, 3, 4, 5, 6])
        // 全部使用済みだと唯一残りの variant 7 が返るはず
        XCTAssertEqual(result1, 7, "With variants 0-6 used, should select 7")
    }

    func test_selectVariant_allUsed_returnsFirst() {
        let selector = NudgeContentSelector.shared

        // 全バリアント使用済み → usedVariants クリアしてフォールバック
        let result = selector.selectExistingVariantTestable(for: .anxiety, scheduledHour: 10, usedVariants: Set(0..<8))
        // 全部使用済みの場合は Thompson Sampling がリセットして選択
        XCTAssertTrue((0..<8).contains(result), "Should still return a valid variant index")
    }
}
