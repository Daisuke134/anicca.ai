//
//  ContentView.swift
//  aniccaios
//
//  Created by CBNS03 on 2025/11/02.
//

import SwiftUI

struct ContentView: View {
    @StateObject private var controller = VoiceSessionController()

    var body: some View {
        VStack(spacing: 24) {
            Text("Anicca Voice")
                .font(.system(size: 32, weight: .bold))

            Text(controller.connectionStatus.label)
                .font(.headline)

            Text(controller.connectionStatus.subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            sessionButton
        }
        .padding()
    }

    private var sessionButton: some View {
        let config = buttonConfig
        return Button(config.title) {
            config.action()
        }
        .buttonStyle(BorderedProminentButtonStyle())
        .controlSize(.large)
        .disabled(config.disabled)
    }

    private var buttonConfig: (title: String, disabled: Bool, action: () -> Void) {
        switch controller.connectionStatus {
        case .connected:
            return (
                title: "End Session",
                disabled: false,
                action: { controller.stop() }
            )
        case .connecting:
            return (
                title: "Connecting…",
                disabled: true,
                action: {}
            )
        case .disconnected:
            return (
                title: "Start Voice Session",
                disabled: false,
                action: { controller.start() }
            )
        }
    }
}

#Preview {
    ContentView()
}
