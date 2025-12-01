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
                .tint(AppTheme.Colors.accent)
        }
    }
}
