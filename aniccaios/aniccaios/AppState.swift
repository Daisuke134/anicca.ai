import Foundation
import Combine
import UIKit
import SwiftUI
import RevenueCat
import OSLog

@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "AppState")

    @Published private(set) var authStatus: AuthStatus = .signedOut
    @Published private(set) var userProfile: UserProfile = UserProfile()
    @Published private(set) var subscriptionInfo: SubscriptionInfo = .free
    
    // サーバーからのプロファイル取得中フラグ（UIフラッシュ防止用）
    @Published private(set) var isBootstrappingProfile: Bool = false
    @Published private(set) var purchaseEnvironmentStatus: PurchaseEnvironmentStatus = .ready
    @Published private(set) var subscriptionHold: Bool = false
    @Published private(set) var subscriptionHoldPlan: SubscriptionInfo.Plan? = nil
    
    enum QuotaHoldReason: String, Codable {
        case quotaExceeded       // 月間上限到達
        case sessionTimeCap      // 無料セッション5分上限
    }
    @Published private(set) var quotaHoldReason: QuotaHoldReason?
    @Published private(set) var isOnboardingComplete: Bool
    @Published private(set) var onboardingStep: OnboardingStep
    @Published private(set) var cachedOffering: Offering?

    // MARK: - Proactive Agent: NudgeCard
    @Published var pendingNudgeCard: NudgeContent? = nil

    // MARK: - Nudge Card / Paywall / Review (Phase 4)

    /// NudgeCard完了回数（累計、レビュー・Paywall表示判定用）
    @Published private(set) var nudgeCardCompletedCount: Int = 0

    /// 月間NudgeCard完了回数（通知制限用、月初リセット）
    @Published private(set) var monthlyNudgeCount: Int = 0

    /// レビューリクエスト済みフラグ
    @Published private(set) var hasRequestedReview: Bool = false
    
    // 日付変更時のリフレッシュ用（Viewの強制再描画トリガー）
    @Published private(set) var dailyRefreshTrigger: UUID = UUID()
    
    /// アプリがフォアグラウンドに戻った時に呼び出し、Viewの再描画をトリガー
    func triggerDailyRefresh() {
        dailyRefreshTrigger = UUID()
    }
    
    // Phase-7: sensor permissions + integration toggles
    @Published private(set) var sensorAccess: SensorAccessState
    private(set) var needsSensorRepairAfterOnboarding: Bool = false
    
    enum SensorRepairSource {
        case remoteSync
        case onboardingCompleted
        case explicitUserAction
        case foreground
    }
    
    enum RootTab: Int, Hashable {
        case myPath = 0
        case profile = 1
    }
    @Published var selectedRootTab: RootTab = .myPath

    private let defaults = UserDefaults.standard
    private let onboardingKey = "com.anicca.onboardingComplete"
    private let onboardingStepKey = "com.anicca.onboardingStep"
    private let userCredentialsKey = "com.anicca.userCredentials"
    private let userProfileKey = "com.anicca.userProfile"
    private let subscriptionKey = "com.anicca.subscription"
    private let sensorAccessBaseKey = "com.anicca.sensorAccessState"
    private let sensorRepairPendingKey = "com.anicca.sensorRepairPending"
    
    // Nudge Card / Paywall / Review keys
    private let nudgeCardCompletedCountKey = "com.anicca.nudgeCardCompletedCount"
    private let monthlyNudgeCountKey = "com.anicca.monthlyNudgeCount"
    private let hasRequestedReviewKey = "com.anicca.hasRequestedReview"
    private let lastNudgeResetMonthKey = "com.anicca.lastNudgeResetMonth"
    private let lastNudgeResetYearKey = "com.anicca.lastNudgeResetYear"

    private let sensorLogger = Logger(subsystem: "com.anicca.ios", category: "SensorAccess")

    private init() {
        self.isOnboardingComplete = defaults.bool(forKey: onboardingKey)

        // オンボーディング未完了時は強制的に.welcomeから開始
        if defaults.bool(forKey: onboardingKey) {
            let rawValue = defaults.integer(forKey: onboardingStepKey)
            self.onboardingStep = OnboardingStep.migratedFromLegacyRawValue(rawValue)
        } else {
            defaults.removeObject(forKey: onboardingStepKey)
            self.onboardingStep = .welcome
        }

        self.authStatus = AuthStatus.signedOut
        self.sensorAccess = Self.loadSensorAccess(from: defaults, key: sensorAccessBaseKey, userId: nil)
        self.userProfile = UserProfile()
        self.subscriptionInfo = .free
        self.authStatus = loadUserCredentials()
        self.userProfile = loadUserProfile()
        migrateStruggles()
        syncPreferredLanguageWithSystem()
        self.subscriptionInfo = loadSubscriptionInfo()
        self.sensorAccess = Self.loadSensorAccess(from: defaults, key: sensorAccessBaseKey, userId: authStatus.userId)
        self.needsSensorRepairAfterOnboarding = defaults.bool(forKey: sensorRepairPendingKey)

        // Phase 4: Nudge Card / Paywall / Review
        self.nudgeCardCompletedCount = defaults.integer(forKey: nudgeCardCompletedCountKey)
        self.monthlyNudgeCount = defaults.integer(forKey: monthlyNudgeCountKey)
        self.hasRequestedReview = defaults.bool(forKey: hasRequestedReviewKey)

        // 月初リセットチェック
        checkAndResetMonthlyNudgeCountIfNeeded()

        // アプリ起動時にignored判定を実行
        Task {
            await NudgeStatsManager.shared.checkAndRecordIgnored()
        }

        Task { [weak self] in
            await self?.refreshSensorAccessAuthorizations(forceReauthIfNeeded: false)
        }
        
        // v0.4: 匿名ユーザーでもサーバーからプロフィールを復元
        Task { await bootstrapProfileFromServerIfAvailable() }

        // Phase 6: LLM生成Nudgeを取得（device_idベース、認証不要）
        Task {
            await fetchTodaysLLMNudges()
        }

        // AlarmKit 移行処理（v1.3.0 以降で一度だけ実行）
        migrateFromAlarmKit()
    }

    // MARK: - Phase 6: LLM生成Nudge

    /// 今日生成されたLLM生成Nudgeを取得してキャッシュに保存
    func fetchTodaysLLMNudges() async {
        logger.info("🔄 [LLM] Starting fetchTodaysLLMNudges...")
        do {
            let nudges = try await LLMNudgeService.shared.fetchTodaysNudges()
            await MainActor.run {
                LLMNudgeCache.shared.setNudges(nudges)
            }
            logger.info("✅ [LLM] Fetched and cached \(nudges.count) nudges")
        } catch {
            logger.error("❌ [LLM] Fetch failed: \(error.localizedDescription)")
        }
    }

    func markOnboardingComplete() {
        guard !isOnboardingComplete else { return }
        isOnboardingComplete = true
        defaults.set(true, forKey: onboardingKey)
        defaults.removeObject(forKey: onboardingStepKey)

        Task {
            // Proactive Agent: 問題ベースの通知をスケジュール
            await ProblemNotificationScheduler.shared.scheduleNotifications(for: userProfile.struggles)
            await MetricsUploader.shared.runUploadIfDue(force: true)
            MetricsUploader.shared.scheduleNextIfPossible()
            await scheduleSensorRepairIfNeeded(source: .onboardingCompleted)
        }
    }

    func resetState() {
        authStatus = .signedOut
        isOnboardingComplete = false
        onboardingStep = .welcome
        userProfile = UserProfile()
        subscriptionInfo = .free
        sensorAccess = .default
        clearUserCredentials()
        defaults.removeObject(forKey: onboardingStepKey)
    }
    
    func setOnboardingStep(_ step: OnboardingStep) {
        onboardingStep = step
        // オンボーディング未完了時のみステップを保存
        if !isOnboardingComplete {
            defaults.set(step.rawValue, forKey: onboardingStepKey)
        } else {
            // オンボーディング完了後はステップ情報を削除
            defaults.removeObject(forKey: onboardingStepKey)
        }
    }
    
    // MARK: - Authentication

    /// 認証状態の単一ソース（userId が有効かどうかで判定）
    var isSignedIn: Bool {
        guard let userId = authStatus.userId, !userId.isEmpty else {
            return false
        }
        return true
    }

    func setAuthStatus(_ status: AuthStatus) {
        authStatus = status
    }
    
    func updateUserCredentials(_ credentials: UserCredentials) {
        authStatus = .signedIn(credentials)
        saveUserCredentials(credentials)
        
        // App Groups に userId と deviceId を保存（Notification Service Extension 用）
        let appGroupDefaults = AppGroup.userDefaults
        appGroupDefaults.set(credentials.userId, forKey: "userId")
        appGroupDefaults.set(resolveDeviceId(), forKey: "deviceId")
        appGroupDefaults.set(AppConfig.proxyBaseURL.absoluteString, forKey: "ANICCA_PROXY_BASE_URL")

        sensorAccess = Self.loadSensorAccess(from: defaults, key: sensorAccessBaseKey, userId: credentials.userId)
        
        Task { [weak self] in
            await SensorAccessSyncService.shared.fetchLatest()
            await self?.refreshSensorAccessAuthorizations(forceReauthIfNeeded: true)
        }
        
        // Update displayName in profile if empty and Apple provided a name
        // Don't overwrite if credentials.displayName is empty or "User" (user will set it in profile step)
        if userProfile.displayName.isEmpty && !credentials.displayName.isEmpty && credentials.displayName != "User" {
            userProfile.displayName = credentials.displayName
            saveUserProfile()
        }
        Task { await SubscriptionManager.shared.handleLogin(appUserId: credentials.userId) }
        
        // Mixpanel: ユーザー識別
        AnalyticsManager.shared.identify(userId: credentials.userId)
        
        // Superwall: ユーザー識別
        SuperwallManager.shared.identify(userId: credentials.userId)
        
        // Phase 6: LLM生成Nudgeを取得
        Task {
            await fetchTodaysLLMNudges()
        }

        // v3: サインイン直後の無条件PUTは既存ユーザー上書き事故がありうるため、
        // 「オンボーディング中 かつ ローカルに入力済みがある」場合のみ同期する
        if !isOnboardingComplete && (!userProfile.ideals.isEmpty || !userProfile.struggles.isEmpty || !userProfile.displayName.isEmpty) {
            Task { await ProfileSyncService.shared.enqueue(profile: userProfile) }
        }
    }
    
    // Update only access token in currently signed-in credentials
    func updateAccessToken(token: String?, expiresAtMs: TimeInterval?) {
        guard case .signedIn(var creds) = authStatus else { return }
        creds.jwtAccessToken = token
        if let ms = expiresAtMs {
            creds.accessTokenExpiresAt = Date(timeIntervalSince1970: ms / 1000)
        }
        authStatus = .signedIn(creds)
        saveUserCredentials(creds)
    }
    
    func clearUserCredentials() {
        authStatus = .signedOut
        defaults.removeObject(forKey: userCredentialsKey)
        Task { await SubscriptionManager.shared.handleLogout() }
    }
    
    /// 通常ログアウト: デバイス権限/連携トグルは維持する（Account deletionとは別）
    func signOutPreservingSensorAccess() {
        authStatus = .signedOut
        userProfile = UserProfile()
        subscriptionInfo = .free
        cachedOffering = nil

        // Mixpanel: リセット
        AnalyticsManager.shared.reset()
        
        // Superwall: リセット
        SuperwallManager.shared.reset()
        
        // オンボーディングはサインアウト時に戻す
        isOnboardingComplete = false
        defaults.removeObject(forKey: onboardingKey)
        setOnboardingStep(.welcome)
        
        // UserDefaultsからユーザーデータを削除（sensorAccessBaseKeyは削除しない）
        defaults.removeObject(forKey: userCredentialsKey)
        defaults.removeObject(forKey: userProfileKey)
        defaults.removeObject(forKey: subscriptionKey)
        // ★ sensorAccessBaseKey は削除しない - デバイス権限はユーザーアカウントではなくデバイスに紐づく

        // 通知をすべてキャンセル
        Task {
            await ProblemNotificationScheduler.shared.cancelAllNotifications()
        }

        // RevenueCatからログアウト
        Task {
            await SubscriptionManager.shared.handleLogout()
        }
    }
    
    // Guideline 5.1.1(v)対応: アカウント削除時の完全な状態リセット
    func signOutAndWipe() {
        authStatus = .signedOut
        userProfile = UserProfile()
        subscriptionInfo = .free
        cachedOffering = nil

        // Mixpanel: リセット
        AnalyticsManager.shared.reset()

        // Superwall: リセット
        SuperwallManager.shared.reset()

        // オンボーディング状態をリセット
        isOnboardingComplete = false
        defaults.removeObject(forKey: onboardingKey)
        setOnboardingStep(.welcome)

        // UserDefaultsからすべてのユーザーデータを削除
        defaults.removeObject(forKey: userCredentialsKey)
        defaults.removeObject(forKey: userProfileKey)
        defaults.removeObject(forKey: subscriptionKey)
        defaults.removeObject(forKey: sensorAccessBaseKey)

        // 通知をすべてキャンセル
        Task {
            await ProblemNotificationScheduler.shared.cancelAllNotifications()
        }

        // RevenueCatからログアウト
        Task {
            await SubscriptionManager.shared.handleLogout()
        }
    }
    
    private func loadUserCredentials() -> AuthStatus {
        guard let data = defaults.data(forKey: userCredentialsKey),
              let credentials = try? JSONDecoder().decode(UserCredentials.self, from: data) else {
            return .signedOut
        }
        return .signedIn(credentials)
    }
    
    private func saveUserCredentials(_ credentials: UserCredentials) {
        if let data = try? JSONEncoder().encode(credentials) {
            defaults.set(data, forKey: userCredentialsKey)
        }
    }
    
    // MARK: - User Profile
    
    func updateUserProfile(_ profile: UserProfile, sync: Bool = true) {
        let previousProfile = userProfile
        userProfile = profile
        saveUserProfile()

        // Proactive Agent: 問題（苦しみ）が変更された場合、問題ベースの通知をスケジュール
        if Set(previousProfile.struggles) != Set(profile.struggles) {
            Task {
                await ProblemNotificationScheduler.shared.scheduleNotifications(for: profile.struggles)
            }
        }

        if sync {
            Task {
                await ProfileSyncService.shared.enqueue(profile: profile)
            }
        }
    }
    
    private func saveUserProfile() {
        if let data = try? JSONEncoder().encode(userProfile) {
            defaults.set(data, forKey: userProfileKey)
        }
    }
    
    func profileSyncPayload(for profile: UserProfile) -> [String: Any] {
        var payload: [String: Any] = [
            "displayName": profile.displayName,
            // Demographics (onboarding)
            "acquisitionSource": profile.acquisitionSource ?? "",
            "gender": profile.gender ?? "",
            "ageRange": profile.ageRange ?? "",
            "preferredLanguage": profile.preferredLanguage.rawValue,
            "sleepLocation": profile.sleepLocation,
            "trainingFocus": profile.trainingFocus,
            "wakeLocation": profile.wakeLocation,
            "wakeRoutines": profile.wakeRoutines,
            "sleepRoutines": profile.sleepRoutines,
            "trainingGoal": profile.trainingGoal,
            // v0.3 traits
            "ideals": profile.ideals,
            "struggles": profile.struggles,
            "keywords": profile.keywords,
            "summary": profile.summary,
            "nudgeIntensity": profile.nudgeIntensity.rawValue,
            "stickyMode": profile.stickyMode
        ]
        
        if let big5 = profile.big5 {
            var obj: [String: Any] = [
                "openness": big5.openness,
                "conscientiousness": big5.conscientiousness,
                "extraversion": big5.extraversion,
                "agreeableness": big5.agreeableness,
                "neuroticism": big5.neuroticism
            ]
            if let s = big5.summary { obj["summary"] = s }
            payload["big5"] = obj
        }
        
        payload["sensorAccess"] = sensorAccessForSync()
        
        return payload
    }
    
    func sensorAccessForSync() -> [String: Bool] {
        return [
            "screenTimeEnabled": sensorAccess.screenTimeEnabled,
            "sleepEnabled": sensorAccess.sleepEnabled,
            "stepsEnabled": sensorAccess.stepsEnabled,
            "motionEnabled": sensorAccess.motionEnabled
        ]
    }
    
    func bootstrapProfileFromServerIfAvailable() async {
        // v0.4: 匿名ユーザーでもdevice_idでプロフィールを復元
        let userId: String
        if case .signedIn(let credentials) = authStatus {
            userId = credentials.userId
        } else {
            userId = resolveDeviceId()
        }
        
        isBootstrappingProfile = true
        defer { isBootstrappingProfile = false }
        
        var request = URLRequest(url: AppConfig.profileSyncURL)
        request.httpMethod = "GET"
        request.setValue(resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(userId, forHTTPHeaderField: "user-id")
        
        do {
            let (data, response) = try await NetworkSessionManager.shared.session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return
            }
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return
            }
            applyRemoteProfilePayload(json)
        } catch {
            // ネットワークがない場合などは無視してローカル状態を継続
        }
    }
    
    // MARK: - Device ID
    
    func resolveDeviceId() -> String {
        return UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
    }
    
    
    func updateSleepLocation(_ location: String) {
        var profile = userProfile
        profile.sleepLocation = location
        updateUserProfile(profile, sync: true)
    }
    
    func updateTrainingFocus(_ focus: [String]) {
        var profile = userProfile
        profile.trainingFocus = focus
        updateUserProfile(profile, sync: true)
    }
    
    // MARK: - Language Detection
    
    var effectiveLanguage: LanguagePreference {
        userProfile.preferredLanguage
    }
    
    private func syncPreferredLanguageWithSystem() {
        let systemLanguage = LanguagePreference.detectDefault()
        guard userProfile.preferredLanguage != systemLanguage else { return }
        userProfile.preferredLanguage = systemLanguage
        saveUserProfile()
        sensorLogger.info("AppState: preferredLanguage synced to \(systemLanguage.rawValue)")
    }
    
    private func loadUserProfile() -> UserProfile {
        guard let data = defaults.data(forKey: userProfileKey),
              let profile = try? JSONDecoder().decode(UserProfile.self, from: data) else {
            // Initialize with detected language from device locale
            return UserProfile(preferredLanguage: LanguagePreference.detectDefault())
        }
        // If preferredLanguage is not set or invalid, detect from locale
        var loadedProfile = profile
        if loadedProfile.preferredLanguage.rawValue.isEmpty {
            loadedProfile.preferredLanguage = LanguagePreference.detectDefault()
        }
        return loadedProfile
    }
    
    // MARK: - Phase 3: Struggle Migration
    
    /// 古いstruggleキーを新しい問題タイプにマイグレーション
    private static let migrationMapping: [String: String] = [
        "poor_sleep": "staying_up_late",
        "stress": "", // 削除（広すぎる）
        "self_doubt": "self_loathing",
        "motivation": "procrastination",
        "focus": "procrastination",
        "time_management": "", // 削除
        "burnout": "", // 削除
        "relationships": "loneliness",
        "energy": "", // 削除
        "work_life_balance": "" // 削除
    ]
    
    /// 古いstruggleキーを新しい問題タイプにマイグレーション
    private func migrateStruggles() {
        var newStruggles: [String] = []
        for struggle in userProfile.struggles {
            if let newKey = Self.migrationMapping[struggle] {
                if !newKey.isEmpty && !newStruggles.contains(newKey) {
                    newStruggles.append(newKey)
                }
            } else if ProblemType(rawValue: struggle) != nil {
                // 既に新しいキーの場合はそのまま
                if !newStruggles.contains(struggle) {
                    newStruggles.append(struggle)
                }
            }
            // マッピングにない場合は削除
        }
        
        if newStruggles != userProfile.struggles {
            var profile = userProfile
            profile.struggles = newStruggles
            profile.problems = newStruggles // problemsはstrugglesのalias
            userProfile = profile
            saveUserProfile()
        }
    }
    
    // MARK: - Subscription Info
    
    var shouldShowPaywall: Bool {
        !subscriptionInfo.isEntitled && !subscriptionHold
    }
    
    func clearSubscriptionCache() {
        subscriptionInfo = .free
        updateOffering(nil)
    }
    
    func updateSubscriptionInfo(_ info: SubscriptionInfo) {
        let wasEntitled = subscriptionInfo.isEntitled
        subscriptionInfo = info
        if let data = try? JSONEncoder().encode(info) {
            defaults.set(data, forKey: subscriptionKey)
        }
        // 購読状態が「非→有」になった時だけホールド解除（購入完了など）
        // エビデンス: 利用量のバックグラウンド同期でホールドが勝手に落ちるのを防ぐ
        if !wasEntitled && info.isEntitled {
            subscriptionHold = false
            subscriptionHoldPlan = nil
            quotaHoldReason = nil
        }
    }
    
    func markQuotaHold(plan: SubscriptionInfo.Plan?, reason: QuotaHoldReason = .quotaExceeded) {
        subscriptionHoldPlan = plan
        subscriptionHold = plan != nil
        quotaHoldReason = reason
    }
    
    func updatePurchaseEnvironment(_ status: PurchaseEnvironmentStatus) {
        purchaseEnvironmentStatus = status
    }
    
    func updateOffering(_ offering: Offering?) {
        cachedOffering = offering
    }
    
    func loadSubscriptionInfo() -> SubscriptionInfo {
        guard let data = defaults.data(forKey: subscriptionKey),
              let info = try? JSONDecoder().decode(SubscriptionInfo.self, from: data) else {
            return .free
        }
        return info
    }
    
    // MARK: - UserProfile Update Methods
    
    // MARK: - Demographics (onboarding)
    
    func updateAcquisitionSource(_ source: String) {
        var profile = userProfile
        profile.acquisitionSource = source
        updateUserProfile(profile, sync: true)
    }
    
    func updateGender(_ gender: String) {
        var profile = userProfile
        profile.gender = gender
        updateUserProfile(profile, sync: true)
    }
    
    func updateAgeRange(_ ageRange: String) {
        var profile = userProfile
        profile.ageRange = ageRange
        updateUserProfile(profile, sync: true)
    }
    
    func updateWakeLocation(_ location: String) {
        var profile = userProfile
        profile.wakeLocation = location
        updateUserProfile(profile, sync: true)
    }
    
    func updateWakeRoutines(_ routines: [String]) {
        var profile = userProfile
        profile.wakeRoutines = routines.filter { !$0.isEmpty }
        updateUserProfile(profile, sync: true)
    }
    
    func updateSleepRoutines(_ routines: [String]) {
        var profile = userProfile
        profile.sleepRoutines = routines.filter { !$0.isEmpty }
        updateUserProfile(profile, sync: true)
    }
    
    func updateTrainingGoal(_ goal: String) {
        var profile = userProfile
        profile.trainingGoal = goal
        updateUserProfile(profile, sync: true)
    }
    
    func updateIdealTraits(_ traits: [String]) {
        var profile = userProfile
        profile.idealTraits = traits
        updateUserProfile(profile, sync: true)
    }
    
    // MARK: - v0.3 Traits update helpers
    
    func updateTraits(ideals: [String], struggles: [String]) {
        var profile = userProfile
        profile.ideals = ideals
        profile.struggles = struggles
        updateUserProfile(profile, sync: true)
    }
    
    func updateBig5(_ scores: Big5Scores?) {
        var profile = userProfile
        profile.big5 = scores
        updateUserProfile(profile, sync: true)
    }
    
    func updateNudgeIntensity(_ intensity: NudgeIntensity) {
        var profile = userProfile
        profile.nudgeIntensity = intensity
        updateUserProfile(profile, sync: true)
    }
    
    func setStickyMode(_ enabled: Bool) {
        var profile = userProfile
        profile.stickyMode = enabled
        updateUserProfile(profile, sync: true)
    }

    // MARK: - Proactive Agent: NudgeCard

    /// NudgeCardを表示
    func showNudgeCard(_ content: NudgeContent) {
        pendingNudgeCard = content
    }

    /// NudgeCardを閉じる
    func dismissNudgeCard() {
        pendingNudgeCard = nil
    }

    // MARK: - Nudge Card / Paywall / Review Methods

    /// NudgeCard完了回数をインクリメント
    func incrementNudgeCardCompletedCount() {
        nudgeCardCompletedCount += 1
        defaults.set(nudgeCardCompletedCount, forKey: nudgeCardCompletedCountKey)
    }

    /// 月間NudgeCard完了回数をインクリメント
    func incrementMonthlyNudgeCount() {
        monthlyNudgeCount += 1
        defaults.set(monthlyNudgeCount, forKey: monthlyNudgeCountKey)
    }

    /// レビューリクエスト済みとしてマーク
    func markReviewRequested() {
        hasRequestedReview = true
        defaults.set(true, forKey: hasRequestedReviewKey)
    }

    /// 月間NudgeCard完了回数をリセット
    func resetMonthlyNudgeCount() {
        monthlyNudgeCount = 0
        defaults.set(0, forKey: monthlyNudgeCountKey)
    }

    /// Nudge受信可能かどうか
    var canReceiveNudge: Bool {
        if subscriptionInfo.plan == .pro { return true }
        return monthlyNudgeCount < 10
    }

    /// 月初リセットチェック（アプリ起動時に呼び出す）
    func checkAndResetMonthlyNudgeCountIfNeeded() {
        let calendar = Calendar.current
        let now = Date()
        let currentMonth = calendar.component(.month, from: now)
        let currentYear = calendar.component(.year, from: now)

        let lastMonth = defaults.integer(forKey: lastNudgeResetMonthKey)
        let lastYear = defaults.integer(forKey: lastNudgeResetYearKey)

        if currentYear != lastYear || currentMonth != lastMonth {
            resetMonthlyNudgeCount()
            defaults.set(currentMonth, forKey: lastNudgeResetMonthKey)
            defaults.set(currentYear, forKey: lastNudgeResetYearKey)

            // 月が変わったら通知を再スケジュール
            Task {
                await ProblemNotificationScheduler.shared.scheduleNotifications(for: userProfile.struggles)
            }
        }
    }

    // MARK: - v0.3 Quote
    
    var todayQuote: String {
        QuoteProvider.shared.todayQuote(
            preferredLanguage: userProfile.preferredLanguage,
            date: Date()
        )
    }
    
    // MARK: - Private Helpers

    private func applyRemoteProfilePayload(_ payload: [String: Any]) {
        var profile = userProfile
        if let name = payload["displayName"] as? String {
            profile.displayName = name
        }
        
        // Demographics (onboarding)
        if let acquisitionSource = payload["acquisitionSource"] as? String {
            profile.acquisitionSource = acquisitionSource.isEmpty ? nil : acquisitionSource
        }
        if let gender = payload["gender"] as? String {
            profile.gender = gender.isEmpty ? nil : gender
        }
        if let ageRange = payload["ageRange"] as? String {
            profile.ageRange = ageRange.isEmpty ? nil : ageRange
        }
        
        if let preferredLanguage = payload["preferredLanguage"] as? String,
           let language = LanguagePreference(rawValue: preferredLanguage) {
            // デバイスの言語設定を優先: サーバーの言語とデバイスの言語が一致する場合のみ適用
            let deviceLanguage = LanguagePreference.detectDefault()
            if deviceLanguage == language {
                profile.preferredLanguage = language
            }
            // 一致しない場合はデバイスの言語を維持（サーバーが間違った言語を返しても上書きしない）
        }
        if let sleepLocation = payload["sleepLocation"] as? String {
            profile.sleepLocation = sleepLocation
        }
        if let trainingFocus = payload["trainingFocus"] as? [String] {
            profile.trainingFocus = trainingFocus
        }
        if let wakeLocation = payload["wakeLocation"] as? String {
            profile.wakeLocation = wakeLocation
        }
        if let wakeRoutines = payload["wakeRoutines"] as? [String] {
            profile.wakeRoutines = wakeRoutines
        }
        if let sleepRoutines = payload["sleepRoutines"] as? [String] {
            profile.sleepRoutines = sleepRoutines
        }
        if let trainingGoal = payload["trainingGoal"] as? String {
            profile.trainingGoal = trainingGoal
        }
        // v0.3 traits (prefer new keys, fallback to legacy)
        if let ideals = payload["ideals"] as? [String] {
            // v3: リモートが空配列ならローカルの非空値を保持（オンボーディングで設定した値が消えない）
            if !ideals.isEmpty || profile.ideals.isEmpty {
                profile.ideals = ideals
            }
        } else if let idealTraits = payload["idealTraits"] as? [String], !idealTraits.isEmpty || profile.ideals.isEmpty {
            profile.ideals = idealTraits
        }
        if let struggles = payload["struggles"] as? [String] {
            if !struggles.isEmpty || profile.struggles.isEmpty {
                profile.struggles = struggles
            }
        } else if let problems = payload["problems"] as? [String], !problems.isEmpty || profile.struggles.isEmpty {
            profile.struggles = problems
        }
        if let keywords = payload["keywords"] as? [String] {
            profile.keywords = keywords
        }
        if let summary = payload["summary"] as? String {
            profile.summary = summary
        }
        if let intensity = payload["nudgeIntensity"] as? String,
           let v = NudgeIntensity(rawValue: intensity) {
            profile.nudgeIntensity = v
        }
        if let big5 = payload["big5"] as? [String: Any] {
            let scores = Big5Scores(
                openness: big5["openness"] as? Int ?? 0,
                conscientiousness: big5["conscientiousness"] as? Int ?? 0,
                extraversion: big5["extraversion"] as? Int ?? 0,
                agreeableness: big5["agreeableness"] as? Int ?? 0,
                neuroticism: big5["neuroticism"] as? Int ?? 0,
                summary: big5["summary"] as? String
            )
            profile.big5 = scores
        }
        // Stickyモード（後方互換: stickyModeEnabled / wakeStickyModeEnabled も読み取る）
        if let sticky = payload["stickyMode"] as? Bool {
            profile.stickyMode = sticky
        } else if let sticky = payload["stickyModeEnabled"] as? Bool {
            profile.stickyMode = sticky
        } else if let oldSticky = payload["wakeStickyModeEnabled"] as? Bool {
            profile.stickyMode = oldSticky
        }
        updateUserProfile(profile, sync: false)

        if let sensor = payload["sensorAccess"] as? [String: Bool] {
            sensorAccess.screenTimeEnabled = sensor["screenTimeEnabled"] ?? sensorAccess.screenTimeEnabled
            sensorAccess.sleepEnabled = sensor["sleepEnabled"] ?? sensorAccess.sleepEnabled
            sensorAccess.stepsEnabled = sensor["stepsEnabled"] ?? sensorAccess.stepsEnabled
            sensorAccess.motionEnabled = sensor["motionEnabled"] ?? sensorAccess.motionEnabled
            saveSensorAccess()
            Task { await refreshSensorAccessAuthorizations(forceReauthIfNeeded: false) }
        }
        
        // v3: サーバーにデータがあっても、オンボーディング強制完了はしない
        // Notifications画面を必ず通すため、isOnboardingCompleteの自動更新を廃止
        // オンボーディング完了は markOnboardingComplete() でのみ行う
    }

    @MainActor
    func refreshSensorAccessAuthorizations(forceReauthIfNeeded _: Bool) async {
        // HealthKitの書き込み権限ステータスを確認（参考値として）
#if canImport(HealthKit)
        // 読み取り権限は正確に判定できないため、ローカルに保存された状態を維持
        // ユーザーがシステム設定から明示的に権限を取り消した場合のみfalseにする
        // しかし、HealthKitはこれを検出する手段を提供していないため、
        // 一度許可された状態は維持する
        let sleepAuthorized = sensorAccess.sleepAuthorized  // ← 既存のローカル状態を使用
        let stepsAuthorized = sensorAccess.stepsAuthorized  // ← 既存のローカル状態を使用
#else
        let sleepAuthorized = false
        let stepsAuthorized = false
#endif
        // ScreenTime API removed for App Store compliance
        let screenTimeAuthorized = false

        var next = sensorAccess
        let wantedSleep = next.sleepEnabled
        let wantedSteps = next.stepsEnabled
        let wantedScreen = next.screenTimeEnabled

        next.sleepAuthorized = sleepAuthorized
        next.stepsAuthorized = stepsAuthorized
        next.screenTimeAuthorized = screenTimeAuthorized
        next.healthKit = (sleepAuthorized || stepsAuthorized) ? .authorized : .denied
        next.screenTime = screenTimeAuthorized ? .authorized : .denied

        // keep user intent; data収集は *Enabled && *Authorized でゲート
        next.sleepEnabled = wantedSleep
        next.stepsEnabled = wantedSteps
        next.screenTimeEnabled = wantedScreen

        if next != sensorAccess {
            sensorAccess = next
            saveSensorAccess()
            scheduleSensorAccessSync(next)
        }

        let needsRefresh = (next.sleepEnabled && next.sleepAuthorized)
            || (next.stepsEnabled && next.stepsAuthorized)
            || (next.screenTimeEnabled && next.screenTimeAuthorized)
        if needsRefresh {
            await MetricsUploader.shared.runUploadIfDue(force: true)
        }
    }

    // MARK: - Phase-7: Sensor Access State
    
    private static func loadSensorAccess(from defaults: UserDefaults, key: String, userId: String?) -> SensorAccessState {
        if let userId,
           let data = defaults.data(forKey: "\(key).\(userId)"),
           let decoded = try? JSONDecoder().decode(SensorAccessState.self, from: data) {
            return decoded
        }
        if let data = defaults.data(forKey: key),
           let decoded = try? JSONDecoder().decode(SensorAccessState.self, from: data) {
            return decoded
        }
        return .default
    }
    
    private func saveSensorAccess(for userId: String? = nil) {
        let key = sensorAccessStorageKey(for: userId ?? currentUserId)
        if let data = try? JSONEncoder().encode(sensorAccess) {
            defaults.set(data, forKey: key)
        }
    }

    func mergeRemoteSensorAccess(sleep: Bool, steps: Bool, screenTime: Bool, motion: Bool) {
        var next = sensorAccess
        if sleep { next.sleepEnabled = true }
        if steps { next.stepsEnabled = true }
        if screenTime { next.screenTimeEnabled = true }
        if motion { next.motionEnabled = true }
        sensorAccess = next
        saveSensorAccess()
        Task {
            await refreshSensorAccessAuthorizations(forceReauthIfNeeded: false)
            await scheduleSensorRepairIfNeeded(source: .remoteSync)
        }
    }

    private func sensorAccessStorageKey(for userId: String?) -> String {
        guard let userId, !userId.isEmpty else { return sensorAccessBaseKey }
        return "\(sensorAccessBaseKey).\(userId)"
    }

    private var currentUserId: String? {
        authStatus.userId
    }
    
    // MARK: - Phase-7: integration toggles entry points (quiet fallback)
    
    func setScreenTimeEnabled(_ enabled: Bool) {
        sensorAccess.screenTimeEnabled = enabled
        saveSensorAccess()
        Task {
            await ProfileSyncService.shared.enqueue(profile: userProfile, sensorAccess: sensorAccessForSync())
        }
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func setSleepEnabled(_ enabled: Bool) {
        sensorAccess.sleepEnabled = enabled
        saveSensorAccess()
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func setStepsEnabled(_ enabled: Bool) {
        sensorAccess.stepsEnabled = enabled
        saveSensorAccess()
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func updateSleepAuthorizationStatus(_ authorized: Bool) {
        sensorAccess.sleepAuthorized = authorized
        saveSensorAccess()
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func updateStepsAuthorizationStatus(_ authorized: Bool) {
        sensorAccess.stepsAuthorized = authorized
        saveSensorAccess()
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func setMotionEnabled(_ enabled: Bool) {
        sensorAccess.motionEnabled = enabled
        saveSensorAccess()
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func updateScreenTimePermission(_ status: SensorPermissionStatus) {
        sensorAccess.screenTime = status
        if status != .authorized { sensorAccess.screenTimeEnabled = false }
        saveSensorAccess()
    }
    
    func updateHealthKitPermission(_ status: SensorPermissionStatus) {
        sensorAccess.healthKit = status
        // 権限を失ってもトグル意図は保持する
        saveSensorAccess()
    }
    
    func updateMotionPermission(_ status: SensorPermissionStatus) {
        sensorAccess.motion = status
        if status != .authorized { sensorAccess.motionEnabled = false }
        saveSensorAccess()
    }
    
    private func scheduleSensorAccessSync(_ access: SensorAccessState) {
        Task.detached(priority: .utility) { [access] in
            await SensorAccessSyncService.shared.sync(access: access)
        }
    }
    
    func updateSensorAccess(_ access: SensorAccessState) {
        sensorAccess = access
        saveSensorAccess()
        scheduleSensorAccessSync(access)
    }
    
    func scheduleSensorRepairIfNeeded(source: SensorRepairSource) async {
        let needsRepairNow = (sensorAccess.sleepEnabled && !sensorAccess.sleepAuthorized)
            || (sensorAccess.stepsEnabled && !sensorAccess.stepsAuthorized)
        if needsRepairNow {
            persistSensorRepairPending()
            sensorLogger.info("HealthKit authorization missing while enabled (source=\(String(describing: source)))")
        } else {
            clearSensorRepairPending()
        }
    }
    
    private func persistSensorRepairPending(_ value: Bool = true) {
        needsSensorRepairAfterOnboarding = value
        defaults.set(value, forKey: sensorRepairPendingKey)
    }
    
    private func clearSensorRepairPending() {
        persistSensorRepairPending(false)
    }

    // MARK: - AlarmKit Migration

    private let alarmKitMigrationKey = "alarmKitMigrationCompleted_v1_3_0"

    /// プロダクション用移行関数（init() から呼び出し）
    func migrateFromAlarmKit() {
        Task {
            await migrateFromAlarmKitTestable(
                scheduler: ProblemNotificationScheduler.shared,
                problems: self.userProfile.struggles
            )
        }
    }

    // MARK: - DEBUG Methods

    #if DEBUG
    /// DEBUG用: NudgeCard完了回数を設定
    func debugSetNudgeCardCompletedCount(_ count: Int) {
        nudgeCardCompletedCount = count
        defaults.set(count, forKey: nudgeCardCompletedCountKey)
    }

    /// DEBUG用: 月間NudgeCard完了回数を設定
    func debugSetMonthlyNudgeCount(_ count: Int) {
        monthlyNudgeCount = count
        defaults.set(count, forKey: monthlyNudgeCountKey)
    }

    /// DEBUG用: 月変わりをシミュレート
    func debugSimulateMonthChange() {
        resetMonthlyNudgeCount()
        Task {
            await ProblemNotificationScheduler.shared.scheduleNotifications(for: userProfile.struggles)
        }
    }
    #endif
}

extension AuthStatus {
    var accessToken: String? {
        switch self {
        case .signedIn(let c): return c.jwtAccessToken
        default: return nil
        }
    }

    var userId: String? {
        switch self {
        case .signedIn(let c): return c.userId
        default: return nil
        }
    }
}

enum PurchaseEnvironmentStatus: Codable, Equatable {
    case ready
    case accountMissing
    case paymentsDisabled

    var message: LocalizedStringKey {
        switch self {
        case .ready:
            return ""
        case .accountMissing:
            return "settings_subscription_account_missing"
        case .paymentsDisabled:
            return "settings_subscription_payments_disabled"
        }
    }
}

// MARK: - AlarmKit Migration (Testable)

/// テスト可能な移行関数（Scheduler と問題リストを注入可能）
func migrateFromAlarmKitTestable(
    scheduler: ProblemNotificationSchedulerProtocol,
    problems: [String]
) async {
    let migrationKey = "alarmKitMigrationCompleted_v1_3_0"
    guard !UserDefaults.standard.bool(forKey: migrationKey) else { return }

    // AlarmKit API は削除済みのため、呼び出し不要
    // → iOS システムが自動的に既存アラームを無効化

    // 通知を再スケジュール（問題リストを渡す）
    await scheduler.scheduleNotifications(for: problems)

    UserDefaults.standard.set(true, forKey: migrationKey)
}

// MARK: - Single Screen Display Conditions

/// View 表示条件判定ヘルパー
enum SingleScreenDisplayConditions {
    static func shouldShowSignOutButton(isSignedIn: Bool) -> Bool {
        return isSignedIn
    }

    static func shouldShowDeleteAccountButton(isSignedIn: Bool) -> Bool {
        return isSignedIn
    }

    static func shouldShowSubscribeButton(plan: SubscriptionInfo.Plan) -> Bool {
        return plan == .free
    }

    static func shouldShowCancelSubscriptionButton(plan: SubscriptionInfo.Plan) -> Bool {
        return plan == .pro
    }
}
