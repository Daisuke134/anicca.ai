import Foundation

/// v0.3: `GET /api/mobile/behavior/summary` のレスポンス（migration-patch-v3.md 6.1 形に固定）
struct BehaviorSummary: Codable, Equatable {
    let todayInsight: String
    let highlights: Highlights
    let futureScenario: FutureScenario
    let timeline: [TimelineSegment]

    struct Highlights: Codable, Equatable {
        let wake: Highlight
        let screen: Highlight
        let workout: Highlight
        let rumination: Highlight
    }

    struct Highlight: Codable, Equatable {
        /// サーバー定義の状態（例: on_track / warning / missed / ok など）
        let status: String
        /// v0.3 UIでは「具体的な時間/回数/%」をカードに表示しないため、表示用途は限定（内部/詳細用）
        let label: String
    }

    struct FutureScenario: Codable, Equatable {
        let ifContinue: String
        let ifImprove: String
    }

    struct TimelineSegment: Codable, Equatable, Identifiable {
        enum SegmentType: String, Codable {
            case sleep
            case scroll
            case focus
            case activity
        }

        let type: SegmentType
        let start: String   // "HH:mm"
        let end: String     // "HH:mm"

        var id: String { "\(type.rawValue)-\(start)-\(end)" }
    }
}



