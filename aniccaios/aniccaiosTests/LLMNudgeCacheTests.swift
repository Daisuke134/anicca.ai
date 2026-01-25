import Testing
@testable import aniccaios

@MainActor
struct LLMNudgeCacheTests {

    // MARK: - Test Helpers

    private var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    /// テスト用ヘルパー: LLMGeneratedNudgeを作成（JSONデコード経由）
    private func makeTestNudge(
        id: String = "test-123",
        problemType: ProblemType = .cantWakeUp,
        scheduledHour: Int = 7,
        hook: String = "起きろ",
        content: String = "今日も頑張ろう"
    ) throws -> LLMGeneratedNudge {
        let json = """
        {
            "id": "\(id)",
            "problemType": "\(problemType.rawValue)",
            "scheduledHour": \(scheduledHour),
            "hook": "\(hook)",
            "content": "\(content)",
            "tone": "strict",
            "reasoning": "test",
            "createdAt": "2026-01-24T05:00:00Z"
        }
        """.data(using: .utf8)!
        return try decoder.decode(LLMGeneratedNudge.self, from: json)
    }

    // MARK: - Basic Cache Tests

    @Test("Set and get nudge from cache")
    func test_LLMNudgeCache_setAndGet() async throws {
        let cache = LLMNudgeCache.shared
        cache.clear()

        let nudge = try makeTestNudge()
        cache.setNudges([nudge])

        let retrieved = cache.getNudge(for: .cantWakeUp, hour: 7)
        #expect(retrieved != nil)
        #expect(retrieved?.id == "test-123")
        #expect(retrieved?.problemType == .cantWakeUp)
        #expect(retrieved?.scheduledHour == 7)
    }

    @Test("Return nil for missing nudge")
    func test_LLMNudgeCache_missingNudge() async {
        let cache = LLMNudgeCache.shared
        cache.clear()

        let retrieved = cache.getNudge(for: .cantWakeUp, hour: 7)
        #expect(retrieved == nil)
    }

    @Test("Clear removes all nudges")
    func test_LLMNudgeCache_clear() async throws {
        let cache = LLMNudgeCache.shared
        cache.clear()

        // Add nudges
        let nudge1 = try makeTestNudge(id: "nudge-1", problemType: .cantWakeUp, scheduledHour: 7)
        let nudge2 = try makeTestNudge(id: "nudge-2", problemType: .stayingUpLate, scheduledHour: 23)
        cache.setNudges([nudge1, nudge2])

        // Verify they exist
        #expect(cache.getNudge(for: .cantWakeUp, hour: 7) != nil)
        #expect(cache.getNudge(for: .stayingUpLate, hour: 23) != nil)

        // Clear and verify
        cache.clear()
        #expect(cache.getNudge(for: .cantWakeUp, hour: 7) == nil)
        #expect(cache.getNudge(for: .stayingUpLate, hour: 23) == nil)
    }

    // MARK: - Multiple Nudge Tests

    @Test("Store multiple nudges for different problems")
    func test_LLMNudgeCache_multipleProblems() async throws {
        let cache = LLMNudgeCache.shared
        cache.clear()

        let nudge1 = try makeTestNudge(id: "wake-up", problemType: .cantWakeUp, scheduledHour: 7)
        let nudge2 = try makeTestNudge(id: "stay-up", problemType: .stayingUpLate, scheduledHour: 23)
        let nudge3 = try makeTestNudge(id: "anxiety", problemType: .anxiety, scheduledHour: 14)

        cache.setNudges([nudge1, nudge2, nudge3])

        #expect(cache.getNudge(for: .cantWakeUp, hour: 7)?.id == "wake-up")
        #expect(cache.getNudge(for: .stayingUpLate, hour: 23)?.id == "stay-up")
        #expect(cache.getNudge(for: .anxiety, hour: 14)?.id == "anxiety")
    }

    @Test("Store multiple nudges for same problem at different hours")
    func test_LLMNudgeCache_sameProbleDifferentHours() async throws {
        let cache = LLMNudgeCache.shared
        cache.clear()

        let nudge1 = try makeTestNudge(id: "wake-7", problemType: .cantWakeUp, scheduledHour: 7)
        let nudge2 = try makeTestNudge(id: "wake-8", problemType: .cantWakeUp, scheduledHour: 8)

        cache.setNudges([nudge1, nudge2])

        #expect(cache.getNudge(for: .cantWakeUp, hour: 7)?.id == "wake-7")
        #expect(cache.getNudge(for: .cantWakeUp, hour: 8)?.id == "wake-8")
        #expect(cache.getNudge(for: .cantWakeUp, hour: 9) == nil)
    }

    @Test("Overwrite existing nudge with same key")
    func test_LLMNudgeCache_overwrite() async throws {
        let cache = LLMNudgeCache.shared
        cache.clear()

        let nudge1 = try makeTestNudge(id: "original", problemType: .cantWakeUp, scheduledHour: 7)
        cache.setNudges([nudge1])
        #expect(cache.getNudge(for: .cantWakeUp, hour: 7)?.id == "original")

        let nudge2 = try makeTestNudge(id: "updated", problemType: .cantWakeUp, scheduledHour: 7)
        cache.setNudges([nudge2])
        #expect(cache.getNudge(for: .cantWakeUp, hour: 7)?.id == "updated")
    }

    // MARK: - Edge Cases

    @Test("Handle edge hour values")
    func test_LLMNudgeCache_edgeHours() async throws {
        let cache = LLMNudgeCache.shared
        cache.clear()

        let nudge0 = try makeTestNudge(id: "hour-0", problemType: .stayingUpLate, scheduledHour: 0)
        let nudge23 = try makeTestNudge(id: "hour-23", problemType: .stayingUpLate, scheduledHour: 23)

        cache.setNudges([nudge0, nudge23])

        #expect(cache.getNudge(for: .stayingUpLate, hour: 0)?.id == "hour-0")
        #expect(cache.getNudge(for: .stayingUpLate, hour: 23)?.id == "hour-23")
    }

    @Test("Empty nudges array does not crash")
    func test_LLMNudgeCache_emptyArray() async {
        let cache = LLMNudgeCache.shared
        cache.clear()

        cache.setNudges([])
        #expect(cache.getNudge(for: .cantWakeUp, hour: 7) == nil)
    }
}

