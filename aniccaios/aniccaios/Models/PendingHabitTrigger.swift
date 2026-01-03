import Foundation

struct PendingHabitTrigger: Equatable {
    let id: UUID
    let habit: HabitType
    let customHabitId: UUID?   // カスタム習慣の場合にID
    let customHabitName: String?  // カスタム習慣の場合に名前

    init(id: UUID = UUID(), habit: HabitType, customHabitId: UUID? = nil, customHabitName: String? = nil) {
        self.id = id
        self.habit = habit
        self.customHabitId = customHabitId
        self.customHabitName = customHabitName
    }
}

