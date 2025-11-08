import Foundation

struct HabitPromptBuilder {
    private let promptsDirectory = "Prompts"

    // Legacy method for backward compatibility
    func buildWakePrompt(wakeTime: DateComponents?, date: Date) -> String {
        return buildPrompt(for: .wake, scheduledTime: wakeTime, now: date)
    }

    func buildPrompt(for habit: HabitType, scheduledTime: DateComponents?, now: Date) -> String {
        // Load common and habit-specific templates
        let commonTemplate = loadPrompt(named: "common")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let habitTemplate = loadPrompt(named: habit.promptFileName)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        
        // Merge templates
        let mergedTemplate = "\(commonTemplate)\n\n\(habitTemplate)"
        
        // Render with user profile data
        return render(template: mergedTemplate, habit: habit, scheduledTime: scheduledTime, now: now)
    }
    
    private func render(template: String, habit: HabitType, scheduledTime: DateComponents?, now: Date) -> String {
        let profile = AppState.shared.userProfile
        
        // Build replacement dictionary
        var replacements: [String: String] = [:]
        
        // Language
        replacements["LANGUAGE_LINE"] = profile.preferredLanguage.languageLine
        
        // User name
        let userName = profile.displayName.isEmpty ? "ユーザー" : profile.displayName
        replacements["USER_NAME"] = userName
        
        // Task time and description
        let timeString: String
        if let scheduled = scheduledTime,
           let hour = scheduled.hour,
           let minute = scheduled.minute {
            let formatter = DateFormatter()
            formatter.timeStyle = .short
            let calendar = Calendar.current
            var components = DateComponents()
            components.hour = hour
            components.minute = minute
            if let date = calendar.date(from: components) {
                timeString = formatter.string(from: date)
            } else {
                timeString = String(format: "%02d:%02d", hour, minute)
            }
        } else {
            let formatter = DateFormatter()
            formatter.timeStyle = .short
            timeString = formatter.string(from: now)
        }
        replacements["TASK_TIME"] = timeString
        
        let taskDescription: String
        switch habit {
        case .wake:
            taskDescription = "起床"
        case .training:
            taskDescription = "トレーニング"
        case .bedtime:
            taskDescription = "就寝"
        }
        replacements["TASK_DESCRIPTION"] = taskDescription
        
        // Habit-specific replacements
        switch habit {
        case .wake, .bedtime:
            if !profile.sleepLocation.isEmpty {
                replacements["SLEEP_LOCATION"] = profile.sleepLocation
            } else {
                replacements["SLEEP_LOCATION"] = "ベッド"
            }
        case .training:
            if !profile.trainingFocus.isEmpty {
                // 英語IDを日本語名に変換
                let japaneseNames = profile.trainingFocus.map { id in
                    switch id {
                    case "Push-up":
                        return "腕立て伏せ"
                    case "Core":
                        return "体幹"
                    case "Cardio":
                        return "有酸素"
                    case "Stretch":
                        return "ストレッチ"
                    default:
                        return id
                    }
                }
                replacements["TRAINING_FOCUS_LIST"] = japaneseNames.joined(separator: "、")
            } else {
                replacements["TRAINING_FOCUS_LIST"] = "トレーニング"
            }
        }
        
        // Perform replacements
        var result = template
        for (key, value) in replacements {
            result = result.replacingOccurrences(of: "${\(key)}", with: value)
        }
        
        // Remove any remaining placeholder patterns (shouldn't happen, but safety check)
        let placeholderPattern = "\\$\\{[^}]+\\}"
        if let regex = try? NSRegularExpression(pattern: placeholderPattern, options: []) {
            result = regex.stringByReplacingMatches(in: result, options: [], range: NSRange(location: 0, length: result.utf16.count), withTemplate: "")
        }
        
        // Fallback if result is empty
        if result.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            switch habit {
            case .wake:
                return profile.preferredLanguage == .ja ? "おはよう、\(userName)さん。" : "Good morning, \(userName)."
            case .training:
                return profile.preferredLanguage == .ja ? "\(userName)さん、トレーニングの時間です。" : "\(userName), it's time for your workout."
            case .bedtime:
                return profile.preferredLanguage == .ja ? "\(userName)さん、就寝時間です。" : "\(userName), it's bedtime."
            }
        }
        
        return result
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
        if let url = Bundle.main.url(forResource: name, withExtension: "txt") {
            return try? String(contentsOf: url, encoding: .utf8)
        }
        let fallback = Bundle.main.bundleURL
            .appendingPathComponent("Resources", isDirectory: true)
            .appendingPathComponent(promptsDirectory, isDirectory: true)
            .appendingPathComponent("\(name).txt")
        guard FileManager.default.fileExists(atPath: fallback.path) else { return nil }
        return try? String(contentsOf: fallback, encoding: .utf8)
    }
}
