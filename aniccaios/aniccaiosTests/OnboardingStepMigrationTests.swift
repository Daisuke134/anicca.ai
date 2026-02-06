// OnboardingStepMigrationTests.swift
// Soft Paywall: OnboardingStep enum + legacy migration tests

import XCTest
@testable import aniccaios

final class OnboardingStepMigrationTests: XCTestCase {

    // MARK: - New Enum Raw Values

    func test_welcome_rawValue_is0() {
        XCTAssertEqual(OnboardingStep.welcome.rawValue, 0)
    }

    func test_struggles_rawValue_is1() {
        XCTAssertEqual(OnboardingStep.struggles.rawValue, 1)
    }

    func test_liveDemo_rawValue_is2() {
        XCTAssertEqual(OnboardingStep.liveDemo.rawValue, 2)
    }

    func test_notifications_rawValue_is3() {
        XCTAssertEqual(OnboardingStep.notifications.rawValue, 3)
    }

    // MARK: - Legacy Migration (v1.6.0 以前)

    func test_migration_raw0_returnsWelcome() {
        XCTAssertEqual(OnboardingStep.migratedFromLegacyRawValue(0), .welcome)
    }

    func test_migration_raw1_returnsStruggles() {
        // 旧 value(1) → struggles（value 削除のため）
        XCTAssertEqual(OnboardingStep.migratedFromLegacyRawValue(1), .struggles)
    }

    func test_migration_raw2_returnsStruggles() {
        // 旧 struggles(2) → struggles（legacy only、新.liveDemoと衝突するため明示検証）
        XCTAssertEqual(OnboardingStep.migratedFromLegacyRawValue(2), .struggles)
    }

    func test_migration_raw3_returnsNotifications() {
        // v1.6.0 の .notifications=3 を保護（現行ユーザー優先）
        XCTAssertEqual(OnboardingStep.migratedFromLegacyRawValue(3), .notifications)
    }

    func test_migration_raw4_returnsNotifications() {
        // v1.6.0の.att → notifications（ATT削除後）
        XCTAssertEqual(OnboardingStep.migratedFromLegacyRawValue(4), .notifications)
    }

    func test_migration_raw5_returnsStruggles() {
        // 旧 name → struggles
        XCTAssertEqual(OnboardingStep.migratedFromLegacyRawValue(5), .struggles)
    }

    func test_migration_raw6_returnsStruggles() {
        // 旧 gender → struggles
        XCTAssertEqual(OnboardingStep.migratedFromLegacyRawValue(6), .struggles)
    }

    func test_migration_raw7_returnsStruggles() {
        // 旧 age → struggles
        XCTAssertEqual(OnboardingStep.migratedFromLegacyRawValue(7), .struggles)
    }

    func test_migration_raw8_returnsStruggles() {
        // 旧 ideals → struggles
        XCTAssertEqual(OnboardingStep.migratedFromLegacyRawValue(8), .struggles)
    }

    func test_migration_raw9to12_returnsNotifications() {
        for raw in 9...12 {
            XCTAssertEqual(
                OnboardingStep.migratedFromLegacyRawValue(raw),
                .notifications,
                "rawValue \(raw) should map to .notifications"
            )
        }
    }

    func test_migration_rawNegative_returnsWelcome() {
        XCTAssertEqual(OnboardingStep.migratedFromLegacyRawValue(-1), .welcome)
    }

    func test_migration_rawLargeValue_returnsWelcome() {
        XCTAssertEqual(OnboardingStep.migratedFromLegacyRawValue(999), .welcome)
    }

    // MARK: - Value case should not exist

    func test_value_case_doesNotExist() {
        // OnboardingStep(rawValue: 1) should be .struggles, not .value
        let step = OnboardingStep(rawValue: 1)
        XCTAssertEqual(step, .struggles)
    }
}
