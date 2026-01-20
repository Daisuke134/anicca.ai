//
//  aniccaiosApp.swift
//  aniccaios
//
//  Created by CBNS03 on 2025/11/02.
//

import Combine
import SwiftUI

@main
struct aniccaiosApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var appState = AppState.shared

    var body: some Scene {
        WindowGroup {
            ContentRouterView()
                .environmentObject(appState)
                // v3: OSロケールに追従（locale overrideを撤廃）
                .tint(AppTheme.Colors.accent)
                // AlarmKit「今日を始める」ボタンでOneScreenを開く
                .onReceive(
                    NotificationCenter.default.publisher(for: Notification.Name("OpenProblemOneScreen"))
                        .receive(on: DispatchQueue.main)
                ) { notification in
                    guard let userInfo = notification.userInfo,
                          let problemTypeRaw = userInfo["problemType"] as? String,
                          let problemType = ProblemType(rawValue: problemTypeRaw) else { return }

                    // OneScreenを表示
                    let content = NudgeContent.contentForToday(for: problemType)
                    appState.pendingNudgeCard = content
                }
        }
    }
}
