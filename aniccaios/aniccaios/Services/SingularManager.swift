import Foundation
import UIKit
import AdSupport
import AppTrackingTransparency
import OSLog
import Singular

@MainActor
final class SingularManager {
    static let shared = SingularManager()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "Singular")
    private var isConfigured = false
    
    private init() {}
    
    /// Singular SDKを初期化（ATT応答を最大300秒待機）
    /// - Note: AppDelegateの didFinishLaunchingWithOptions から呼び出す
    func configure(launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) {
        guard !isConfigured else {
            logger.debug("Singular SDK already configured, skipping")
            return
        }
        
        guard let config = SingularConfig(
            apiKey: AppConfig.singularSDKKey,
            andSecret: AppConfig.singularSDKSecret
        ) else {
            logger.error("Failed to create SingularConfig - check SDK Key and Secret")
            return
        }
        
        // ATTプロンプトの応答を最大300秒待機（Singular公式推奨）
        config.waitForTrackingAuthorizationWithTimeoutInterval = 300
        
        // launchOptionsを渡す（ディープリンク属性に必要）
        if let launchOptions = launchOptions {
            config.launchOptions = launchOptions
        }
        
        // SKAdNetworkはSDK 12.0.6以降デフォルト有効のため設定不要
        
        Singular.start(config)
        isConfigured = true
        logger.info("Singular SDK initialized successfully")
    }
    
    /// ATT許可状態を取得
    var trackingAuthorizationStatus: ATTrackingManager.AuthorizationStatus {
        ATTrackingManager.trackingAuthorizationStatus
    }
    
    /// IDFAを取得（許可されている場合のみ）
    var idfa: String? {
        guard trackingAuthorizationStatus == .authorized else { return nil }
        let idfa = ASIdentifierManager.shared().advertisingIdentifier.uuidString
        return idfa == "00000000-0000-0000-0000-000000000000" ? nil : idfa
    }
    
    /// IDFVを取得
    var idfv: String? {
        UIDevice.current.identifierForVendor?.uuidString
    }
    
    /// カスタムイベントを送信
    func trackEvent(_ eventName: String, attributes: [String: Any]? = nil) {
        if let attrs = attributes {
            Singular.event(eventName, withArgs: attrs)
        } else {
            Singular.event(eventName)
        }
        logger.debug("Tracked event: \(eventName)")
    }
}

