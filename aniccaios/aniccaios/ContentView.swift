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
        if !appState.isOnboardingComplete {
            OnboardingFlowView()
        } else {
            switch appState.authStatus {
            case .signedOut:
                OnboardingFlowView()
            case .signingIn:
                AuthenticationProcessingView()
            case .signedIn:
                SessionView()
            }
        }
    }
}

struct AuthenticationProcessingView: View {
    var body: some View {
        VStack(spacing: 24) {
            ProgressView()
                .scaleEffect(1.5)
            Text("common_signing_in")
                .font(.headline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    ContentRouterView()
        .environmentObject(AppState.shared)
}
