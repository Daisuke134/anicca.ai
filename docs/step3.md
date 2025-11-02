以下の差分で IOS‑003 の Step0〜8 を満たす実装になります。

- `apps/api/src/services/livekitTokenService.js`: LiveKit エフェメラルトークン発行ロジックを新設。
- `apps/api/src/routes/mobile/rtc.js`: `GET /api/mobile/rtc/ephemeral-token` を追加し、デバイス ID を検証してトークンを返却。
- `apps/api/src/config/environment.js`: LiveKit 用環境変数の集約と検証・ログ出力を拡張。
- `Anicca/Smart/Smart.xcodeproj/project.pbxproj`: LiveKit Swift SDK を SPM 依存に追加し、`ANICCA_PROXY_BASE_URL` を Info.plist に注入。
- `Anicca/Smart/Smart/Config/AppConfig.swift`: モバイル API 基本設定と LiveKit 接続オプションを管理。
- `Anicca/Smart/Smart/Services/API/*`: トークン取得用の `MobileAPIClient` と `APIError` を追加。
- `Anicca/Smart/Smart/Services/Identity/DeviceIdentityStore.swift`: Keychain にデバイス固有 UUID を保存・提供。
- `Anicca/Smart/Smart/Features/Voice/RealtimeSession.swift`: LiveKit ルーム接続・再接続・音声購読を統合管理。
- `Anicca/Smart/Smart/Audio/*`: リアルタイム音声連携と状態監視のために `AppAudioController` を拡張し、新しいオーディオマネージャを追加。
- `Anicca/Smart/Smart/ContentView.swift`: LiveKit ステータスを UI に表示。

```diff
diff --git a/apps/api/src/config/environment.js b/apps/api/src/config/environment.js
index 3c50769..a1b9c3d 100644
--- a/apps/api/src/config/environment.js
+++ b/apps/api/src/config/environment.js
@@
 export const SERVER_CONFIG = {
   // Railwayデプロイメント判定
   IS_RAILWAY: !!process.env.RAILWAY_ENVIRONMENT,
   IS_VERCEL: !!process.env.VERCEL,
@@
   PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || process.env.VERCEL_URL
 };
 
+const livekitTokenTtlRaw = process.env.LIVEKIT_TOKEN_TTL_SECONDS || '';
+const livekitTokenTtlParsed = Number.parseInt(livekitTokenTtlRaw, 10);
+
+export const LIVEKIT_CONFIG = {
+  WS_URL: process.env.LIVEKIT_WS_URL || '',
+  API_KEY: process.env.LIVEKIT_API_KEY || '',
+  API_SECRET: process.env.LIVEKIT_API_SECRET || '',
+  DEFAULT_ROOM: process.env.LIVEKIT_DEFAULT_ROOM || '',
+  TOKEN_TTL: Number.isFinite(livekitTokenTtlParsed) && livekitTokenTtlParsed > 0 ? livekitTokenTtlParsed : 600
+};
+
 // プロキシサーバー設定
 export const PROXY_BASE_URL = process.env.PROXY_BASE_URL || '';
 
@@
 export const DEBUG_CONFIG = {
   // デバッグモード
   DEBUG: process.env.DEBUG === 'true',
   
   // ログレベル
   LOG_LEVEL: process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug')
 };
@@
   if (process.env.FREE_DAILY_LIMIT && BILLING_CONFIG.FREE_DAILY_LIMIT === null) {
     warnings.push('FREE_DAILY_LIMIT is not a valid integer');
   }
   if (process.env.PRO_DAILY_LIMIT && BILLING_CONFIG.PRO_DAILY_LIMIT === null) {
     warnings.push('PRO_DAILY_LIMIT is not a valid integer');
   }
+  if (livekitTokenTtlRaw && !Number.isFinite(livekitTokenTtlParsed)) {
+    warnings.push('LIVEKIT_TOKEN_TTL_SECONDS is not a valid integer');
+  }
 
   return warnings;
 }
@@
   console.log(`  - Stripe price: ${BILLING_CONFIG.STRIPE_PRICE_PRO_MONTHLY || 'unset'}`);
   console.log(`  - Free daily limit: ${BILLING_CONFIG.FREE_DAILY_LIMIT ?? 'unset'}`);
   console.log(`  - Pro daily limit: ${BILLING_CONFIG.PRO_DAILY_LIMIT ?? 'default(1000)'}`);
+  console.log(`  - LiveKit URL: ${LIVEKIT_CONFIG.WS_URL || 'unset'}`);
+  console.log(`  - LiveKit default room: ${LIVEKIT_CONFIG.DEFAULT_ROOM || 'unset (server decides)'}`);
+  console.log(`  - LiveKit token ttl: ${LIVEKIT_CONFIG.TOKEN_TTL}s`);
diff --git a/apps/api/src/routes/index.js b/apps/api/src/routes/index.js
index 0a8f70f..ff84b07 100644
--- a/apps/api/src/routes/index.js
+++ b/apps/api/src/routes/index.js
@@
 import realtimeDesktopRouter from './realtime/desktop.js';
 import realtimeWebRouter from './realtime/web.js';
+import mobileRouter from './mobile/index.js';
@@
 router.use('/realtime/desktop', realtimeDesktopRouter);
 router.use('/realtime/web', realtimeWebRouter);
+router.use('/mobile', mobileRouter);
diff --git a/apps/api/src/routes/mobile/index.js b/apps/api/src/routes/mobile/index.js
new file mode 100644
index 0000000..2fbb1c5
--- /dev/null
+++ b/apps/api/src/routes/mobile/index.js
@@
+import express from 'express';
+import rtcRouter from './rtc.js';
+
+const router = express.Router();
+
+router.use('/rtc', rtcRouter);
+
+export default router;
diff --git a/apps/api/src/routes/mobile/rtc.js b/apps/api/src/routes/mobile/rtc.js
new file mode 100644
index 0000000..bb2d8d1
--- /dev/null
+++ b/apps/api/src/routes/mobile/rtc.js
@@
+import express from 'express';
+import { issueEphemeralToken } from '../../services/livekitTokenService.js';
+import Logger from '../../utils/logger.js';
+
+const router = express.Router();
+const logger = new Logger('MobileRTC');
+
+router.get('/ephemeral-token', async (req, res) => {
+  const deviceId = (req.query.deviceId || req.get('deviceId') || '').toString().trim();
+
+  if (!deviceId) {
+    logger.warn('Missing deviceId for LiveKit token request');
+    return res.status(400).json({ error: 'deviceId is required' });
+  }
+
+  try {
+    const payload = await issueEphemeralToken({ deviceId });
+    return res.json(payload);
+  } catch (error) {
+    logger.error('Failed to issue LiveKit ephemeral token', error);
+    return res.status(500).json({ error: 'failed_to_issue_livekit_token' });
+  }
+});
+
+export default router;
diff --git a/apps/api/src/services/livekitTokenService.js b/apps/api/src/services/livekitTokenService.js
new file mode 100644
index 0000000..0d7d824
--- /dev/null
+++ b/apps/api/src/services/livekitTokenService.js
@@
+import { AccessToken } from '@livekit/livekit-server-sdk';
+import { LIVEKIT_CONFIG } from '../config/environment.js';
+import Logger from '../utils/logger.js';
+
+const logger = new Logger('LiveKitTokenService');
+const DEFAULT_TTL = 600;
+
+function ensureLiveKitConfiguration() {
+  if (!LIVEKIT_CONFIG.WS_URL || !LIVEKIT_CONFIG.API_KEY || !LIVEKIT_CONFIG.API_SECRET) {
+    throw new Error('LiveKit configuration is incomplete');
+  }
+}
+
+export async function issueEphemeralToken({ deviceId }) {
+  ensureLiveKitConfiguration();
+
+  const ttl = LIVEKIT_CONFIG.TOKEN_TTL > 0 ? LIVEKIT_CONFIG.TOKEN_TTL : DEFAULT_TTL;
+
+  try {
+    const accessToken = new AccessToken(LIVEKIT_CONFIG.API_KEY, LIVEKIT_CONFIG.API_SECRET, {
+      identity: deviceId,
+      ttl
+    });
+
+    accessToken.addGrant({
+      roomJoin: true,
+      canPublish: true,
+      canSubscribe: true,
+      room: LIVEKIT_CONFIG.DEFAULT_ROOM || undefined
+    });
+
+    const token = await accessToken.toJwt();
+
+    logger.info('Issued LiveKit token for device', deviceId, `(ttl=${ttl}s)`);
+
+    return {
+      token,
+      url: LIVEKIT_CONFIG.WS_URL,
+      ttl
+    };
+  } catch (error) {
+    logger.error('Failed to generate LiveKit token', error);
+    throw error;
+  }
+}
diff --git a/Anicca/Smart/Smart.xcodeproj/project.pbxproj b/Anicca/Smart/Smart.xcodeproj/project.pbxproj
index 3fba772..7321f63 100644
--- a/Anicca/Smart/Smart.xcodeproj/project.pbxproj
+++ b/Anicca/Smart/Smart.xcodeproj/project.pbxproj
@@
 	objects = {
 
+/* Begin PBXBuildFile section */
+		8471AD1A2EB4ACE7002CECAA /* LiveKit in Frameworks */ = {isa = PBXBuildFile; productRef = 8471AD192EB4ACE7002CECAA /* LiveKit */; };
+/* End PBXBuildFile section */
+
 /* Begin PBXFileReference section */
 		8471ACFE2EB4ACE4002CECAA /* Smart.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = Smart.app; sourceTree = BUILT_PRODUCTS_DIR; };
 /* End PBXFileReference section */
@@
 		8471ACFB2EB4ACE4002CECAA /* Frameworks */ = {
 			isa = PBXFrameworksBuildPhase;
 			buildActionMask = 2147483647;
 			files = (
+				8471AD1A2EB4ACE7002CECAA /* LiveKit in Frameworks */,
 			);
 			runOnlyForDeploymentPostprocessing = 0;
 		};
@@
 		8471ACFD2EB4ACE4002CECAA /* Smart */ = {
 			isa = PBXNativeTarget;
@@
-			packageProductDependencies = (
-			);
+			packageProductDependencies = (
+				8471AD192EB4ACE7002CECAA /* LiveKit */,
+			);
@@
 		8471ACF62EB4ACE4002CECAA /* Project object */ = {
 			isa = PBXProject;
@@
-			packageReferences = (
-			);
+			packageReferences = (
+				8471AD1B2EB4ACE7002CECAA /* https://github.com/livekit/client-sdk-swift.git */,
+			);
 		};
 /* End PBXProject section */
@@
 		8471AD072EB4ACE6002CECAA /* Debug */ = {
 			isa = XCBuildConfiguration;
@@
-				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
+				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
+				INFOPLIST_KEY_ANICCA_PROXY_BASE_URL = "https://proxy.anicca.ai/api/mobile";
 			};
 			name = Debug;
 		};
 		8471AD082EB4ACE6002CECAA /* Release */ = {
 			isa = XCBuildConfiguration;
@@
-				SWIFT_OPTIMIZATION_LEVEL = "-O";
+				SWIFT_OPTIMIZATION_LEVEL = "-O";
+				INFOPLIST_KEY_ANICCA_PROXY_BASE_URL = "https://proxy.anicca.ai/api/mobile";
 			};
 			name = Release;
 		};
@@
 		};
 /* End XCConfigurationList section */
+
+/* Begin XCRemoteSwiftPackageReference section */
+		8471AD1B2EB4ACE7002CECAA /* https://github.com/livekit/client-sdk-swift.git */ = {
+			isa = XCRemoteSwiftPackageReference;
+			repositoryURL = "https://github.com/livekit/client-sdk-swift.git";
+			requirement = {
+				kind = upToNextMajorVersion;
+				minimumVersion = 2.0.0;
+			};
+		};
+/* End XCRemoteSwiftPackageReference section */
+
+/* Begin XCSwiftPackageProductDependency section */
+		8471AD192EB4ACE7002CECAA /* LiveKit */ = {
+			isa = XCSwiftPackageProductDependency;
+			package = 8471AD1B2EB4ACE7002CECAA /* https://github.com/livekit/client-sdk-swift.git */;
+			productName = LiveKit;
+		};
+/* End XCSwiftPackageProductDependency section */
diff --git a/Anicca/Smart/Smart/Config/AppConfig.swift b/Anicca/Smart/Smart/Config/AppConfig.swift
new file mode 100644
index 0000000..7a8f4c1
--- /dev/null
+++ b/Anicca/Smart/Smart/Config/AppConfig.swift
@@
+import Foundation
+import LiveKit
+import OSLog
+
+enum AppConfig {
+    private static let proxyBaseKey = "ANICCA_PROXY_BASE_URL"
+    private static let logger = Logger(subsystem: "com.anicca.ios", category: "AppConfig")
+
+    static let liveKitTokenPath = "/rtc/ephemeral-token"
+    static let maxRealtimeReconnectAttempts = 3
+
+    private static func infoValue(for key: String) -> String {
+        guard let raw = Bundle.main.infoDictionary?[key] as? String else {
+            logger.fault("Missing Info.plist key: \(key, privacy: .public)")
+            fatalError("Missing Info.plist key: \(key)")
+        }
+        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
+        guard !trimmed.isEmpty else {
+            logger.fault("Empty Info.plist value for key: \(key, privacy: .public)")
+            fatalError("Empty Info.plist value for key: \(key)")
+        }
+        return trimmed
+    }
+
+    static var proxyBaseURL: URL {
+        let value = infoValue(for: proxyBaseKey)
+        guard let url = URL(string: value) else {
+            logger.fault("Invalid proxy base URL: \(value, privacy: .public)")
+            fatalError("Invalid proxy base URL")
+        }
+        return url
+    }
+
+    static var liveKitTokenURL: URL {
+        let base = proxyBaseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
+        let path = liveKitTokenPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
+        guard let url = URL(string: "\(base)/\(path)") else {
+            logger.fault("Failed to compose LiveKit token URL from base \(base, privacy: .public) and path \(path, privacy: .public)")
+            fatalError("Failed to compose LiveKit token URL")
+        }
+        return url
+    }
+
+    static let liveKitConnectOptions: ConnectOptions = ConnectOptions(
+        autoSubscribe: true,
+        reconnectAttempts: 10,
+        reconnectAttemptDelay: 0.5,
+        reconnectMaxDelay: 6.0,
+        enableMicrophone: true
+    )
+}
diff --git a/Anicca/Smart/Smart/Services/API/APIError.swift b/Anicca/Smart/Smart/Services/API/APIError.swift
new file mode 100644
index 0000000..62c8ab9
--- /dev/null
+++ b/Anicca/Smart/Smart/Services/API/APIError.swift
@@
+import Foundation
+
+enum APIError: LocalizedError {
+    case invalidEndpoint
+    case requestFailed(statusCode: Int)
+    case decodingFailed
+    case realtimeTokenFetchFailed(statusCode: Int)
+    case transportError(underlying: Error)
+
+    var errorDescription: String? {
+        switch self {
+        case .invalidEndpoint:
+            return "APIエンドポイントの構成が不正です"
+        case .requestFailed(let statusCode):
+            return "APIリクエストに失敗しました (status: \(statusCode))"
+        case .decodingFailed:
+            return "サーバー応答の解析に失敗しました"
+        case .realtimeTokenFetchFailed(let statusCode):
+            return "LiveKitトークンの取得に失敗しました (status: \(statusCode))"
+        case .transportError(let underlying):
+            return "ネットワークエラー: \(underlying.localizedDescription)"
+        }
+    }
+}
diff --git a/Anicca/Smart/Smart/Services/API/MobileAPIClient.swift b/Anicca/Smart/Smart/Services/API/MobileAPIClient.swift
new file mode 100644
index 0000000..023f7b2
--- /dev/null
+++ b/Anicca/Smart/Smart/Services/API/MobileAPIClient.swift
@@
+import Foundation
+import OSLog
+
+struct LiveKitTokenResponse: Decodable {
+    let token: String
+    let url: URL
+    let ttl: TimeInterval
+}
+
+protocol MobileAPIClientProtocol: AnyObject {
+    func fetchLiveKitToken(userId: String) async throws -> LiveKitTokenResponse
+}
+
+@MainActor
+final class MobileAPIClient: MobileAPIClientProtocol {
+    static let shared = MobileAPIClient()
+
+    private let logger = Logger(subsystem: "com.anicca.ios", category: "MobileAPI")
+    private let session: URLSession
+    private let decoder: JSONDecoder
+
+    private init(session: URLSession = .shared, decoder: JSONDecoder = JSONDecoder()) {
+        self.session = session
+        self.decoder = decoder
+    }
+
+    func fetchLiveKitToken(userId: String) async throws -> LiveKitTokenResponse {
+        guard var components = URLComponents(url: AppConfig.liveKitTokenURL, resolvingAgainstBaseURL: false) else {
+            logger.error("Failed to build LiveKit token URL components")
+            throw APIError.invalidEndpoint
+        }
+        components.queryItems = [URLQueryItem(name: "deviceId", value: userId)]
+        guard let url = components.url else {
+            logger.error("Failed to resolve LiveKit token URL with query")
+            throw APIError.invalidEndpoint
+        }
+
+        var request = URLRequest(url: url)
+        request.httpMethod = "GET"
+        request.setValue(userId, forHTTPHeaderField: "deviceId")
+
+        logger.debug("Requesting LiveKit token for userId \(userId, privacy: .private(mask: .hash))")
+
+        do {
+            let (data, response) = try await session.data(for: request)
+            guard let httpResponse = response as? HTTPURLResponse else {
+                logger.error("LiveKit token response missing HTTPURLResponse")
+                throw APIError.requestFailed(statusCode: -1)
+            }
+
+            guard 200 ..< 300 ~= httpResponse.statusCode else {
+                logger.error("LiveKit token request failed (status \(httpResponse.statusCode))")
+                throw APIError.realtimeTokenFetchFailed(statusCode: httpResponse.statusCode)
+            }
+
+            do {
+                let response = try decoder.decode(LiveKitTokenResponse.self, from: data)
+                logger.info("Received LiveKit token (ttl=\(response.ttl, format: .fixed(precision: 0))s)")
+                return response
+            } catch {
+                logger.error("Failed to decode LiveKit token response: \(error.localizedDescription, privacy: .public)")
+                throw APIError.decodingFailed
+            }
+        } catch let apiError as APIError {
+            throw apiError
+        } catch {
+            logger.error("LiveKit token request transport error: \(error.localizedDescription, privacy: .public)")
+            throw APIError.transportError(underlying: error)
+        }
+    }
+}
diff --git a/Anicca/Smart/Smart/Services/Identity/DeviceIdentityStore.swift b/Anicca/Smart/Smart/Services/Identity/DeviceIdentityStore.swift
new file mode 100644
index 0000000..3b97f61
--- /dev/null
+++ b/Anicca/Smart/Smart/Services/Identity/DeviceIdentityStore.swift
@@
+import Foundation
+import OSLog
+import Security
+
+@MainActor
+protocol DeviceIdentityProviding: AnyObject {
+    var userId: String? { get }
+}
+
+@MainActor
+final class DeviceIdentityStore: DeviceIdentityProviding {
+    static let shared = DeviceIdentityStore()
+
+    private let service = "com.anicca.smart.identity"
+    private let account = "deviceUserId"
+    private let logger = Logger(subsystem: "com.anicca.ios", category: "Identity")
+    private(set) var userId: String?
+
+    private init() {
+        if let existing = loadIdentity() {
+            userId = existing
+            logger.debug("Loaded device identity from Keychain")
+        } else if let generated = createAndPersistIdentity() {
+            userId = generated
+            logger.info("Generated new device identity")
+        } else {
+            userId = nil
+            logger.error("Failed to initialize device identity")
+        }
+    }
+
+    private func loadIdentity() -> String? {
+        let query: [String: Any] = [
+            kSecClass as String: kSecClassGenericPassword,
+            kSecAttrService as String: service,
+            kSecAttrAccount as String: account,
+            kSecReturnData as String: true,
+            kSecMatchLimit as String: kSecMatchLimitOne
+        ]
+
+        var item: CFTypeRef?
+        let status = SecItemCopyMatching(query as CFDictionary, &item)
+
+        switch status {
+        case errSecSuccess:
+            guard let data = item as? Data,
+                  let value = String(data: data, encoding: .utf8),
+                  !value.isEmpty else {
+                logger.error("Device identity existed but decoding failed")
+                return nil
+            }
+            return value
+        case errSecItemNotFound:
+            return nil
+        default:
+            logger.error("Keychain read failed: \(status, privacy: .public)")
+            return nil
+        }
+    }
+
+    private func createAndPersistIdentity() -> String? {
+        let newValue = UUID().uuidString
+        guard storeIdentity(newValue) else {
+            logger.error("Keychain write failed for new device identity")
+            return nil
+        }
+        return newValue
+    }
+
+    private func storeIdentity(_ value: String) -> Bool {
+        let data = Data(value.utf8)
+
+        let baseQuery: [String: Any] = [
+            kSecClass as String: kSecClassGenericPassword,
+            kSecAttrService as String: service,
+            kSecAttrAccount as String: account
+        ]
+
+        SecItemDelete(baseQuery as CFDictionary)
+
+        var insertQuery = baseQuery
+        insertQuery[kSecValueData as String] = data
+
+        let status = SecItemAdd(insertQuery as CFDictionary, nil)
+        if status != errSecSuccess {
+            logger.error("Keychain add failed: \(status, privacy: .public)")
+            return false
+        }
+
+        return true
+    }
+}
diff --git a/Anicca/Smart/Smart/Audio/AudioManager.swift b/Anicca/Smart/Smart/Audio/AudioManager.swift
new file mode 100644
index 0000000..7a4ff31
--- /dev/null
+++ b/Anicca/Smart/Smart/Audio/AudioManager.swift
@@
+import Foundation
+import OSLog
+
+@MainActor
+final class AudioManager {
+    static let shared = AudioManager()
+
+    private let logger = Logger(subsystem: "com.anicca.ios", category: "AudioManager")
+    private var remoteRenderers: [UUID: AudioPlayerRenderer] = [:]
+
+    private init() {}
+
+    func add(remoteAudioRenderer renderer: AudioPlayerRenderer) {
+        remoteRenderers[renderer.id] = renderer
+        renderer.start()
+        logger.debug("Remote audio renderer added (\(renderer.id.uuidString, privacy: .public))")
+    }
+
+    func remove(remoteAudioRenderer renderer: AudioPlayerRenderer) {
+        renderer.stop()
+        remoteRenderers.removeValue(forKey: renderer.id)
+        logger.debug("Remote audio renderer removed (\(renderer.id.uuidString, privacy: .public))")
+    }
+
+    func stopAllRemoteRenderers() {
+        guard !remoteRenderers.isEmpty else { return }
+        logger.debug("Stopping \(remoteRenderers.count, privacy: .public) remote audio renderer(s)")
+        remoteRenderers.values.forEach { $0.stop() }
+        remoteRenderers.removeAll()
+    }
+}
diff --git a/Anicca/Smart/Smart/Audio/AudioPlayerRenderer.swift b/Anicca/Smart/Smart/Audio/AudioPlayerRenderer.swift
new file mode 100644
index 0000000..153ce56
--- /dev/null
+++ b/Anicca/Smart/Smart/Audio/AudioPlayerRenderer.swift
@@
+import Foundation
+import LiveKit
+import OSLog
+
+@MainActor
+final class AudioPlayerRenderer {
+    let id = UUID()
+
+    private let logger = Logger(subsystem: "com.anicca.ios", category: "AudioRenderer")
+    private weak var track: RemoteAudioTrack?
+
+    init(track: RemoteAudioTrack) {
+        self.track = track
+    }
+
+    func start() {
+        guard let track else { return }
+        track.isPlaybackEnabled = true
+        logger.debug("Enabled remote audio playback")
+    }
+
+    func stop() {
+        guard let track else { return }
+        track.isPlaybackEnabled = false
+        logger.debug("Disabled remote audio playback")
+    }
+}
diff --git a/Anicca/Smart/Smart/Features/Voice/RealtimeSession.swift b/Anicca/Smart/Smart/Features/Voice/RealtimeSession.swift
new file mode 100644
index 0000000..f9b385c
--- /dev/null
+++ b/Anicca/Smart/Smart/Features/Voice/RealtimeSession.swift
@@
+import Combine
+import Foundation
+import LiveKit
+import OSLog
+
+@MainActor
+final class RealtimeSession: NSObject, ObservableObject {
+    @Published private(set) var isConnected: Bool = false
+    @Published private(set) var statusMessage: String = "LiveKit未接続"
+    @Published private(set) var connectionState: ConnectionState = .disconnected
+    @Published private(set) var lastErrorMessage: String?
+
+    private let mobileClient: MobileAPIClientProtocol
+    private weak var userResolver: DeviceIdentityProviding?
+    private let room: Room
+    private let logger = Logger(subsystem: "com.anicca.ios", category: "RTC")
+    private var hasAttachedDelegate = false
+    private var isConnecting = false
+    private var retryAttempts = 0
+    private var remoteRenderer: AudioPlayerRenderer?
+
+    init(mobileClient: MobileAPIClientProtocol, userResolver: DeviceIdentityProviding) {
+        self.mobileClient = mobileClient
+        self.userResolver = userResolver
+        self.room = Room()
+        super.init()
+    }
+
+    func connect(userId: String) async throws {
+        guard !isConnecting else {
+            logger.debug("Skip connect because another attempt is in progress")
+            return
+        }
+
+        if room.connectionState == .connected || room.connectionState == .connecting {
+            logger.debug("Room already connected or connecting")
+            return
+        }
+
+        isConnecting = true
+        defer { isConnecting = false }
+
+        statusMessage = "LiveKitトークン取得中"
+        lastErrorMessage = nil
+
+        let response: LiveKitTokenResponse
+        do {
+            response = try await mobileClient.fetchLiveKitToken(userId: userId)
+        } catch let apiError as APIError {
+            let message = apiError.errorDescription ?? "LiveKitトークンの取得に失敗しました"
+            statusMessage = message
+            lastErrorMessage = message
+            logger.error("Token fetch failed: \(message, privacy: .public)")
+            throw apiError
+        } catch {
+            let message = "LiveKitトークンの取得に失敗しました: \(error.localizedDescription)"
+            statusMessage = message
+            lastErrorMessage = message
+            logger.error("Token fetch unexpected failure: \(error.localizedDescription, privacy: .public)")
+            throw error
+        }
+
+        if !hasAttachedDelegate {
+            room.delegates.add(delegate: self)
+            hasAttachedDelegate = true
+        }
+
+        statusMessage = "LiveKit接続中"
+
+        do {
+            try await room.connect(url: response.url.absoluteString, token: response.token, connectOptions: AppConfig.liveKitConnectOptions)
+            try await room.localParticipant.setMicrophone(enabled: true)
+            AudioManager.shared.stopAllRemoteRenderers()
+            remoteRenderer = nil
+
+            isConnected = true
+            connectionState = room.connectionState
+            statusMessage = "LiveKit接続完了"
+            lastErrorMessage = nil
+            retryAttempts = 0
+            logger.info("LiveKit room connected")
+        } catch {
+            let message = "LiveKit接続に失敗しました: \(error.localizedDescription)"
+            statusMessage = message
+            lastErrorMessage = message
+            connectionState = room.connectionState
+            logger.error("Room connect failed: \(error.localizedDescription, privacy: .public)")
+            throw error
+        }
+    }
+
+    func disconnect() async {
+        guard room.connectionState != .disconnected else { return }
+        logger.info("Disconnecting LiveKit room")
+        await room.disconnect()
+        AudioManager.shared.stopAllRemoteRenderers()
+        remoteRenderer = nil
+        isConnected = false
+        connectionState = .disconnected
+        statusMessage = "LiveKit切断済み"
+    }
+
+    func handleForegroundResume() async {
+        guard room.connectionState == .disconnected else { return }
+        guard let userId = userResolver?.userId else {
+            statusMessage = "デバイス識別子の取得に失敗しました"
+            lastErrorMessage = statusMessage
+            return
+        }
+        do {
+            try await connect(userId: userId)
+        } catch {
+            logger.error("Foreground reconnect failed: \(error.localizedDescription, privacy: .public)")
+        }
+    }
+
+    private func scheduleReconnect() {
+        guard let userResolver else {
+            statusMessage = "デバイス識別子の取得に失敗しました"
+            lastErrorMessage = statusMessage
+            return
+        }
+        guard retryAttempts < AppConfig.maxRealtimeReconnectAttempts else {
+            statusMessage = "接続できませんでした。ネットワーク状態を確認してください。"
+            lastErrorMessage = statusMessage
+            logger.error("Exceeded maximum LiveKit reconnect attempts")
+            return
+        }
+        retryAttempts += 1
+        statusMessage = "LiveKit再接続中 (\(retryAttempts)/\(AppConfig.maxRealtimeReconnectAttempts))"
+        logger.info("Scheduling LiveKit reconnect attempt \(retryAttempts)")
+
+        Task { [weak self, weak userResolver] in
+            guard let self else { return }
+            let delay = UInt64(Double(retryAttempts) * 1_000_000_000)
+            try? await Task.sleep(nanoseconds: delay)
+
+            guard let userId = userResolver?.userId else {
+                await MainActor.run {
+                    self.statusMessage = "デバイス識別子の取得に失敗しました"
+                    self.lastErrorMessage = self.statusMessage
+                }
+                return
+            }
+
+            do {
+                try await self.connect(userId: userId)
+            } catch {
+                await MainActor.run {
+                    self.lastErrorMessage = error.localizedDescription
+                }
+                self.scheduleReconnect()
+            }
+        }
+    }
+}
+
+extension RealtimeSession: RoomDelegate {
+    func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldConnectionState: ConnectionState) {
+        logger.debug("Connection state changed \(String(describing: oldConnectionState)) -> \(String(describing: connectionState))")
+        self.connectionState = connectionState
+        isConnected = connectionState == .connected
+    }
+
+    func roomDidConnect(_ room: Room) {
+        logger.info("LiveKit room did connect delegate")
+        statusMessage = "LiveKit接続完了"
+        isConnected = true
+        lastErrorMessage = nil
+        retryAttempts = 0
+    }
+
+    func roomIsReconnecting(_ room: Room) {
+        logger.warning("LiveKit room is reconnecting")
+        statusMessage = "LiveKit再接続中"
+    }
+
+    func roomDidReconnect(_ room: Room) {
+        logger.info("LiveKit room did reconnect")
+        statusMessage = "LiveKit再接続完了"
+        isConnected = true
+        lastErrorMessage = nil
+        retryAttempts = 0
+    }
+
+    func room(_ room: Room, didDisconnectWithError error: LiveKitError?) {
+        let message = error?.localizedDescription ?? "不明なエラー"
+        logger.error("LiveKit room disconnected: \(message, privacy: .public)")
+        isConnected = false
+        connectionState = room.connectionState
+        statusMessage = "LiveKit切断: \(message)"
+        lastErrorMessage = message
+        AudioManager.shared.stopAllRemoteRenderers()
+        remoteRenderer = nil
+        scheduleReconnect()
+    }
+
+    func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
+        guard let audioTrack = publication.track as? RemoteAudioTrack else { return }
+        logger.info("Subscribed remote audio track")
+        let renderer = AudioPlayerRenderer(track: audioTrack)
+        AudioManager.shared.add(remoteAudioRenderer: renderer)
+        remoteRenderer = renderer
+        statusMessage = "音声受信中"
+    }
+
+    func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
+        guard let renderer = remoteRenderer else { return }
+        logger.info("Unsubscribed remote audio track")
+        AudioManager.shared.remove(remoteAudioRenderer: renderer)
+        remoteRenderer = nil
+        statusMessage = "音声待機中"
+    }
+
+    func room(_ room: Room, participant: RemoteParticipant, didFailToSubscribeTrackWithSid trackSid: Track.Sid, error: LiveKitError) {
+        logger.error("Failed to subscribe remote track: \(error.localizedDescription, privacy: .public)")
+        lastErrorMessage = error.localizedDescription
+        statusMessage = "LiveKit音声の取得に失敗しました"
+    }
+}
diff --git a/Anicca/Smart/Smart/Audio/AppAudioController.swift b/Anicca/Smart/Smart/Audio/AppAudioController.swift
index f1be3d2..95463c5 100644
--- a/Anicca/Smart/Smart/Audio/AppAudioController.swift
+++ b/Anicca/Smart/Smart/Audio/AppAudioController.swift
@@
-import AVFoundation
-import Combine
-import OSLog
-import SwiftUI
-
-@MainActor
-final class AppAudioController: ObservableObject {
-    @Published var status: String = "音声準備前"
-    private let logger = Logger(subsystem: "com.anicca.ios", category: "AudioBootstrap")
-    private let sessionConfigurator = AudioSessionConfigurator.shared
-    private let voiceEngine = VoiceEngine.shared
-    private let permissionManager = MicrophonePermissionManager()
-    private var didPrepare = false
+import AVFoundation
+import Combine
+import OSLog
+import SwiftUI
+
+@MainActor
+final class AppAudioController: ObservableObject {
+    @Published var status: String = "音声準備前"
+    @Published private(set) var realtimeStatus: String = "LiveKit未接続"
+    @Published private(set) var isRealtimeConnected: Bool = false
+    @Published private(set) var hasRealtimeError: Bool = false
+
+    private let logger = Logger(subsystem: "com.anicca.ios", category: "AudioBootstrap")
+    private let sessionConfigurator = AudioSessionConfigurator.shared
+    private let voiceEngine = VoiceEngine.shared
+    private let permissionManager = MicrophonePermissionManager()
+    private let identityStore: DeviceIdentityProviding
+    private let realtimeSession: RealtimeSession
+    private var cancellables: Set<AnyCancellable> = []
+    private var didPrepare = false
+
+    init(
+        identityStore: DeviceIdentityProviding = DeviceIdentityStore.shared,
+        realtimeSession: RealtimeSession = RealtimeSession(
+            mobileClient: MobileAPIClient.shared,
+            userResolver: DeviceIdentityStore.shared
+        )
+    ) {
+        self.identityStore = identityStore
+        self.realtimeSession = realtimeSession
+        bindRealtimeSession()
+    }
@@
-            await ensureSessionActive()
+            await ensureSessionActive()
+            await connectRealtimeIfNeeded()
             return
         }
@@
-            await updateStatus("音声エンジン稼働中")
-            logger.info("Audio engine started successfully")
+            await updateStatus("音声エンジン稼働中")
+            logger.info("Audio engine started successfully")
+            await connectRealtimeIfNeeded()
@@
-        case .active:
-            Task { await ensureSessionActive() }
+        case .active:
+            Task {
+                await ensureSessionActive()
+                await realtimeSession.handleForegroundResume()
+            }
         case .inactive, .background:
+            Task { await realtimeSession.disconnect() }
             sessionConfigurator.deactivate()
             voiceEngine.stop()
@@
-    private nonisolated func updateStatus(_ text: String) async {
-        await MainActor.run { self.status = text }
-    }
+    private func connectRealtimeIfNeeded() async {
+        guard let userId = identityStore.userId else {
+            await updateStatus("デバイス識別子の取得に失敗しました")
+            realtimeStatus = "デバイス識別子の取得に失敗しました"
+            hasRealtimeError = true
+            return
+        }
+
+        do {
+            try await realtimeSession.connect(userId: userId)
+        } catch {
+            let message = "LiveKitトークン取得失敗: \(error.localizedDescription)"
+            await updateStatus(message)
+            realtimeStatus = message
+            hasRealtimeError = true
+        }
+    }
+
+    private func bindRealtimeSession() {
+        realtimeSession.$statusMessage
+            .receive(on: RunLoop.main)
+            .sink { [weak self] message in
+                self?.realtimeStatus = message
+            }
+            .store(in: &cancellables)
+
+        realtimeSession.$isConnected
+            .receive(on: RunLoop.main)
+            .sink { [weak self] isConnected in
+                self?.isRealtimeConnected = isConnected
+                if isConnected {
+                    self?.hasRealtimeError = false
+                }
+            }
+            .store(in: &cancellables)
+
+        realtimeSession.$lastErrorMessage
+            .receive(on: RunLoop.main)
+            .sink { [weak self] errorMessage in
+                self?.hasRealtimeError = errorMessage != nil
+            }
+            .store(in: &cancellables)
+    }
+
+    private nonisolated func updateStatus(_ text: String) async {
+        await MainActor.run { self.status = text }
+    }
 }
diff --git a/Anicca/Smart/Smart/ContentView.swift b/Anicca/Smart/Smart/ContentView.swift
index 4f1c3d8..29ee6f5 100644
--- a/Anicca/Smart/Smart/ContentView.swift
+++ b/Anicca/Smart/Smart/ContentView.swift
@@
         VStack(spacing: 16) {
             Image(systemName: "waveform")
                 .font(.system(size: 60, weight: .thin))
                 .foregroundStyle(.tint)
             Text("音声インフラ準備ステータス")
                 .font(.headline)
             Text(audioController.status)
                 .font(.subheadline)
                 .foregroundStyle(.secondary)
                 .multilineTextAlignment(.center)
                 .padding(.horizontal, 24)
+            Text(audioController.realtimeStatus)
+                .font(.footnote)
+                .foregroundStyle(
+                    audioController.hasRealtimeError
+                    ? Color.red
+                    : (audioController.isRealtimeConnected ? Color.green : Color.secondary)
+                )
+                .multilineTextAlignment(.center)
+                .padding(.horizontal, 24)
         }
         .padding()
     }
 }
```

---

この擬似パッチを `docs/step3.md` に貼り付けてレビューに回してください。実装時は以下をご確認ください。

1. `LIVEKIT_WS_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_DEFAULT_ROOM / LIVEKIT_TOKEN_TTL_SECONDS` を Railway 側で設定。
2. iOS 側 `ANICCA_PROXY_BASE_URL` を実環境の `/api/mobile` ベース URL に合わせて更新。
3. `npm install` 済みで `@livekit/livekit-server-sdk` の lockfile エントリが正しく生成されていることを確認。
4. Xcode で `Smart` ターゲットを開き、`Cmd+R` でビルド・実機動作を検証（LiveKit 接続・再接続動作、音声送受信、UI ステータス遷移を確認）。

以上です。
