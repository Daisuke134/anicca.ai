import XCTest
@testable import aniccaios

final class SensorAccessSyncServiceTests: XCTestCase {

    /// デフォルトのタイムアウトが5秒であることを確認
    func test_timeoutInterval_defaultIs5Seconds() async throws {
        // Given
        let service = SensorAccessSyncService.shared

        // When
        let timeout = await service.timeoutInterval

        // Then
        XCTAssertEqual(timeout, 5.0, "Default timeout should be 5 seconds")
    }

    /// タイムアウトが変更可能であることを確認（テスト用）
    func test_timeoutInterval_canBeModified() async throws {
        // Given
        let service = SensorAccessSyncService.shared
        let originalTimeout = await service.timeoutInterval

        // When
        await service.setTimeoutInterval(10.0)
        let newTimeout = await service.timeoutInterval

        // Then
        XCTAssertEqual(newTimeout, 10.0, "Timeout should be modifiable")

        // Cleanup: restore original
        await service.setTimeoutInterval(originalTimeout)
    }
}
