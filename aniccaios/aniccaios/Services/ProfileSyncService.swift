import Foundation
import OSLog

actor ProfileSyncService {
    static let shared = ProfileSyncService()
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "ProfileSyncService")
    private var pendingSync: UserProfile?
    private var isSyncing = false
    
    private init() {}
    
    func enqueue(profile: UserProfile) async {
        guard case .signedIn = AppState.shared.authStatus else {
            logger.debug("Not signed in, skipping profile sync")
            return
        }
        
        pendingSync = profile
        
        guard !isSyncing else {
            logger.debug("Sync already in progress, queued profile will be synced next")
            return
        }
        
        await performSync()
    }
    
    private func performSync() async {
        guard let profile = pendingSync else {
            isSyncing = false
            return
        }
        
        isSyncing = true
        
        guard case .signedIn(let credentials) = AppState.shared.authStatus else {
            logger.warning("Lost authentication during sync")
            isSyncing = false
            pendingSync = nil
            return
        }
        
        let deviceId = AppState.shared.resolveDeviceId()
        
        do {
            try await syncProfile(
                deviceId: deviceId,
                userId: credentials.userId,
                profile: profile
            )
            
            pendingSync = nil
            isSyncing = false
            
            logger.info("Profile synced successfully")
        } catch {
            logger.error("Profile sync failed: \(error.localizedDescription, privacy: .public)")
            isSyncing = false
            // Keep pendingSync for retry
        }
    }
    
    private func syncProfile(
        deviceId: String,
        userId: String,
        profile: UserProfile
    ) async throws {
        var request = URLRequest(url: AppConfig.profileSyncURL)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(deviceId, forHTTPHeaderField: "device-id")
        request.setValue(userId, forHTTPHeaderField: "user-id")
        
        logger.debug("Syncing profile for device: \(deviceId), user: \(userId)")
        
        let payload: [String: Any] = [
            "displayName": profile.displayName,
            "preferredLanguage": profile.preferredLanguage.rawValue,
            "sleepLocation": profile.sleepLocation,
            "trainingFocus": profile.trainingFocus
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ProfileSyncError.invalidResponse
        }
        
        guard (200..<300).contains(httpResponse.statusCode) else {
            let statusCode = httpResponse.statusCode
            if let errorData = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = errorData["error"] as? String {
                logger.error("Sync failed with status \(statusCode): \(message, privacy: .public)")
            }
            throw ProfileSyncError.httpError(statusCode)
        }
    }
    
    func retryPendingSyncIfNeeded() async {
        guard pendingSync != nil, !isSyncing else { return }
        await performSync()
    }
}

enum ProfileSyncError: Error {
    case invalidResponse
    case httpError(Int)
}

