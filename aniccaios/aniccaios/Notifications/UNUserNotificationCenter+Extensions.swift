import UserNotifications

extension UNUserNotificationCenter {
    /// Post a launch shortcut notification for background app launch
    func postLaunchShortcut(habit: HabitType) async {
        let appGroupDefaults = AppGroup.userDefaults
        appGroupDefaults.set(habit.rawValue, forKey: "pending_habit_launch_habit")
        appGroupDefaults.set(Date().timeIntervalSince1970, forKey: "pending_habit_launch_ts")
    }
}




