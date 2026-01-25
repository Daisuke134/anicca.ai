import Foundation

/// LLM生成Nudgeのトーン
enum NudgeTone: String, Codable, CaseIterable {
    case strict
    case gentle
    case logical
    case provocative
    case philosophical
    case unknown  // 未知値のフォールバック

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let rawValue = try container.decode(String.self)
        self = NudgeTone(rawValue: rawValue) ?? .unknown
    }
}

/// LLM生成されたNudgeコンテンツ
struct LLMGeneratedNudge: Codable {
    let id: String
    let problemType: ProblemType
    let scheduledHour: Int
    let hook: String               // 通知テキスト（25文字以内）
    let content: String            // OneScreenテキスト（80文字以内）
    let tone: NudgeTone
    let reasoning: String          // LLMの判断理由
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, problemType, scheduledHour, hook, content, tone, reasoning, createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)

        // problemTypeはAPIが文字列で返すので、ProblemType enumに変換
        let problemTypeString = try container.decode(String.self, forKey: .problemType)
        guard let problemType = ProblemType(rawValue: problemTypeString) else {
            throw DecodingError.dataCorruptedError(
                forKey: .problemType,
                in: container,
                debugDescription: "Unknown problemType: \(problemTypeString)"
            )
        }
        self.problemType = problemType

        scheduledHour = try container.decode(Int.self, forKey: .scheduledHour)
        hook = try container.decode(String.self, forKey: .hook)
        content = try container.decode(String.self, forKey: .content)
        tone = try container.decode(NudgeTone.self, forKey: .tone)
        reasoning = try container.decode(String.self, forKey: .reasoning)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
    }
}

