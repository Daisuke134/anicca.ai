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
        switch controller.connectionStatus {
        case .connected:
            Button("End Session") {
                controller.stop()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

        case .connecting:
            Button("Connecting…") {}
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(true)

        case .disconnected:
            Button("Start Voice Session") {
                controller.start()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
    }
}

#Preview {
    ContentView()
}
