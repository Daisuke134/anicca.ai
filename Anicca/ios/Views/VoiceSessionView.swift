import SwiftUI
import RealtimeAPI

struct VoiceSessionView: View {
	@StateObject private var viewModel = VoiceSessionViewModel()
	@State private var textInput: String = ""
	@State private var shouldScrollToBottom = false

	var body: some View {
		NavigationStack {
			VStack(spacing: 16) {
				statusSection
				messagesSection
				inputSection
			}
			.padding()
			.navigationTitle("音声セッション")
		}
		.alert("マイクアクセスが必要です", isPresented: $viewModel.shouldShowSettingsAlert) {
			Button("設定を開く") { viewModel.openSettings() }
			Button("閉じる", role: .cancel) {}
		} message: {
			Text("設定アプリでマイク権限を有効にしてください。")
		}
	}

	private var statusSection: some View {
		VStack(alignment: .leading, spacing: 8) {
			HStack {
				Label(viewModel.status.description, systemImage: viewModel.status.systemImage)
					.foregroundStyle(viewModel.status.color)
				Spacer()
				if viewModel.isConnecting {
					ProgressView()
				}
			}

			hStackStatus(label: "ユーザー", isActive: viewModel.isUserSpeaking, activeColor: .blue)
			hStackStatus(label: "モデル", isActive: viewModel.isModelSpeaking, activeColor: .purple)

			if viewModel.isMuted {
				Label("ミュート中", systemImage: "speaker.slash")
					.font(.footnote)
					.foregroundStyle(.secondary)
			}

			if let error = viewModel.errorMessage {
				Text(error)
					.font(.footnote)
					.foregroundStyle(.red)
			}

			buttonRow
		}
	}

	private var messagesSection: some View {
		ScrollViewReader { proxy in
			ScrollView {
				LazyVStack(alignment: .leading, spacing: 12) {
					ForEach(viewModel.messages, id: \.id) { message in
						messageRow(for: message)
					}
				}
			}
			.background(Color(.secondarySystemBackground))
			.clipShape(RoundedRectangle(cornerRadius: 12))
			.onChange(of: viewModel.messages.count) { _ in
				if let last = viewModel.messages.last?.id {
					withAnimation {
						proxy.scrollTo(last, anchor: .bottom)
					}
				}
			}
		}
		.frame(maxHeight: .infinity)
	}

	private func messageRow(for message: Item.Message) -> some View {
		VStack(alignment: .leading, spacing: 4) {
			Text(message.role.localizedCaption)
				.font(.caption)
				.foregroundStyle(message.role == .user ? Color.blue : Color.purple)
			Text(message.content.compactMap { $0.text }.joined(separator: "\n"))
				.frame(maxWidth: .infinity, alignment: .leading)
		}
		.padding(12)
	}

	private var inputSection: some View {
		HStack(spacing: 12) {
			TextField("テキストを送信", text: $textInput, axis: .vertical)
				.textFieldStyle(.roundedBorder)
				.disabled(viewModel.status != .connected)
			Button("送信") {
				viewModel.send(text: textInput)
				textInput = ""
			}
			.disabled(viewModel.status != .connected || textInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
		}
	}

	private var buttonRow: some View {
		HStack(spacing: 12) {
			Button(viewModel.status == .connected ? "切断" : "接続") {
				if viewModel.status == .connected {
					viewModel.stopSession()
				} else {
					viewModel.startSession()
				}
			}
			.buttonStyle(.borderedProminent)
			.disabled(viewModel.isConnecting)

			Button(viewModel.isMuted ? "ミュート解除" : "ミュート") {
				viewModel.toggleMute()
			}
			.buttonStyle(.bordered)
			.disabled(viewModel.status != .connected)
		}
	}

	private func hStackStatus(label: String, isActive: Bool, activeColor: Color) -> some View {
		HStack {
			Circle()
				.fill(isActive ? activeColor : Color.gray.opacity(0.4))
				.frame(width: 12, height: 12)
			Text(label)
				.font(.footnote)
				.foregroundStyle(.secondary)
			Spacer()
		}
	}
}

private extension RealtimeAPI.Status {
	var description: String {
		switch self {
		case .connected: return "接続済み"
		case .connecting: return "接続中"
		case .disconnected: return "未接続"
		}
	}

	var systemImage: String {
		switch self {
		case .connected: return "checkmark.circle.fill"
		case .connecting: return "bolt.horizontal.circle.fill"
		case .disconnected: return "xmark.circle.fill"
		}
	}

	var color: Color {
		switch self {
		case .connected: return .green
		case .connecting: return .yellow
		case .disconnected: return .red
		}
	}
}

private extension Item.Message.Role {
	var localizedCaption: String {
		switch self {
		case .user: return "あなた"
		case .assistant: return "アニッチャ"
		case .system: return "システム"
		}
	}
}

#Preview {
	VoiceSessionView()
}
