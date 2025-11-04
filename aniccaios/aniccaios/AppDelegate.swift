import UIKit
import UserNotifications
import AVFoundation

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        if ProcessInfo.processInfo.arguments.contains("-resetOnLaunch") {
            UserDefaults.standard.removePersistentDomain(forName: Bundle.main.bundleIdentifier ?? "")
            UserDefaults.standard.synchronize()
            AppState.shared.resetState()
        }
        UNUserNotificationCenter.current().delegate = self
        WakeNotificationScheduler.shared.registerCategories()
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        defer { completionHandler() }

        let identifier = response.actionIdentifier
        if identifier == "start_conversation" || identifier == UNNotificationDefaultActionIdentifier ||
           response.notification.request.identifier == "wake.alarm" {
            Task {
                try? AVAudioSession.sharedInstance().setCategory(
                    .playAndRecord,
                    options: [.defaultToSpeaker, .allowBluetoothA2DP, .allowBluetoothHFP]
                )
                try? AVAudioSession.sharedInstance().setActive(true, options: [.notifyOthersOnDeactivation])
                try? AVAudioSession.sharedInstance().overrideOutputAudioPort(.speaker)
                await MainActor.run {
                    AppState.shared.prepareForImmediateSession()
                }
            }
        }
    }
}
