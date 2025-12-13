//
//  aniccaiosApp.swift
//  aniccaios
//
//  Created by CBNS03 on 2025/11/02.
//

import SwiftUI

@main
struct aniccaiosApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var appState = AppState.shared

    var body: some Scene {
        WindowGroup {
            ContentRouterView()
                .environmentObject(appState)
                // v0.3: 表示言語は userProfile.preferredLanguage に統一
                .environment(\.locale, Locale(identifier: appState.userProfile.preferredLanguage.rawValue))
                .tint(AppTheme.Colors.accent)
        }
    }
}
