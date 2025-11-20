import Foundation

struct CustomHabitConfiguration: Codable, Equatable {
    let name: String
    let updatedAt: Date

    init(name: String, updatedAt: Date = Date()) {
        self.name = name
        self.updatedAt = updatedAt
    }
}

final class CustomHabitStore {
    static let shared = CustomHabitStore()

    private let defaults = UserDefaults.standard
    private let storageKey = "com.anicca.customHabit"

    private init() {}

    func load() -> CustomHabitConfiguration? {
        guard let data = defaults.data(forKey: storageKey) else { return nil }
        return try? JSONDecoder().decode(CustomHabitConfiguration.self, from: data)
    }

    func save(_ configuration: CustomHabitConfiguration?) {
        if let configuration,
           let data = try? JSONEncoder().encode(configuration) {
            defaults.set(data, forKey: storageKey)
        } else {
            defaults.removeObject(forKey: storageKey)
        }
        defaults.synchronize()
    }

    func displayName(fallback: String) -> String {
        guard let name = load()?.name, !name.isEmpty else {
            return fallback
        }
        return name
    }
}


