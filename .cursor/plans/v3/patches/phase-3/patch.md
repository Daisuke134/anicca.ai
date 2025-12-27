# Phase 3 (iOS基盤) 擬似パッチ — v0.3

対象: `todolist.md` フェーズ3（3.1〜3.7）  
出典: `migration-patch-v3.md`（1.1〜1.4, 7.3, 2.3/8）, `file-structure-v3.md`, `v3-ui.md`/`v3-ux.md`, `quotes-v3.md`

---

## 決定事項（必須チェック対応）

### 旧フィールド → 新フィールド移行（idealTraits / problems / stickyModeEnabled）

- **永続化キー**: 既存どおり `com.anicca.userProfile`（`UserProfile` 全体をJSON保存）を継続。新しい個別キーは追加しない（現行設計に揃える）。
- **デコード優先順**（`UserProfile.init(from:)`）:
  - `ideals` があればそれを採用、なければ `idealTraits` を `ideals` にマップ
  - `struggles` があればそれを採用、なければ `problems` を `struggles` にマップ
  - `stickyMode` があればそれを採用、なければ `stickyModeEnabled` → `wakeStickyModeEnabled` の順で `stickyMode` にマップ
- **エンコード方針**: 新キーのみ（`ideals/struggles/stickyMode`）を書き出し、旧キーは書き出さない。
- **既存参照の互換**: 既存コード（`SettingsView`/`VoiceSessionController`/既存プロンプト等）が参照している
  `idealTraits/problems/stickyModeEnabled` は **computed alias** として残す（UI/既存ロジックを壊さない）。

### Networkエラー整形（serverレスポンス整合）

- **server共通形式**: `migration-patch-v3.md 7.1` の `{"error":{"code","message","details"}}` を一次ソースとし、
  iOS側は `NetworkSessionManager` に **共通のパース＋マッピング**（`AniccaAPIError`）を追加する。
- **後方互換**: 旧形式（`error: "message"` のみ）も受けられるように `error` が `String` の場合は `message` 扱いにフォールバック。

---

## apply_patch 互換 V4A パッチ

```text
*** Begin Patch

*** Update File: aniccaios/aniccaios/Models/UserProfile.swift
@@
 import Foundation
 
 enum LanguagePreference: String, Codable {
@@
 }
 
-struct UserProfile: Codable {
-    var displayName: String
-    var preferredLanguage: LanguagePreference
-    var sleepLocation: String
-    var trainingFocus: [String]
-    
-    // 追加フィールド
-    var wakeLocation: String
-    var wakeRoutines: [String]
-    var sleepRoutines: [String]
-    var trainingGoal: String
-    var idealTraits: [String]
-    var problems: [String]
-    
-    // AlarmKit設定（各習慣ごと）
-    var useAlarmKitForWake: Bool
-    var useAlarmKitForTraining: Bool
-    var useAlarmKitForBedtime: Bool
-    var useAlarmKitForCustom: Bool
-    
-    // Stickyモード（全習慣共通）
-    var stickyModeEnabled: Bool
-    
-    init(
-        displayName: String = "",
-        preferredLanguage: LanguagePreference = LanguagePreference.detectDefault(),
-        sleepLocation: String = "",
-        trainingFocus: [String] = [],
-        wakeLocation: String = "",
-        wakeRoutines: [String] = [],
-        sleepRoutines: [String] = [],
-        trainingGoal: String = "",
-        idealTraits: [String] = [],
-        problems: [String] = [],
-        useAlarmKitForWake: Bool = true,
-        useAlarmKitForTraining: Bool = false,
-        useAlarmKitForBedtime: Bool = false,
-        useAlarmKitForCustom: Bool = false,
-        stickyModeEnabled: Bool = true
-    ) {
-        self.displayName = displayName
-        self.preferredLanguage = preferredLanguage
-        self.sleepLocation = sleepLocation
-        self.trainingFocus = trainingFocus
-        self.wakeLocation = wakeLocation
-        self.wakeRoutines = wakeRoutines
-        self.sleepRoutines = sleepRoutines
-        self.trainingGoal = trainingGoal
-        self.idealTraits = idealTraits
-        self.problems = problems
-        self.useAlarmKitForWake = useAlarmKitForWake
-        self.useAlarmKitForTraining = useAlarmKitForTraining
-        self.useAlarmKitForBedtime = useAlarmKitForBedtime
-        self.useAlarmKitForCustom = useAlarmKitForCustom
-        self.stickyModeEnabled = stickyModeEnabled
-    }
-    
-    // 既存データとの互換性のためのカスタムデコーディング
-    enum CodingKeys: String, CodingKey {
-        case displayName, preferredLanguage, sleepLocation, trainingFocus
-        case wakeLocation, wakeRoutines, sleepRoutines, trainingGoal, idealTraits
-        case problems
-        case useAlarmKitForWake, useAlarmKitForTraining, useAlarmKitForBedtime, useAlarmKitForCustom
-        case stickyModeEnabled, wakeStickyModeEnabled // 後方互換用
-    }
-    
-    init(from decoder: Decoder) throws {
-        let container = try decoder.container(keyedBy: CodingKeys.self)
-        displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
-        preferredLanguage = try container.decodeIfPresent(LanguagePreference.self, forKey: .preferredLanguage) ?? LanguagePreference.detectDefault()
-        sleepLocation = try container.decodeIfPresent(String.self, forKey: .sleepLocation) ?? ""
-        trainingFocus = try container.decodeIfPresent([String].self, forKey: .trainingFocus) ?? []
-        wakeLocation = try container.decodeIfPresent(String.self, forKey: .wakeLocation) ?? ""
-        wakeRoutines = try container.decodeIfPresent([String].self, forKey: .wakeRoutines) ?? []
-        sleepRoutines = try container.decodeIfPresent([String].self, forKey: .sleepRoutines) ?? []
-        trainingGoal = try container.decodeIfPresent(String.self, forKey: .trainingGoal) ?? ""
-        idealTraits = try container.decodeIfPresent([String].self, forKey: .idealTraits) ?? []
-        problems = try container.decodeIfPresent([String].self, forKey: .problems) ?? []
-        
-        // AlarmKit設定（各習慣ごと）
-        useAlarmKitForWake = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForWake) ?? true
-        useAlarmKitForTraining = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForTraining) ?? false
-        useAlarmKitForBedtime = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForBedtime) ?? false
-        useAlarmKitForCustom = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForCustom) ?? false
-        
-        // カスタム習慣のAlarmKitは常にOFFから始める（既存ユーザーも含めてリセット）
-        useAlarmKitForCustom = false
-        
-        // Stickyモード（後方互換: wakeStickyModeEnabled も読み取る）
-        if let sticky = try container.decodeIfPresent(Bool.self, forKey: .stickyModeEnabled) {
-            stickyModeEnabled = sticky
-        } else if let oldSticky = try container.decodeIfPresent(Bool.self, forKey: .wakeStickyModeEnabled) {
-            stickyModeEnabled = oldSticky
-        } else {
-            stickyModeEnabled = true
-        }
-    }
-    
-    func encode(to encoder: Encoder) throws {
-        var container = encoder.container(keyedBy: CodingKeys.self)
-        try container.encode(displayName, forKey: .displayName)
-        try container.encode(preferredLanguage, forKey: .preferredLanguage)
-        try container.encode(sleepLocation, forKey: .sleepLocation)
-        try container.encode(trainingFocus, forKey: .trainingFocus)
-        try container.encode(wakeLocation, forKey: .wakeLocation)
-        try container.encode(wakeRoutines, forKey: .wakeRoutines)
-        try container.encode(sleepRoutines, forKey: .sleepRoutines)
-        try container.encode(trainingGoal, forKey: .trainingGoal)
-        try container.encode(idealTraits, forKey: .idealTraits)
-        try container.encode(problems, forKey: .problems)
-        try container.encode(useAlarmKitForWake, forKey: .useAlarmKitForWake)
-        try container.encode(useAlarmKitForTraining, forKey: .useAlarmKitForTraining)
-        try container.encode(useAlarmKitForBedtime, forKey: .useAlarmKitForBedtime)
-        try container.encode(useAlarmKitForCustom, forKey: .useAlarmKitForCustom)
-        try container.encode(stickyModeEnabled, forKey: .stickyModeEnabled)
-        // wakeStickyModeEnabled は後方互換のデコード用のみなのでエンコードしない
-    }
-}
+// MARK: - v0.3 Traits models
+enum NudgeIntensity: String, Codable, CaseIterable {
+    case quiet
+    case normal
+    case active
+    
+    static var `default`: Self { .normal }
+}
+
+struct Big5Scores: Codable, Equatable {
+    var openness: Int
+    var conscientiousness: Int
+    var extraversion: Int
+    var agreeableness: Int
+    var neuroticism: Int
+    var summary: String?
+}
+
+struct UserProfile: Codable {
+    var displayName: String
+    var preferredLanguage: LanguagePreference
+    var sleepLocation: String
+    var trainingFocus: [String]
+    
+    // 追加フィールド（既存）
+    var wakeLocation: String
+    var wakeRoutines: [String]
+    var sleepRoutines: [String]
+    var trainingGoal: String
+    
+    // v0.3: traits / personalization
+    var ideals: [String]
+    var struggles: [String]
+    var big5: Big5Scores?
+    var keywords: [String]
+    var summary: String
+    var nudgeIntensity: NudgeIntensity
+    var stickyMode: Bool
+    
+    // AlarmKit設定（各習慣ごと）
+    var useAlarmKitForWake: Bool
+    var useAlarmKitForTraining: Bool
+    var useAlarmKitForBedtime: Bool
+    var useAlarmKitForCustom: Bool
+    
+    // Backward-compatible aliases（既存UI/ロジックを壊さない）
+    var idealTraits: [String] {
+        get { ideals }
+        set { ideals = newValue }
+    }
+    
+    var problems: [String] {
+        get { struggles }
+        set { struggles = newValue }
+    }
+    
+    var stickyModeEnabled: Bool {
+        get { stickyMode }
+        set { stickyMode = newValue }
+    }
+    
+    init(
+        displayName: String = "",
+        preferredLanguage: LanguagePreference = LanguagePreference.detectDefault(),
+        sleepLocation: String = "",
+        trainingFocus: [String] = [],
+        wakeLocation: String = "",
+        wakeRoutines: [String] = [],
+        sleepRoutines: [String] = [],
+        trainingGoal: String = "",
+        ideals: [String] = [],
+        struggles: [String] = [],
+        big5: Big5Scores? = nil,
+        keywords: [String] = [],
+        summary: String = "",
+        nudgeIntensity: NudgeIntensity = .default,
+        stickyMode: Bool = true,
+        useAlarmKitForWake: Bool = true,
+        useAlarmKitForTraining: Bool = false,
+        useAlarmKitForBedtime: Bool = false,
+        useAlarmKitForCustom: Bool = false
+    ) {
+        self.displayName = displayName
+        self.preferredLanguage = preferredLanguage
+        self.sleepLocation = sleepLocation
+        self.trainingFocus = trainingFocus
+        self.wakeLocation = wakeLocation
+        self.wakeRoutines = wakeRoutines
+        self.sleepRoutines = sleepRoutines
+        self.trainingGoal = trainingGoal
+        self.ideals = ideals
+        self.struggles = struggles
+        self.big5 = big5
+        self.keywords = keywords
+        self.summary = summary
+        self.nudgeIntensity = nudgeIntensity
+        self.stickyMode = stickyMode
+        self.useAlarmKitForWake = useAlarmKitForWake
+        self.useAlarmKitForTraining = useAlarmKitForTraining
+        self.useAlarmKitForBedtime = useAlarmKitForBedtime
+        self.useAlarmKitForCustom = useAlarmKitForCustom
+    }
+    
+    // 既存データとの互換性のためのカスタムデコーディング
+    enum CodingKeys: String, CodingKey {
+        case displayName, preferredLanguage, sleepLocation, trainingFocus
+        case wakeLocation, wakeRoutines, sleepRoutines, trainingGoal
+        
+        // v0.3
+        case ideals, struggles, big5, keywords, summary, nudgeIntensity, stickyMode
+        
+        // legacy (read-only)
+        case idealTraits
+        case problems
+        case stickyModeEnabled
+        case wakeStickyModeEnabled
+        
+        case useAlarmKitForWake, useAlarmKitForTraining, useAlarmKitForBedtime, useAlarmKitForCustom
+    }
+    
+    init(from decoder: Decoder) throws {
+        let container = try decoder.container(keyedBy: CodingKeys.self)
+        displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
+        preferredLanguage = try container.decodeIfPresent(LanguagePreference.self, forKey: .preferredLanguage) ?? LanguagePreference.detectDefault()
+        sleepLocation = try container.decodeIfPresent(String.self, forKey: .sleepLocation) ?? ""
+        trainingFocus = try container.decodeIfPresent([String].self, forKey: .trainingFocus) ?? []
+        wakeLocation = try container.decodeIfPresent(String.self, forKey: .wakeLocation) ?? ""
+        wakeRoutines = try container.decodeIfPresent([String].self, forKey: .wakeRoutines) ?? []
+        sleepRoutines = try container.decodeIfPresent([String].self, forKey: .sleepRoutines) ?? []
+        trainingGoal = try container.decodeIfPresent(String.self, forKey: .trainingGoal) ?? ""
+        
+        // v0.3 traits (fallback to legacy)
+        if let decodedIdeals = try container.decodeIfPresent([String].self, forKey: .ideals) {
+            ideals = decodedIdeals
+        } else {
+            ideals = try container.decodeIfPresent([String].self, forKey: .idealTraits) ?? []
+        }
+        if let decodedStruggles = try container.decodeIfPresent([String].self, forKey: .struggles) {
+            struggles = decodedStruggles
+        } else {
+            struggles = try container.decodeIfPresent([String].self, forKey: .problems) ?? []
+        }
+        big5 = try container.decodeIfPresent(Big5Scores.self, forKey: .big5)
+        keywords = try container.decodeIfPresent([String].self, forKey: .keywords) ?? []
+        summary = try container.decodeIfPresent(String.self, forKey: .summary) ?? ""
+        nudgeIntensity = try container.decodeIfPresent(NudgeIntensity.self, forKey: .nudgeIntensity) ?? .default
+        
+        // Sticky (fallback to legacy keys)
+        if let sticky = try container.decodeIfPresent(Bool.self, forKey: .stickyMode) {
+            stickyMode = sticky
+        } else if let sticky = try container.decodeIfPresent(Bool.self, forKey: .stickyModeEnabled) {
+            stickyMode = sticky
+        } else if let oldSticky = try container.decodeIfPresent(Bool.self, forKey: .wakeStickyModeEnabled) {
+            stickyMode = oldSticky
+        } else {
+            stickyMode = true
+        }
+        
+        // AlarmKit設定（各習慣ごと）
+        useAlarmKitForWake = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForWake) ?? true
+        useAlarmKitForTraining = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForTraining) ?? false
+        useAlarmKitForBedtime = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForBedtime) ?? false
+        useAlarmKitForCustom = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForCustom) ?? false
+        
+        // カスタム習慣のAlarmKitは常にOFFから始める（既存ユーザーも含めてリセット）
+        useAlarmKitForCustom = false
+    }
+    
+    func encode(to encoder: Encoder) throws {
+        var container = encoder.container(keyedBy: CodingKeys.self)
+        try container.encode(displayName, forKey: .displayName)
+        try container.encode(preferredLanguage, forKey: .preferredLanguage)
+        try container.encode(sleepLocation, forKey: .sleepLocation)
+        try container.encode(trainingFocus, forKey: .trainingFocus)
+        try container.encode(wakeLocation, forKey: .wakeLocation)
+        try container.encode(wakeRoutines, forKey: .wakeRoutines)
+        try container.encode(sleepRoutines, forKey: .sleepRoutines)
+        try container.encode(trainingGoal, forKey: .trainingGoal)
+        
+        // v0.3 keys only
+        try container.encode(ideals, forKey: .ideals)
+        try container.encode(struggles, forKey: .struggles)
+        try container.encodeIfPresent(big5, forKey: .big5)
+        try container.encode(keywords, forKey: .keywords)
+        try container.encode(summary, forKey: .summary)
+        try container.encode(nudgeIntensity, forKey: .nudgeIntensity)
+        try container.encode(stickyMode, forKey: .stickyMode)
+        
+        try container.encode(useAlarmKitForWake, forKey: .useAlarmKitForWake)
+        try container.encode(useAlarmKitForTraining, forKey: .useAlarmKitForTraining)
+        try container.encode(useAlarmKitForBedtime, forKey: .useAlarmKitForBedtime)
+        try container.encode(useAlarmKitForCustom, forKey: .useAlarmKitForCustom)
+        // legacy keysはデコード互換専用なのでエンコードしない
+    }
+}
@@
 struct UserCredentials: Codable {
     let userId: String
     let displayName: String
     let email: String?
@@
 }
 
 enum AuthStatus: Codable, Equatable {
@@
 }
 
 
*** Update File: aniccaios/aniccaios/AppState.swift
@@
     enum RootTab: Int, Hashable {
         case talk = 0
-        case habits = 1
+        case behavior = 1
+        case profile = 2
     }
     @Published var selectedRootTab: RootTab = .talk
@@
     private init() {
@@
         if defaults.bool(forKey: onboardingKey) {
             let rawValue = defaults.integer(forKey: onboardingStepKey)
-            // 後方互換性: rawValue = 4（旧.profile）を.habitSetupにマッピング
-            if rawValue == 4 {
-                self.onboardingStep = .habitSetup
-            } else {
-                self.onboardingStep = OnboardingStep(rawValue: rawValue) ?? .completion
-            }
+            self.onboardingStep = OnboardingStep.migratedFromLegacyRawValue(rawValue)
         } else {
@@
     func profileSyncPayload(for profile: UserProfile) -> [String: Any] {
         var payload: [String: Any] = [
             "displayName": profile.displayName,
             "preferredLanguage": profile.preferredLanguage.rawValue,
             "sleepLocation": profile.sleepLocation,
             "trainingFocus": profile.trainingFocus,
             "wakeLocation": profile.wakeLocation,
             "wakeRoutines": profile.wakeRoutines,
             "sleepRoutines": profile.sleepRoutines,
             "trainingGoal": profile.trainingGoal,
-            "idealTraits": profile.idealTraits,
-            "problems": profile.problems,
             "useAlarmKitForWake": profile.useAlarmKitForWake,
             "useAlarmKitForTraining": profile.useAlarmKitForTraining,
             "useAlarmKitForBedtime": profile.useAlarmKitForBedtime,
             "useAlarmKitForCustom": profile.useAlarmKitForCustom,
-            "stickyModeEnabled": profile.stickyModeEnabled
+            // v0.3 traits
+            "ideals": profile.ideals,
+            "struggles": profile.struggles,
+            "keywords": profile.keywords,
+            "summary": profile.summary,
+            "nudgeIntensity": profile.nudgeIntensity.rawValue,
+            "stickyMode": profile.stickyMode
         ]
+        
+        if let big5 = profile.big5 {
+            var obj: [String: Any] = [
+                "openness": big5.openness,
+                "conscientiousness": big5.conscientiousness,
+                "extraversion": big5.extraversion,
+                "agreeableness": big5.agreeableness,
+                "neuroticism": big5.neuroticism
+            ]
+            if let s = big5.summary { obj["summary"] = s }
+            payload["big5"] = obj
+        }
@@
     private func applyRemoteProfilePayload(_ payload: [String: Any]) {
         var profile = userProfile
@@
-        if let idealTraits = payload["idealTraits"] as? [String] {
-            profile.idealTraits = idealTraits
-        }
-        if let problems = payload["problems"] as? [String] {
-            profile.problems = problems
-        }
+        // v0.3 traits (prefer new keys, fallback to legacy)
+        if let ideals = payload["ideals"] as? [String] {
+            profile.ideals = ideals
+        } else if let idealTraits = payload["idealTraits"] as? [String] {
+            profile.ideals = idealTraits
+        }
+        if let struggles = payload["struggles"] as? [String] {
+            profile.struggles = struggles
+        } else if let problems = payload["problems"] as? [String] {
+            profile.struggles = problems
+        }
+        if let keywords = payload["keywords"] as? [String] {
+            profile.keywords = keywords
+        }
+        if let summary = payload["summary"] as? String {
+            profile.summary = summary
+        }
+        if let intensity = payload["nudgeIntensity"] as? String,
+           let v = NudgeIntensity(rawValue: intensity) {
+            profile.nudgeIntensity = v
+        }
+        if let big5 = payload["big5"] as? [String: Any] {
+            let scores = Big5Scores(
+                openness: big5["openness"] as? Int ?? 0,
+                conscientiousness: big5["conscientiousness"] as? Int ?? 0,
+                extraversion: big5["extraversion"] as? Int ?? 0,
+                agreeableness: big5["agreeableness"] as? Int ?? 0,
+                neuroticism: big5["neuroticism"] as? Int ?? 0,
+                summary: big5["summary"] as? String
+            )
+            profile.big5 = scores
+        }
@@
-        // Stickyモード（後方互換: wakeStickyModeEnabled も読み取る）
-        if let sticky = payload["stickyModeEnabled"] as? Bool {
-            profile.stickyModeEnabled = sticky
-        } else if let oldSticky = payload["wakeStickyModeEnabled"] as? Bool {
-            profile.stickyModeEnabled = oldSticky
-        }
+        // Stickyモード（後方互換: stickyModeEnabled / wakeStickyModeEnabled も読み取る）
+        if let sticky = payload["stickyMode"] as? Bool {
+            profile.stickyMode = sticky
+        } else if let sticky = payload["stickyModeEnabled"] as? Bool {
+            profile.stickyMode = sticky
+        } else if let oldSticky = payload["wakeStickyModeEnabled"] as? Bool {
+            profile.stickyMode = oldSticky
+        }
         updateUserProfile(profile, sync: false)
@@
     func updateIdealTraits(_ traits: [String]) {
         var profile = userProfile
         profile.idealTraits = traits
         updateUserProfile(profile, sync: true)
     }
+    
+    // MARK: - v0.3 Traits update helpers
+    
+    func updateTraits(ideals: [String], struggles: [String]) {
+        var profile = userProfile
+        profile.ideals = ideals
+        profile.struggles = struggles
+        updateUserProfile(profile, sync: true)
+    }
+    
+    func updateBig5(_ scores: Big5Scores?) {
+        var profile = userProfile
+        profile.big5 = scores
+        updateUserProfile(profile, sync: true)
+    }
+    
+    func updateNudgeIntensity(_ intensity: NudgeIntensity) {
+        var profile = userProfile
+        profile.nudgeIntensity = intensity
+        updateUserProfile(profile, sync: true)
+    }
+    
+    func setStickyMode(_ enabled: Bool) {
+        var profile = userProfile
+        profile.stickyMode = enabled
+        updateUserProfile(profile, sync: true)
+    }
+    
+    // MARK: - v0.3 Quote
+    
+    var todayQuote: String {
+        QuoteProvider.shared.todayQuote(
+            preferredLanguage: userProfile.preferredLanguage,
+            date: Date()
+        )
+    }
 }
@@
 enum PurchaseEnvironmentStatus: Codable, Equatable {
@@
 }

*** Update File: aniccaios/aniccaios/Onboarding/OnboardingStep.swift
@@
 import Foundation
 
 enum OnboardingStep: Int {
     case welcome
-    case microphone
-    case notifications
-    case account
-    case habitSetup
-    case habitWakeLocation
-    case habitSleepLocation
-    case habitTrainingFocus
-    case paywall
-    case completion
+    case ideals
+    case struggles
+    case value
+    case account
+    case microphone
+    case notifications
+    case habitSetup
+    case habitWakeLocation
+    case habitSleepLocation
+    case habitTrainingFocus
+    case paywall
+    case completion
 }

+extension OnboardingStep {
+    /// 旧RawValue（v0.2系など）から v0.3 の enum へマップする。
+    /// AppState はオンボーディング未完了時に `.welcome` から開始する仕様だが、
+    /// `onboardingComplete==true` で残っている値を安全に解釈するために残す。
+    static func migratedFromLegacyRawValue(_ rawValue: Int) -> OnboardingStep {
+        // 既に v0.3 の値が入っているケース（>=10など）はそのまま解釈する
+        if rawValue >= 10, let step = OnboardingStep(rawValue: rawValue) {
+            return step
+        }
+        
+        // v0.2系: 0..9 を明示的にマップ（rawValue=4 が過去に profile を指していた実装もあったため、habitSetupへ寄せる）
+        switch rawValue {
+        case 0: return .welcome
+        case 1: return .microphone
+        case 2: return .notifications
+        case 3: return .account
+        case 4: return .habitSetup
+        case 5: return .habitWakeLocation
+        case 6: return .habitSleepLocation
+        case 7: return .habitTrainingFocus
+        case 8: return .paywall
+        case 9: return .completion
+        default:
+            return .welcome
+        }
+    }
+}

*** Update File: aniccaios/aniccaios/Services/NetworkSessionManager.swift
@@
 import Foundation
@@
 final class NetworkSessionManager {
@@
 }
 
 // MARK: - Auth helpers
 extension NetworkSessionManager {
@@
 }

+// MARK: - v0.3 API Error normalization
+/// serverの共通エラーフォーマット（`{"error":{"code","message","details"}}`）に合わせた iOS 側の標準エラー。
+enum AniccaAPIError: Error, LocalizedError {
+    case invalidRequest(message: String)
+    case unauthorized
+    case quotaExceeded
+    case forbidden
+    case notFound
+    case validationError(message: String, details: [String: Any])
+    case rateLimited
+    case serviceUnavailable
+    case serverError(message: String)
+    
+    var errorDescription: String? {
+        switch self {
+        case .invalidRequest(let message): return message
+        case .unauthorized: return "UNAUTHORIZED"
+        case .quotaExceeded: return "QUOTA_EXCEEDED"
+        case .forbidden: return "FORBIDDEN"
+        case .notFound: return "NOT_FOUND"
+        case .validationError(let message, _): return message.isEmpty ? "VALIDATION_ERROR" : message
+        case .rateLimited: return "RATE_LIMITED"
+        case .serviceUnavailable: return "SERVICE_UNAVAILABLE"
+        case .serverError(let message): return message.isEmpty ? "INTERNAL_ERROR" : message
+        }
+    }
+    
+    /// `migration-patch-v3.md 7.3` のマッピングをベースに、statusCode と body から正規化する。
+    static func from(statusCode: Int, data: Data) -> AniccaAPIError {
+        let parsed = NetworkSessionManager.parseErrorPayload(data)
+        let message = parsed.message
+        let details = parsed.details
+        
+        switch statusCode {
+        case 400: return .invalidRequest(message: message)
+        case 401: return .unauthorized
+        case 402: return .quotaExceeded
+        case 403: return .forbidden
+        case 404: return .notFound
+        case 422: return .validationError(message: message, details: details)
+        case 429: return .rateLimited
+        case 503: return .serviceUnavailable
+        default: return .serverError(message: message)
+        }
+    }
+}
+
+extension NetworkSessionManager {
+    private struct ParsedError {
+        let code: String?
+        let message: String
+        let details: [String: Any]
+    }
+    
+    /// 後方互換を含むパース:
+    /// - 新: `{"error":{"code","message","details"}}`
+    /// - 旧: `{"error":"message"}`
+    fileprivate static func parseErrorPayload(_ data: Data) -> ParsedError {
+        guard
+            let obj = try? JSONSerialization.jsonObject(with: data),
+            let root = obj as? [String: Any]
+        else {
+            return ParsedError(code: nil, message: "", details: [:])
+        }
+        
+        if let err = root["error"] as? [String: Any] {
+            let code = err["code"] as? String
+            let message = err["message"] as? String ?? ""
+            let details = err["details"] as? [String: Any] ?? [:]
+            return ParsedError(code: code, message: message, details: details)
+        }
+        
+        if let legacy = root["error"] as? String {
+            return ParsedError(code: nil, message: legacy, details: [:])
+        }
+        
+        // さらに旧: `{"message": "...", "details": {...}}` のような形も受けておく
+        let message = root["message"] as? String ?? ""
+        let details = root["details"] as? [String: Any] ?? [:]
+        return ParsedError(code: root["code"] as? String, message: message, details: details)
+    }
+}

*** Add File: aniccaios/aniccaios/Services/QuoteProvider.swift
+import Foundation
+
+/// Talk画面の「今日の一言」用。固定30件から day-of-year で1件を返す（パーソナライズ無し）。
+final class QuoteProvider {
+    static let shared = QuoteProvider()
+    private init() {}
+    
+    func todayQuote(preferredLanguage: LanguagePreference, date: Date, calendar: Calendar = .current) -> String {
+        let dayOfYear = calendar.ordinality(of: .day, in: .year, for: date) ?? 1
+        let index = (dayOfYear - 1) % Self.quotesEnglish.count
+        switch preferredLanguage {
+        case .ja:
+            return Self.quotesJapanese[index]
+        case .en:
+            return Self.quotesEnglish[index]
+        }
+    }
+    
+    // 30 fixed quotes (quotes-v3.md)
+    private static let quotesEnglish: [String] = [
+        "Even when you hate yourself, you still deserve gentleness.",
+        "You don't have to fix your whole life tonight. One honest step is enough.",
+        "The part of you that's hurting is also the part that wants to heal.",
+        "You've criticized yourself for years. What if you tried kindness instead?",
+        "This is a moment of suffering. May you be kind to yourself.",
+        "There is no amount of self-improvement that can make up for a lack of self-acceptance.",
+        "Stop beating yourself up for beating yourself up. Just notice, and begin again.",
+        "You're not a broken person. You're a healing one.",
+        "This breath is the only one that matters right now.",
+        "You are not your thoughts. You are the one watching them.",
+        "Your senses are always in the present. Return to them when you feel lost.",
+        "Your mind is the sky. Thoughts and feelings are merely weather.",
+        "The past is gone. The future is not yet. Only this moment is real.",
+        "Everything changes. Even this feeling will pass.",
+        "Behind all your thoughts, there is a stillness that never leaves.",
+        "Today is enough. Tomorrow will take care of itself.",
+        "Small changes, repeated, become who you are.",
+        "The best time to start was yesterday. The second best time is now.",
+        "When you act on your values, happiness follows. Not the other way around.",
+        "Courage isn't having no fear. It's moving gently toward what matters.",
+        "A jug fills drop by drop. So does a life of meaning.",
+        "First, tend to yourself. Then you can tend to others.",
+        "You don't need to eliminate negative thoughts. Take them with you and do what matters.",
+        "Pain is part of life. Suffering alone is optional.",
+        "Your struggles don't define you. How you meet them does.",
+        "What you resist persists. What you accept transforms.",
+        "You don't have to fight your emotions. Try letting them be.",
+        "You only lose what you cling to.",
+        "Anger will only burn you. Let it go, not for them, but for yourself.",
+        "Like a broken bell that makes no sound, find peace in stillness."
+    ]
+    
+    private static let quotesJapanese: [String] = [
+        "自分を嫌いな時でも、あなたは優しくされる価値がある。",
+        "今夜、人生のすべてを直す必要はない。誠実な一歩で、十分。",
+        "傷ついている部分は、癒されたいと願っている部分でもある。",
+        "何年も自分を責めてきた。今度は、優しさを試してみない？",
+        "今、苦しいんだね。自分に優しくしていいんだよ。",
+        "どれだけ自分を改善しても、自己受容の代わりにはならない。",
+        "自分を責めすぎていることを、また責めないで。ただ気づいて、また始めよう。",
+        "壊れた人間じゃない。癒えていく途中の人間だ。",
+        "今、この呼吸だけが大切。",
+        "あなたは思考ではない。思考を見ている存在だ。",
+        "五感はいつも今この瞬間にある。迷ったら、感覚に戻ろう。",
+        "心は空。思考や感情は、ただ通り過ぎる雲。",
+        "過去はもう終わった。未来はまだ来ていない。今だけが、本当。",
+        "すべては変わる。この気持ちも、必ず過ぎていく。",
+        "どんな思考の奥にも、静けさがある。それは消えない。",
+        "今日一日で、十分。明日は明日が面倒を見てくれる。",
+        "小さな変化の積み重ねが、あなた自身になる。",
+        "始めるのに一番いいタイミングは昨日だった。二番目にいいのは、今。",
+        "自分の価値観に沿って動くと、幸せはあとからついてくる。",
+        "勇気とは、恐れがないことじゃない。大切なことに向かって、静かに進むこと。",
+        "水瓶は一滴ずつ満ちていく。意味のある人生も同じ。",
+        "まず自分を整えること。それから他の人に手を差し伸べられる。",
+        "ネガティブな思考を消す必要はない。連れていって、大切なことをしよう。",
+        "痛みは人生の一部。でも、一人で苦しむ必要はない。",
+        "苦しみがあなたを定義するのではない。苦しみとどう向き合うかが、あなたを定義する。",
+        "抵抗するものは続く。受け入れるものは変わっていく。",
+        "感情と戦わなくていい。ただ、そこにいることを許そう。",
+        "失うのは、しがみついているものだけ。",
+        "怒りは自分を焼くだけ。手放すのは、相手のためじゃなく、自分のため。",
+        "割れた鐘のように静かに。そこに、安らぎがある。"
+    ]
+}

*** Update File: aniccaios/aniccaios/MainTabView.swift
@@
 struct MainTabView: View {
     @EnvironmentObject private var appState: AppState
     
     var body: some View {
         TabView(selection: $appState.selectedRootTab) {
             TalkTabView()
                 .tabItem {
                     Label(String(localized: "tab_talk"), systemImage: "message")
                 }
                 .tag(AppState.RootTab.talk)
             
-            HabitsTabView()
+            BehaviorTabView()
                 .tabItem {
-                    Label(String(localized: "tab_habits"), systemImage: "list.bullet")
+                    Label(String(localized: "tab_behavior"), systemImage: "chart.bar")
                 }
-                .tag(AppState.RootTab.habits)
+                .tag(AppState.RootTab.behavior)
+            
+            ProfileTabView()
+                .tabItem {
+                    Label(String(localized: "tab_profile"), systemImage: "person")
+                }
+                .tag(AppState.RootTab.profile)
         }
         .background(AppBackground())
     }
 }
 
 // SessionViewをTalkTabViewにリネーム
 typealias TalkTabView = SessionView
+
+// Phase 3では既存のHabitsTabViewを暫定的にProfileに割り当てる（UI/UXは後続フェーズで差し替え）
+typealias ProfileTabView = HabitsTabView
+
+private struct BehaviorTabView: View {
+    var body: some View {
+        NavigationStack {
+            // フェーズ6で BehaviorView を実装して差し替える
+            VStack(spacing: 0) { }
+                .navigationTitle(String(localized: "tab_behavior"))
+        }
+        .background(AppBackground())
+    }
+}
*** Update File: aniccaios/aniccaios/Models/SubscriptionInfo.swift
@@
 struct SubscriptionInfo: Codable, Equatable {
@@
     var willRenew: Bool?
+    
+    // server(=snake_case) と 既存UserDefaults(=camelCase) の両方をデコードできるようにする
+    private enum SnakeCodingKeys: String, CodingKey {
+        case plan
+        case status
+        case currentPeriodEnd = "current_period_end"
+        case managementURL = "management_url"
+        case lastSyncedAt = "last_synced_at"
+        case productIdentifier = "product_identifier"
+        case planDisplayName = "plan_display_name"
+        case priceDescription = "price_description"
+        case monthlyUsageLimit = "monthly_usage_limit"
+        case monthlyUsageRemaining = "monthly_usage_remaining"
+        case monthlyUsageCount = "monthly_usage_count"
+        case willRenew = "will_renew"
+    }
+    
+    private enum LegacyCodingKeys: String, CodingKey {
+        case plan
+        case status
+        case currentPeriodEnd
+        case managementURL
+        case lastSyncedAt
+        case productIdentifier
+        case planDisplayName
+        case priceDescription
+        case monthlyUsageLimit
+        case monthlyUsageRemaining
+        case monthlyUsageCount
+        case willRenew
+    }
+    
+    init(from decoder: Decoder) throws {
+        let snake = try decoder.container(keyedBy: SnakeCodingKeys.self)
+        let legacy = try decoder.container(keyedBy: LegacyCodingKeys.self)
+        
+        plan = try snake.decodeIfPresent(Plan.self, forKey: .plan)
+            ?? legacy.decodeIfPresent(Plan.self, forKey: .plan)
+            ?? .free
+        status = try snake.decodeIfPresent(String.self, forKey: .status)
+            ?? legacy.decodeIfPresent(String.self, forKey: .status)
+            ?? "free"
+        
+        currentPeriodEnd = try snake.decodeIfPresent(Date.self, forKey: .currentPeriodEnd)
+            ?? legacy.decodeIfPresent(Date.self, forKey: .currentPeriodEnd)
+        managementURL = try snake.decodeIfPresent(URL.self, forKey: .managementURL)
+            ?? legacy.decodeIfPresent(URL.self, forKey: .managementURL)
+        lastSyncedAt = try snake.decodeIfPresent(Date.self, forKey: .lastSyncedAt)
+            ?? legacy.decodeIfPresent(Date.self, forKey: .lastSyncedAt)
+            ?? .now
+        
+        productIdentifier = try snake.decodeIfPresent(String.self, forKey: .productIdentifier)
+            ?? legacy.decodeIfPresent(String.self, forKey: .productIdentifier)
+        planDisplayName = try snake.decodeIfPresent(String.self, forKey: .planDisplayName)
+            ?? legacy.decodeIfPresent(String.self, forKey: .planDisplayName)
+        priceDescription = try snake.decodeIfPresent(String.self, forKey: .priceDescription)
+            ?? legacy.decodeIfPresent(String.self, forKey: .priceDescription)
+        
+        monthlyUsageLimit = try snake.decodeIfPresent(Int.self, forKey: .monthlyUsageLimit)
+            ?? legacy.decodeIfPresent(Int.self, forKey: .monthlyUsageLimit)
+        monthlyUsageRemaining = try snake.decodeIfPresent(Int.self, forKey: .monthlyUsageRemaining)
+            ?? legacy.decodeIfPresent(Int.self, forKey: .monthlyUsageRemaining)
+        monthlyUsageCount = try snake.decodeIfPresent(Int.self, forKey: .monthlyUsageCount)
+            ?? legacy.decodeIfPresent(Int.self, forKey: .monthlyUsageCount)
+        willRenew = try snake.decodeIfPresent(Bool.self, forKey: .willRenew)
+            ?? legacy.decodeIfPresent(Bool.self, forKey: .willRenew)
+    }
+    
+    func encode(to encoder: Encoder) throws {
+        var container = encoder.container(keyedBy: SnakeCodingKeys.self)
+        try container.encode(plan, forKey: .plan)
+        try container.encode(status, forKey: .status)
+        try container.encodeIfPresent(currentPeriodEnd, forKey: .currentPeriodEnd)
+        try container.encodeIfPresent(managementURL, forKey: .managementURL)
+        try container.encode(lastSyncedAt, forKey: .lastSyncedAt)
+        try container.encodeIfPresent(productIdentifier, forKey: .productIdentifier)
+        try container.encodeIfPresent(planDisplayName, forKey: .planDisplayName)
+        try container.encodeIfPresent(priceDescription, forKey: .priceDescription)
+        try container.encodeIfPresent(monthlyUsageLimit, forKey: .monthlyUsageLimit)
+        try container.encodeIfPresent(monthlyUsageRemaining, forKey: .monthlyUsageRemaining)
+        try container.encodeIfPresent(monthlyUsageCount, forKey: .monthlyUsageCount)
+        try container.encodeIfPresent(willRenew, forKey: .willRenew)
+    }
@@
 }

*** Update File: aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
@@
 "tab_talk" = "Talk";
 "tab_habits" = "Habits";
+"tab_behavior" = "Behavior";
+"tab_profile" = "Profile";
@@

*** Update File: aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
@@
 "tab_talk" = "会話";
 "tab_habits" = "習慣";
+"tab_behavior" = "行動";
+"tab_profile" = "プロフィール";
@@

*** End Patch
```


