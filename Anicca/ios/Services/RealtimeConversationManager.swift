import Foundation
import RealtimeAPI

@MainActor
final class RealtimeConversationManager: ObservableObject {
	@Published private(set) var status: RealtimeAPI.Status = .disconnected
	@Published private(set) var messages: [Item.Message] = []
	@Published private(set) var isUserSpeaking = false
	@Published private(set) var isModelSpeaking = false
	@Published private(set) var isMuted = false
	@Published private(set) var lastServerErrorMessage: String?

	private var conversation: Conversation?
	private var observationTask: Task<Void, Never>?
	private var errorTask: Task<Void, Never>?

	func connect(ephemeralKey: String, instructions: String) async throws {
		disconnect()

		let conversation = Conversation()
		self.conversation = conversation
		bind(conversation)

		do {
			try await conversation.connect(ephemeralKey: ephemeralKey, model: .gptRealtime)
			try await conversation.whenConnected {
				try conversation.updateSession { session in
					session.instructions = instructions
					session.modalities = [.text, .audio]
					session.maxResponseOutputTokens = .inf
					session.temperature = 0.8
					session.audio = .init(
						input: .init(
							format: .init(rate: 16000, type: "pcm16"),
							noiseReduction: .nearField,
							transcription: .init(model: .gpt4oMini, language: "ja"),
							turnDetection: .serverVad(
								createResponse: true,
								idleTimeout: 5_000,
								interruptResponse: true,
								prefixPaddingMs: 300,
								silenceDurationMs: 500,
								threshold: 0.5
							)
						),
						output: .init(
							voice: .alloy,
							speed: 1.0,
							format: .init(rate: 24000, type: "pcm16")
						)
					)
				}
			}
		} catch {
			disconnect()
			throw error
		}
	}

	func disconnect() {
		observationTask?.cancel()
		errorTask?.cancel()
		observationTask = nil
		errorTask = nil

		conversation?.disconnect()
		conversation = nil

		status = .disconnected
		messages = []
		isUserSpeaking = false
		isModelSpeaking = false
		isMuted = false
	}

	func toggleMute() {
		guard let conversation else { return }
		conversation.muted.toggle()
		isMuted = conversation.muted
	}

	func sendText(_ text: String) throws {
		guard let conversation else { return }
		try conversation.send(from: .user, text: text)
	}

	private func bind(_ conversation: Conversation) {
		observationTask = Task { [weak self] in
			guard let self else { return }
			while !Task.isCancelled {
				await MainActor.run {
					self.status = conversation.status
					self.messages = conversation.messages
					self.isUserSpeaking = conversation.isUserSpeaking
					self.isModelSpeaking = conversation.isModelSpeaking
					self.isMuted = conversation.muted
				}
				try? await Task.sleep(for: .milliseconds(120))
			}
		}

		errorTask = Task { [weak self] in
			guard let self else { return }
			for await error in conversation.errors {
				await MainActor.run {
					self.lastServerErrorMessage = error.message
				}
			}
		}
	}
}
