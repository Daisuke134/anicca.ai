import Foundation

/// Rate limiter for throttling events (e.g., 32 Hz limit for AlarmKit reporting)
actor RateLimiter {
    private let eventsPerSecond: Double
    private var lastEventTime: Date?
    private let minInterval: TimeInterval
    
    init(eventsPerSecond: Double) {
        self.eventsPerSecond = eventsPerSecond
        self.minInterval = 1.0 / eventsPerSecond
    }
    
    /// Wait if necessary to respect rate limit, then proceed
    func tick() async {
        let now = Date()
        if let last = lastEventTime {
            let elapsed = now.timeIntervalSince(last)
            if elapsed < minInterval {
                let waitTime = minInterval - elapsed
                try? await Task.sleep(nanoseconds: UInt64(waitTime * 1_000_000_000))
            }
        }
        lastEventTime = Date()
    }
}






