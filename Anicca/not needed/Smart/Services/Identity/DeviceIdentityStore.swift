import Foundation
import OSLog
import Security

@MainActor
protocol DeviceIdentityProviding: AnyObject {
    var userId: String? { get }
}

@MainActor
final class DeviceIdentityStore: DeviceIdentityProviding {
    static let shared = DeviceIdentityStore()

    private let service = "com.anicca.smart.identity"
    private let account = "deviceUserId"
    private let logger = Logger(subsystem: "com.anicca.ios", category: "Identity")
    private(set) var userId: String?

    private init() {
        if let existing = loadIdentity() {
            userId = existing
            logger.debug("Loaded device identity from Keychain")
        } else if let generated = createAndPersistIdentity() {
            userId = generated
            logger.info("Generated new device identity")
        } else {
            userId = nil
            logger.error("Failed to initialize device identity")
        }
    }

    private func loadIdentity() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        switch status {
        case errSecSuccess:
            guard let data = item as? Data,
                  let value = String(data: data, encoding: .utf8),
                  !value.isEmpty else {
                logger.error("Device identity existed but decoding failed")
                return nil
            }
            return value
        case errSecItemNotFound:
            return nil
        default:
            logger.error("Keychain read failed: \(status, privacy: .public)")
            return nil
        }
    }

    private func createAndPersistIdentity() -> String? {
        let newValue = UUID().uuidString
        guard storeIdentity(newValue) else {
            logger.error("Keychain write failed for new device identity")
            return nil
        }
        return newValue
    }

    private func storeIdentity(_ value: String) -> Bool {
        let data = Data(value.utf8)

        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]

        SecItemDelete(baseQuery as CFDictionary)

        var insertQuery = baseQuery
        insertQuery[kSecValueData as String] = data

        let status = SecItemAdd(insertQuery as CFDictionary, nil)
        if status != errSecSuccess {
            logger.error("Keychain add failed: \(status, privacy: .public)")
            return false
        }

        return true
    }
}
