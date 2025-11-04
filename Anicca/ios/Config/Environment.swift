import Foundation

enum Environment {
	private static let realtimeSessionURLString = ProcessInfo.processInfo.environment["ANICCA_REALTIME_SESSION_URL"] ?? "https://YOUR_API_HOST/realtime/session"

	static var realtimeSessionURL: URL {
		guard let url = URL(string: realtimeSessionURLString) else {
			preconditionFailure("Realtime session endpoint is invalid. Update Environment.realtimeSessionURLString before building.")
		}
		return url
	}

	static let realtimeRequestTimeout: TimeInterval = 15
}
