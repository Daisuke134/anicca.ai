import Foundation

/// Cache for BehaviorSummary to enable instant display while loading fresh data
@MainActor
final class BehaviorSummaryCache {
    static let shared = BehaviorSummaryCache()
    
    private var cachedSummary: BehaviorSummary?
    private var cacheDate: Date?
    private let cacheValidity: TimeInterval = 24 * 60 * 60
    private var cachedLanguage: LanguagePreference?
    
    private init() {}
    
    var latest: BehaviorSummary? {
        guard cachedLanguage == AppState.shared.effectiveLanguage else {
            return nil
        }
        guard let cached = cachedSummary,
              let date = cacheDate,
              Date().timeIntervalSince(date) < cacheValidity else {
            return nil
        }
        return cached
    }
    
    func update(_ summary: BehaviorSummary) {
        cachedSummary = summary
        cacheDate = Date()
        cachedLanguage = AppState.shared.effectiveLanguage
    }
    
    func clear() {
        cachedSummary = nil
        cacheDate = nil
        cachedLanguage = nil
    }
}

