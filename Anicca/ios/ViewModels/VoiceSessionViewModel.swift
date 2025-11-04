import AVFAudio
import Combine
import Foundation
import RealtimeAPI
import UIKit

@MainActor
final class VoiceSessionViewModel: ObservableObject {
	@Published private(set) var messages: [Item.Message] = []
	@Published private(set) var status: RealtimeAPI.Status = .disconnected
	@Published private(set) var isUserSpeaking = false
	@Published private(set) var isModelSpeaking = false
	@Published private(set) var isMuted = false
	@Published private(set) var isConnecting = false
	@Published var shouldShowSettingsAlert = false
	@Published var errorMessage: String?

	private let sessionService: RealtimeSessionService
	private let conversationManager: RealtimeConversationManager
	private var cancellables: Set<AnyCancellable> = []

	private let instructions = "あなたはAniccaのリアルタイム音声コーチです。短く鋭く、行動を促し、合図語で次のステップに進行してください。"

	init(
		sessionService: RealtimeSessionService = RealtimeSessionService(),
		conversationManager: RealtimeConversationManager = RealtimeConversationManager()
	) {
		self.sessionService = sessionService
		self.conversationManager = conversationManager

		conversationManager.$messages
			.receive(on: RunLoop.main)
			.sink { [weak self] in self?.messages = $0 }
			.store(in: &cancellables)

		conversationManager.$status
			.receive(on: RunLoop.main)
			.sink { [weak self] in self?.status = $0 }
			.store(in: &cancellables)

		conversationManager.$isUserSpeaking
			.receive(on: RunLoop.main)
			.sink { [weak self] in self?.isUserSpeaking = $0 }
			.store(in: &cancellables)

		conversationManager.$isModelSpeaking
			.receive(on: RunLoop.main)
			.sink { [weak self] in self?.isModelSpeaking = $0 }
			.store(in: &cancellables)

		conversationManager.$isMuted
			.receive(on: RunLoop.main)
			.sink { [weak self] in self?.isMuted = $0 }
			.store(in: &cancellables)

		conversationManager.$lastServerErrorMessage
			.receive(on: RunLoop.main)
			.sink { [weak self] message in
				guard let message else { return }
				self?.errorMessage = message
			}
			.store(in: &cancellables)
	}

	func startSession() {
		guard !isConnecting else { return }
		errorMessage = nil
		isConnecting = true

		Task { [weak self] in
			guard let self else { return }
			let granted = await MicrophonePermission.request()

			await MainActor.run {
				if !granted {
					self.isConnecting = false
					self.shouldShowSettingsAlert = true
				}
			}

			guard granted else { return }

			do {
				try configureAudioSession()
				let clientSecret = try await sessionService.fetchClientSecret()
				try await conversationManager.connect(ephemeralKey: clientSecret, instructions: instructions)
				await MainActor.run {
					self.isConnecting = false
				}
			} catch let error as RealtimeSessionService.ServiceError {
				await MainActor.run {
					self.errorMessage = error.errorDescription
					self.isConnecting = false
				}
			} catch {
				await MainActor.run {
					self.errorMessage = error.localizedDescription
					self.isConnecting = false
				}
			}
		}
	}

	func stopSession() {
		conversationManager.disconnect()
	}

	func toggleMute() {
		conversationManager.toggleMute()
	}

	func send(text: String) {
		let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !trimmed.isEmpty else { return }

		do {
			try conversationManager.sendText(trimmed)
		} catch {
			errorMessage = error.localizedDescription
		}
	}

	func openSettings() {
		guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
		UIApplication.shared.open(url)
	}

	private func configureAudioSession() throws {
		let audioSession = AVAudioSession.sharedInstance()
		try audioSession.setCategory(.playAndRecord, options: [.defaultToSpeaker, .allowBluetooth])
		try audioSession.setMode(.videoChat)
		try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
	}
}

private enum MicrophonePermission {
	static func request() async -> Bool {
		await withCheckedContinuation { continuation in
			AVAudioSession.sharedInstance().requestRecordPermission { granted in
				continuation.resume(returning: granted)
			}
		}
	}
}
