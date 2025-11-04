import Foundation

struct WakePromptBuilder {
    private let promptsDirectory = "Prompts"

    func buildWakePrompt(wakeTime: DateComponents?, date: Date) -> String {
        let wakeTemplate = loadPrompt(named: "wake_up")?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let prompt = wakeTemplate, !prompt.isEmpty else {
            return "Wake up."
        }
        return prompt
    }

    private func normalizedComponents(from components: DateComponents?, fallbackDate: Date) -> DateComponents {
        if let hour = components?.hour, let minute = components?.minute {
            var result = DateComponents()
            result.hour = hour
            result.minute = minute
            return result
        }
        let calendar = Calendar.current
        let derived = calendar.dateComponents([.hour, .minute], from: fallbackDate)
        var result = DateComponents()
        result.hour = derived.hour
        result.minute = derived.minute
        return result
    }

    private func formattedHHMM(from components: DateComponents) -> String {
        let hour = components.hour ?? 0
        let minute = components.minute ?? 0
        return String(format: "%02d%02d", hour, minute)
    }

    private func loadPrompt(named name: String) -> String? {
        guard let url = Bundle.main.url(
            forResource: name,
            withExtension: "txt",
            subdirectory: promptsDirectory
        ) else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }
}
