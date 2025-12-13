import Foundation

// NOTE:
// Primary sources:
// - enableBackgroundDelivery: https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)/
// - completion handler MUST be called (backoff; 3 failures stops delivery):
//   https://developer.apple.com/documentation/healthkit/hkobserverquerycompletionhandler/
// - Observer queries best practices (set up at app launch):
//   https://developer.apple.com/documentation/healthkit/executing-observer-queries/

final class HealthKitManager {
    static let shared = HealthKitManager()
    private init() {}

    /// Quiet fallback:
    /// - Only call requestAuthorization when user toggles ON (Sleep/Steps).
    func requestAuthorizationForSleepAndSteps() async throws {
        // import HealthKit
        // guard HKHealthStore.isHealthDataAvailable() else { throw ... }
        // try await HKHealthStore().requestAuthorization(toShare: [], read: typesToRead)
    }

    /// If authorized + enabled, set up observer queries and background delivery on launch.
    /// Call completion handler ASAP (see Apple docs) and do minimal work.
    func configureOnLaunchIfEnabled() {
        // import HealthKit
        // create HKObserverQuery for sleep/steps
        // healthStore.execute(query)
        // healthStore.enableBackgroundDelivery(for:..., frequency: .hourly, ...)
    }

    /// Returns local cached aggregates (yesterday) for MetricsUploader.
    func loadCachedDailyMetrics(forLocalDate localDate: String) -> (sleepDurationMin: Int?, wakeAtISO8601: String?, steps: Int?) {
        return (nil, nil, nil)
    }
}

