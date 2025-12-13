import Foundation

/// Sends daily aggregates to backend (daily_metrics).
/// Target time: ~03:00 UTC, but iOS scheduling is best-effort.
///
/// Primary sources for scheduling constraints:
/// - BGTask registration must finish by app launch end:
///   https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler/register(fortaskwithidentifier:using:launchhandler:)/
/// - earliestBeginDate is NOT guaranteed:
///   https://developer.apple.com/documentation/backgroundtasks/bgtaskrequest/earliestbegindate/
/// - Background tasks overview:
///   https://developer.apple.com/documentation/uikit/using-background-tasks-to-update-your-app/
@MainActor
final class MetricsUploader {
    static let shared = MetricsUploader()
    private init() {}

    /// BGTask identifier (must be in BGTaskSchedulerPermittedIdentifiers).
    static let taskId = "com.anicca.metrics.daily"

    func scheduleNextIfPossible() {
        // import BackgroundTasks
        // BGAppRefreshTaskRequest(identifier: Self.taskId).earliestBeginDate = ...
        // BGTaskScheduler.shared.submit(request)
    }

    func runUploadIfDue() async {
        // Quiet fallback: if not signed-in, return.
        // Gather cached data from sensors (only enabled ones).
        // POST /api/mobile/daily_metrics (endpoint name from ios-sensors-spec-v3.md; server side to implement)
    }
}

