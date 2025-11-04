//
//  ContentView.swift
//  aniccaios
//
//  Created by CBNS03 on 2025/11/02.
//

import SwiftUI

struct ContentRouterView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        if appState.isOnboardingComplete {
            SessionView()
        } else {
            OnboardingFlowView()
        }
    }
}

#Preview {
    ContentRouterView()
        .environmentObject(AppState.shared)
}
