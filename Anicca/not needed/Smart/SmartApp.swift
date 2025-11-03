//
//  SmartApp.swift
//  Smart
//
//  Created by CBNS03 on 2025/10/31.
//

import SwiftUI

@main
struct SmartApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var audioController = AppAudioController()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(audioController)
                .task { await audioController.prepare() }
        }
        .onChange(of: scenePhase) { _, newPhase in
            audioController.handleScenePhase(newPhase)
        }
    }
}
