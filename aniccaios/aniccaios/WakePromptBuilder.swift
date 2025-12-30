import Foundation

struct HabitPromptBuilder {
    private let promptsDirectory = "Prompts"

    // Legacy method for backward compatibility
    func buildWakePrompt(wakeTime: DateComponents?, date: Date) -> String {
        return buildPrompt(for: .wake, scheduledTime: wakeTime, now: date)
    }

    func buildPrompt(for habit: HabitType, scheduledTime: DateComponents?, now: Date) -> String {
        let profile = AppState.shared.userProfile
        return buildPrompt(for: habit, scheduledTime: scheduledTime, now: now, profile: profile)
    }
    
    // DI化: AppState.sharedの直接参照を避け、UserProfileを引数として依存注入
    func buildPrompt(
        for habit: HabitType,
        scheduledTime: DateComponents?,
        now: Date,
        profile: UserProfile,
        customHabitName: String? = nil
    ) -> String {
        // Load common and habit-specific templates
        let commonTemplate = loadPrompt(named: "common")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let habitTemplate = loadPrompt(named: habit.promptFileName)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        
        // Merge templates
        let mergedTemplate = "\(commonTemplate)\n\n\(habitTemplate)"
        
        // Render with user profile data
        return render(template: mergedTemplate, habit: habit, scheduledTime: scheduledTime, now: now, profile: profile, customHabitName: customHabitName)
    }
    
    private func render(template: String, habit: HabitType, scheduledTime: DateComponents?, now: Date) -> String {
        let profile = AppState.shared.userProfile
        return render(template: template, habit: habit, scheduledTime: scheduledTime, now: now, profile: profile)
    }
    
    private func render(
        template: String,
        habit: HabitType,
        scheduledTime: DateComponents?,
        now: Date,
        profile: UserProfile,
        customHabitName: String? = nil
    ) -> String {
        
        // Build replacement dictionary
        var replacements: [String: String] = [:]
        
        // Language
        replacements["LANGUAGE_LINE"] = profile.preferredLanguage.languageLine
        
        // User name
        let userName = profile.displayName.isEmpty 
            ? NSLocalizedString("common_user_fallback", comment: "") 
            : profile.displayName
        replacements["USER_NAME"] = userName
        
        // Task time and description
        let timeString: String
        if let scheduled = scheduledTime,
           let hour = scheduled.hour,
           let minute = scheduled.minute {
            let calendar = Calendar.current
            var components = DateComponents()
            components.hour = hour
            components.minute = minute
            if let date = calendar.date(from: components) {
                timeString = date.formatted(.dateTime.hour().minute())
            } else {
                timeString = String(format: "%02d:%02d", hour, minute)
            }
        } else {
            timeString = now.formatted(.dateTime.hour().minute())
        }
        replacements["TASK_TIME"] = timeString
        
        let taskDescription: String
        switch habit {
        case .wake:
            taskDescription = NSLocalizedString("habit_title_wake", comment: "")
        case .training:
            taskDescription = NSLocalizedString("habit_title_training", comment: "")
        case .bedtime:
            taskDescription = NSLocalizedString("habit_title_bedtime", comment: "")
        case .custom:
            // 渡されたカスタム習慣名を優先し、なければ従来どおり先頭のカスタム習慣名にフォールバック
            taskDescription = customHabitName
                ?? CustomHabitStore.shared.displayName(
                    fallback: NSLocalizedString("habit_title_custom_fallback", comment: "")
                )
        }
        replacements["TASK_DESCRIPTION"] = taskDescription
        
        // Training focus (既存の処理)
        if habit == .training && !profile.trainingFocus.isEmpty {
            let localizedNames = profile.trainingFocus.map { id in
                switch id {
                case "Push-up":
                    return NSLocalizedString("training_focus_option_pushup", comment: "")
                case "Core":
                    return NSLocalizedString("training_focus_option_core", comment: "")
                case "Cardio":
                    return NSLocalizedString("training_focus_option_cardio", comment: "")
                case "Stretch":
                    return NSLocalizedString("training_focus_option_stretch", comment: "")
                default:
                    return id
                }
            }
            replacements["TRAINING_FOCUS_LIST"] = localizedNames.joined(separator: NSLocalizedString("common_list_separator", comment: ""))
        } else if habit == .training {
            replacements["TRAINING_FOCUS_LIST"] = NSLocalizedString("habit_title_training", comment: "")
        }
        
        // 新しいプレースホルダーの処理
        switch habit {
        case .wake:
            replacements["WAKE_LOCATION"] = profile.wakeLocation.isEmpty
                ? NSLocalizedString("common_wake_location_fallback", comment: "")
                : profile.wakeLocation
            
            if !profile.wakeRoutines.isEmpty {
                replacements["WAKE_ROUTINES"] = "理想的な起床後のルーティン: " + profile.wakeRoutines.joined(separator: "、")
            } else {
                replacements["WAKE_ROUTINES"] = ""
            }
            
        case .bedtime:
            replacements["SLEEP_LOCATION"] = profile.sleepLocation.isEmpty
                ? NSLocalizedString("common_sleep_location_fallback", comment: "")
                : profile.sleepLocation
            
            if !profile.sleepRoutines.isEmpty {
                replacements["SLEEP_ROUTINES"] = "理想的な就寝前のルーティン: " + profile.sleepRoutines.joined(separator: "、")
            } else {
                replacements["SLEEP_ROUTINES"] = ""
            }
            
        case .training:
            if !profile.trainingGoal.isEmpty {
                replacements["TRAINING_GOAL"] = profile.trainingGoal
            } else {
                // デフォルト: 腕立て伏せ10回（言語に応じて）
                replacements["TRAINING_GOAL"] = profile.preferredLanguage == .ja
                    ? "腕立て伏せ10回"
                    : "10 push-ups"
            }
            
        case .custom:
            break
        }
        
        // 理想の姿（全習慣で使用）- 言語設定に応じてプレフィックスをローカライズ
        if !profile.idealTraits.isEmpty {
            let localizedTraits = profile.idealTraits.map { NSLocalizedString("ideal_trait_\($0)", comment: "") }
            let prefix = profile.preferredLanguage == .ja
                ? "理想の姿として設定されている特性: "
                : "Ideal self traits: "
            let separator = profile.preferredLanguage == .ja ? "、" : ", "
            replacements["IDEAL_TRAITS"] = prefix + localizedTraits.joined(separator: separator)
        } else {
            replacements["IDEAL_TRAITS"] = ""
        }
        
        if !profile.problems.isEmpty {
            let localizedProblems = profile.problems.map { NSLocalizedString("problem_\($0)", comment: "") }
            let prefix = profile.preferredLanguage == .ja
                ? "今抱えている問題: "
                : "Current struggles: "
            let separator = profile.preferredLanguage == .ja ? "、" : ", "
            replacements["PROBLEMS"] = prefix + localizedProblems.joined(separator: separator)
        } else {
            replacements["PROBLEMS"] = ""
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
            case .custom:
                let name = CustomHabitStore.shared.displayName(
                    fallback: NSLocalizedString("habit_title_custom_fallback", comment: "")
                )
                return profile.preferredLanguage == .ja
                    ? "\(userName)さん、\(name)の時間です。"
                    : "\(userName), it's time for \(name)."
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
