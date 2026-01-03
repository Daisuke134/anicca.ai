承知しました。審査提出前の修正パッチをチャットで示しますね。まず、関連するコードとドキュメントを確認させてください。

[3 tools called]

追加で関連ファイルを確認します。

[4 tools called]

追加でファイルを確認します。

[4 tools called]

十分な情報が集まりました。それでは、各課題について疑似パッチをチャットで示します。

| # | 課題 | 対応箇所 | 難易度 |
|---|------|----------|--------|
| 1 | 習慣名インライン編集 | `CustomHabitEditSheet`, `AppState` | 中 |
| 2 | RC通貨表示の誤解 | 仕様説明（変更不要） | - |
| 3 | 使用量表示 (250/300) | `ProfileView.swift` | 低 |
| 4 | ハイライトローカライズ | `HighlightsCard.swift` | 中 |
| 5 | クレジット切れシート毎回表示 | `TalkView`, `HabitSessionView` | 低 |
| 6 | ダイアログ文言 | `Localizable.strings` (日英) | 低 |
| 7 | RC Customer Center | RevenueCatダッシュボード設定確認 | 設定のみ |

---

# 修正パッチ一覧

## 1. 習慣名のインライン編集機能

**場所**: `aniccaios/aniccaios/Habits/HabitsSectionView.swift`

**問題**: `CustomHabitEditSheet` の `navigationTitle` は習慣名を表示するだけで、タップして編集できない

**疑似パッチ**:

```swift
// CustomHabitEditSheet に習慣名編集機能を追加
struct CustomHabitEditSheet: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    let customId: UUID
    let onSave: () -> Void
    @State private var time = Date()
    @State private var followups: Int = 2
    @State private var showAlarmKitDeniedAlert = false
+   @State private var habitName: String = ""
+   @State private var isEditingName = false
    
    var body: some View {
        NavigationView {
            Form {
+               // 習慣名編集セクション
+               Section {
+                   if isEditingName {
+                       TextField(String(localized: "habit_custom_name_placeholder"), text: $habitName)
+                           .onSubmit { isEditingName = false }
+                   } else {
+                       Button {
+                           isEditingName = true
+                       } label: {
+                           HStack {
+                               Text(habitName.isEmpty ? String(localized: "habit_title_custom_fallback") : habitName)
+                                   .foregroundStyle(AppTheme.Colors.label)
+                               Spacer()
+                               Image(systemName: "pencil")
+                                   .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                           }
+                       }
+                   }
+               } header: {
+                   Text(String(localized: "habit_custom_name_section"))
+               }
                
                Section {
                    DatePicker(String(localized: "common_time"), selection: $time, displayedComponents: [.hourAndMinute])
                }
                // ... 既存のコード
            }
            .scrollContentBackground(.hidden)
            .background(AppBackground())
            .tint(AppTheme.Colors.accent)
-           .navigationTitle(appState.customHabits.first(where: { $0.id == customId })?.name ?? String(localized: "habit_title_custom_fallback"))
+           .navigationTitle(String(localized: "habit_edit_title"))
            // ... 既存のコード
        }
        .onAppear {
+           habitName = appState.customHabits.first(where: { $0.id == customId })?.name ?? ""
            if let comps = appState.customHabitSchedules[customId],
               let d = Calendar.current.date(from: comps) {
                time = d
            }
            followups = appState.customFollowupCount(for: customId)
        }
    }
    
    private func save() {
        appState.updateCustomHabitSchedule(id: customId, time: Calendar.current.dateComponents([.hour, .minute], from: time))
        appState.updateCustomFollowupCount(id: customId, count: followups)
+       // 習慣名が変更されていれば更新
+       if !habitName.isEmpty {
+           appState.updateCustomHabitName(id: customId, name: habitName)
+       }
        Task {
            await MainActor.run {
                onSave()
                dismiss()
            }
        }
    }
}
```

**AppStateへの追加** (`AppState.swift`):

```swift
// MARK: - Custom Habit Management に追加
+ func updateCustomHabitName(id: UUID, name: String) {
+     guard let index = customHabits.firstIndex(where: { $0.id == id }) else { return }
+     let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
+     guard !trimmed.isEmpty else { return }
+     
+     var updated = customHabits[index]
+     updated.name = trimmed
+     updated.updatedAt = Date()
+     customHabits[index] = updated
+     
+     CustomHabitStore.shared.saveAll(customHabits)
+     
+     // サーバー同期
+     Task {
+         await ProfileSyncService.shared.enqueue(profile: userProfile)
+     }
+ }
```

**Localizable.strings に追加**:
```
// en.lproj/Localizable.strings
"habit_custom_name_section" = "Habit Name";
"habit_edit_title" = "Edit Habit";

// ja.lproj/Localizable.strings
"habit_custom_name_section" = "習慣名";
"habit_edit_title" = "習慣を編集";
```

---

## 2. RevenueCatのアプリ内通貨（クレジット残高）について

**現状の仕組みの説明**:

Railwayのログを見ると:
```
remaining: 0
plan: 'free'
```

これはサーバー側で計算された**残り利用可能分数**です。つまり、無料プランの30分を使い切った状態です。

**RevenueCat Paywall上の「300」表示について**:
- RevenueCat PaywallはRevenueCatダッシュボードで設定した「Virtual Currency」を表示しています
- これはRevenueCatダッシュボード側で設定された「購入時に付与されるクレジット量」であり、**残高ではありません**
- アプリ側の `SubscriptionInfo.monthlyUsageRemaining` がサーバーから取得した本当の残高です

**結論**: RevenueCat Paywallの「300」表示は「購入すると300分もらえる」という意味であり、残高ではありません。これは正しい動作です。

---

## 3. プロファイル画面での使用量表示 (250/300 形式)

**場所**: `aniccaios/aniccaios/Views/Profile/ProfileView.swift`

**疑似パッチ**:

```swift
// accountCard の planRow を修正
private var accountCard: some View {
    CardView(cornerRadius: 32) {
        VStack(spacing: 0) {
            nameRow
            divider
            Button {
                showingManageSubscription = true
            } label: {
-               row(label: String(localized: "profile_row_plan"), value: appState.subscriptionInfo.displayPlanName, showsChevron: true)
+               row(label: String(localized: "profile_row_plan"), value: planDisplayWithUsage, showsChevron: true)
            }
            .buttonStyle(.plain)
        }
    }
}

+ private var planDisplayWithUsage: String {
+     let basePlanName = appState.subscriptionInfo.displayPlanName
+     
+     // 利用量情報がある場合は (used/limit) 形式で表示
+     if let used = appState.subscriptionInfo.monthlyUsageCount,
+        let limit = appState.subscriptionInfo.monthlyUsageLimit {
+         return "\(basePlanName) (\(used)/\(limit))"
+     }
+     
+     return basePlanName
+ }
```

---

## 4. ハイライトカードのローカライズ

**場所**: `aniccaios/aniccaios/Views/Behavior/HighlightsCard.swift`

**問題**: `localizedValueLabel` がサーバーから返された日本語を英語に変換する方向のみ実装されている

**疑似パッチ**:

```swift
// localizedValueLabel を修正して双方向ローカライズ対応
private func localizedValueLabel(_ raw: String) -> String {
-   guard appState.effectiveLanguage == .en else { return raw.isEmpty ? "-" : raw }
-   let replacements: [(ja: String, en: String)] = [
-       ("起床", "Wake"),
-       ("スクリーン", "Screen"),
-       ("歩数", "Steps"),
-       ("反芻", "Rumination"),
-       ("分", "min")
-   ]
-   var result = raw.isEmpty ? "-" : raw
-   for pair in replacements {
-       result = result.replacingOccurrences(of: pair.ja, with: pair.en)
-   }
-   return result
+   guard !raw.isEmpty else { return "-" }
+   
+   // サーバーから返された値をパースして、言語に応じてフォーマット
+   let isJapanese = appState.effectiveLanguage == .ja
+   var result = raw
+   
+   // 数値部分を抽出してローカライズ
+   if raw.contains("Steps") || raw.contains("歩") {
+       // 例: "4,212 Steps" -> "4,212 歩" (日本語) / "4,212 Steps" (英語)
+       let numericPart = raw.replacingOccurrences(of: "[^0-9,]", with: "", options: .regularExpression)
+       result = isJapanese ? "\(numericPart) 歩" : "\(numericPart) Steps"
+   } else if raw.contains("Wake") || raw.contains("起床") || raw.contains(":") && (raw.count <= 6) {
+       // 例: "8:47" 形式の時刻
+       let timePart = raw.replacingOccurrences(of: "[^0-9:]", with: "", options: .regularExpression)
+       if !timePart.isEmpty {
+           result = isJapanese ? "\(timePart) 起床" : "Wake \(timePart)"
+       }
+   } else if raw.contains("Screen") || raw.contains("スクリーン") || raw.contains("min") || raw.contains("分") {
+       // 例: "Screen 30min" -> "スクリーン 30分"
+       let numericPart = raw.replacingOccurrences(of: "[^0-9]", with: "", options: .regularExpression)
+       if !numericPart.isEmpty {
+           result = isJapanese ? "スクリーン \(numericPart)分" : "Screen \(numericPart)min"
+       } else {
+           result = isJapanese ? "スクリーン" : "Screen"
+       }
+   } else if raw.contains("Rumination") || raw.contains("反芻") || raw.contains("%") {
+       // 例: "Rumination 0%" -> "反芻 0%"
+       let numericPart = raw.replacingOccurrences(of: "[^0-9%]", with: "", options: .regularExpression)
+       result = isJapanese ? "反芻 \(numericPart)" : "Rumination \(numericPart)"
+   } else {
+       // フォールバック: そのまま返す
+       result = raw
+   }
+   
+   return result
}
```

**より根本的な解決策**: サーバー側（API）でユーザーの言語に応じたレスポンスを返すように修正するのがベスト。


## 7. RevenueCat Customer Centerでキャンセルオプションが表示されない問題

**現状のコード**は正しく実装されています:

```swift
RevenueCatUI.CustomerCenterView()
    .onCustomerCenterRestoreCompleted { customerInfo in
        // ...
    }
```

**原因と解決策**:

この問題は**RevenueCatダッシュボード側の設定**の問題です。以下を確認してください:

1. **RevenueCatダッシュボード** → **Customer Center** → **Configuration**
2. 以下の設定を確認:
   - **Manage Subscription** が有効になっているか
   - **Cancel Subscription** オプションが有効になっているか
   - **Refund Request** オプションの設定

3. **Appearance** タブで使用しているテンプレートを確認

4. もし設定済みなのに表示されない場合:
   - RevenueCat SDKのバージョンを確認（最新版に更新推奨）
   - Sandbox環境では一部機能が制限される場合あり
   - プロダクション環境でテスト

**iOSアプリ側で追加対応が必要な場合のパッチ**:

```swift
// ManageSubscriptionSheet または subscriptionSheetContent を修正
@ViewBuilder
private var subscriptionSheetContent: some View {
    if appState.subscriptionInfo.plan == .free {
        PaywallContainerView(
            forcePresent: true,
            onDismissRequested: { showingManageSubscription = false }
        )
        .task { await SubscriptionManager.shared.refreshOfferings() }
    } else {
        // Customer Center設定をより明示的に
        RevenueCatUI.CustomerCenterView()
+           .customerCenterPurchasesIsCompleted({ customerInfo in
+               // 購入完了時の処理
+           })
            .onCustomerCenterRestoreCompleted { customerInfo in
                Task {
                    let subscription = SubscriptionInfo(info: customerInfo)
                    await MainActor.run { appState.updateSubscriptionInfo(subscription) }
                    await SubscriptionManager.shared.syncNow()
                }
            }
    }
}
```

---

# まとめ

| # | 課題 | 対応箇所 | 難易度 |
|---|------|----------|--------|
| 1 | 習慣名インライン編集 | `CustomHabitEditSheet`, `AppState` | 中 |
| 2 | RC通貨表示の誤解 | 仕様説明（変更不要） | - |
| 3 | 使用量表示 (250/300) | `ProfileView.swift` | 低 |
| 4 | ハイライトローカライズ | `HighlightsCard.swift` | 中 |
| 5 | クレジット切れシート毎回表示 | `TalkView`, `HabitSessionView` | 低 |
| 6 | ダイアログ文言 | `Localizable.strings` (日英) | 低 |
| 7 | RC Customer Center | RevenueCatダッシュボード設定確認 | 設定のみ |

審査提出前に必ず対応すべきは **#3, #4, #5, #6** です。**#7** はダッシュボード側の設定確認が必要です。

何か質問や追加の詳細が必要でしたらお知らせください！

わかりました。統合を含めた完全なパッチを示します。

---

# 5. クレジット切れ時に毎回シートを表示 & 6. ダイアログ文言（統合版）

## 修正方針

- `SessionView`と`HabitSessionView`を1つの`UnifiedSessionView`に統合
- `SessionContext` enumで入力を抽象化
- `UsageLimitModal`は両方で共通
- `EMAModal`はFeelingセッション（Talk）の時だけ表示
- ローカライズ完備（日英）

---

## パッチ1: 新規ファイル `UnifiedSessionView.swift`

```swift
// aniccaios/aniccaios/Views/Session/UnifiedSessionView.swift

import SwiftUI
import AVFoundation
import RevenueCatUI

/// セッションの種類を抽象化
enum SessionContext: Identifiable {
    case feeling(FeelingTopic)
    case habit(HabitType)
    
    var id: String {
        switch self {
        case .feeling(let topic): return "feeling_\(topic.rawValue)"
        case .habit(let habit): return "habit_\(habit.rawValue)"
        }
    }
}

struct UnifiedSessionView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var controller = VoiceSessionController.shared
    
    let context: SessionContext
    
    // 共通State
    @State private var showMicAlert = false
    @State private var showUsageLimitModal = false
    @State private var showPaywall = false
    @State private var showManageSubscription = false
    @State private var hasCheckedQuota = false
    
    // EMA用State（Feelingセッションのみ使用）
    @State private var isShowingEMA = false
    
    var body: some View {
        VStack(spacing: 0) {
            // ナビゲーションバー（高さ69px、下部ボーダー）
            HStack {
                Button {
                    endSession()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.label)
                }
                .frame(width: 44, height: 44)
                
                Spacer()
            }
            .padding(.horizontal, 16)
            .frame(height: 69)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(Color(red: 200/255, green: 198/255, blue: 191/255, opacity: 0.2))
                    .frame(height: 1)
            }
            
            // メインコンテンツ
            VStack(spacing: 0) {
                contextPill
                    .padding(.top, 30.5)
                    .padding(.bottom, 48)
                
                OrbView()
                    .padding(.bottom, 48)
                
                Text(statusText)
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(Color(red: 57/255, green: 54/255, blue: 52/255, opacity: 0.7))
                    .padding(.bottom, 64)
                
                Spacer()
                
                controlsRow
                    .padding(.bottom, 48)
            }
            .padding(.horizontal, 24)
        }
        .background(Color(hex: "#F8F5ED"))
        .onAppear {
            checkQuotaAndStartSession()
        }
        .onDisappear {
            if controller.connectionStatus != .disconnected {
                controller.stop()
            }
        }
        // マイク権限アラート
        .alert(String(localized: "session_mic_permission_title"), isPresented: $showMicAlert) {
            Button(String(localized: "common_open_settings")) {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            Button(String(localized: "common_cancel"), role: .cancel) {
                dismiss()
            }
        } message: {
            Text(String(localized: "session_mic_permission_message"))
        }
        // Usage Limit Modal（共通）
        .sheet(isPresented: $showUsageLimitModal) {
            UsageLimitModalView(
                plan: appState.subscriptionHoldPlan ?? appState.subscriptionInfo.plan,
                reason: appState.quotaHoldReason ?? .quotaExceeded,
                onClose: {
                    showUsageLimitModal = false
                    dismiss()
                },
                onUpgrade: {
                    showUsageLimitModal = false
                    showPaywall = true
                },
                onManage: {
                    showUsageLimitModal = false
                    showManageSubscription = true
                }
            )
            .interactiveDismissDisabled()
        }
        // Paywall
        .sheet(isPresented: $showPaywall) {
            PaywallContainerView(
                forcePresent: true,
                onPurchaseCompleted: { showPaywall = false },
                onDismissRequested: { showPaywall = false }
            )
            .environmentObject(appState)
        }
        // Customer Center
        .sheet(isPresented: $showManageSubscription) {
            RevenueCatUI.CustomerCenterView()
                .onCustomerCenterRestoreCompleted { info in
                    Task {
                        let subscription = SubscriptionInfo(info: info)
                        await MainActor.run { appState.updateSubscriptionInfo(subscription) }
                        await SubscriptionManager.shared.syncNow()
                    }
                }
        }
        // EMA Modal（Feelingセッションのみ）
        .sheet(isPresented: $isShowingEMA) {
            EMAModal { answer in
                Task { @MainActor in
                    await controller.submitFeelingEMA(emaBetter: answer)
                    isShowingEMA = false
                    dismiss()
                }
            }
        }
    }
    
    // MARK: - UI Components
    
    private var contextPill: some View {
        Text(pillTitle)
            .font(.system(size: 20, weight: .medium))
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
            .padding(.horizontal, 31)
            .padding(.vertical, 17)
            .background(
                Capsule()
                    .fill(Color(hex: "#F2F0ED"))
            )
    }
    
    private var pillTitle: String {
        switch context {
        case .feeling(let topic):
            switch topic {
            case .selfLoathing: return String(localized: "session_topic_self_loathing")
            case .anxiety: return String(localized: "session_topic_anxiety")
            case .irritation: return String(localized: "session_topic_irritation")
            case .freeConversation: return String(localized: "session_topic_free_conversation")
            }
        case .habit(let habit):
            return habit.title
        }
    }
    
    private var statusText: String {
        if controller.connectionStatus == .connecting { return String(localized: "session_status_connecting") }
        if controller.isModelSpeaking { return String(localized: "session_status_speaking") }
        if controller.connectionStatus == .connected { return String(localized: "session_status_listening") }
        return String(localized: "session_status_disconnected")
    }
    
    private var controlsRow: some View {
        HStack {
            Button {
                controller.toggleMicMuted()
            } label: {
                Image(systemName: controller.isMicMuted ? "mic.slash.fill" : "mic.fill")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .frame(width: 80, height: 80)
                    .background(Circle().fill(AppTheme.Colors.cardBackground))
                    .overlay(Circle().stroke(AppTheme.Colors.border.opacity(0.2), lineWidth: 1))
                    .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 6)
            }
            
            Spacer()
            
            Button {
                endSession()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 80, height: 80)
                    .background(Circle().fill(Color.red))
                    .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 6)
            }
        }
        .padding(.horizontal, 24)
    }
    
    // MARK: - Session Logic
    
    private func checkQuotaAndStartSession() {
        guard !hasCheckedQuota else { return }
        hasCheckedQuota = true
        
        let remaining = appState.subscriptionInfo.monthlyUsageRemaining ?? 1
        if remaining <= 0 {
            // クオータ切れ: セッションを開始せずにシートを表示
            appState.markQuotaHold(plan: appState.subscriptionInfo.plan, reason: .quotaExceeded)
            showUsageLimitModal = true
            return
        }
        
        // クオータあり: マイク権限チェック後にセッション開始
        ensureMicrophonePermissionAndStart()
    }
    
    private func ensureMicrophonePermissionAndStart() {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted:
                startSession()
            case .undetermined:
                AVAudioApplication.requestRecordPermission { granted in
                    DispatchQueue.main.async {
                        if granted {
                            startSession()
                        } else {
                            showMicAlert = true
                        }
                    }
                }
            default:
                showMicAlert = true
            }
        } else {
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted:
                startSession()
            case .undetermined:
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    DispatchQueue.main.async {
                        if granted {
                            startSession()
                        } else {
                            showMicAlert = true
                        }
                    }
                }
            default:
                showMicAlert = true
            }
        }
    }
    
    private func startSession() {
        switch context {
        case .feeling(let topic):
            controller.startFeeling(topic: topic)
        case .habit:
            controller.start(shouldResumeImmediately: true)
        }
    }
    
    private func endSession() {
        switch context {
        case .feeling:
            // Feelingセッション: EMAを聞くかどうか判定
            let shouldAsk = controller.shouldAskFeelingEMA
            controller.stop()
            if shouldAsk {
                isShowingEMA = true
            } else {
                Task { @MainActor in
                    await controller.submitFeelingEMA(emaBetter: nil)
                    dismiss()
                }
            }
        case .habit:
            // 習慣セッション: EMAなしで終了
            controller.stop()
            dismiss()
        }
    }
}
```

---

## パッチ2: `TalkView.swift` の修正

```diff
 // aniccaios/aniccaios/Views/Talk/TalkView.swift

 import SwiftUI
 import UIKit

 struct TalkView: View {
     @EnvironmentObject private var appState: AppState
-    @State private var selectedTopic: FeelingTopic?
+    @State private var selectedContext: SessionContext?

     // ... topics computed property（変更なし） ...

     var body: some View {
         NavigationStack {
             ScrollView {
                 VStack(spacing: AppTheme.Spacing.xl) {
                     // ... 既存のUI（変更なし） ...

                     VStack(spacing: AppTheme.Spacing.lg) {
                         ForEach(topics, id: \.self) { topic in
                             Button {
-                                selectedTopic = topic
+                                selectedContext = .feeling(topic)
                             } label: {
                                 feelingCard(for: topic)
                             }
                             .buttonStyle(.plain)
                         }
                     }
                 }
                 // ... padding（変更なし） ...
             }
             .background(AppBackground())
             .navigationBarTitleDisplayMode(.inline)
-            .fullScreenCover(item: $selectedTopic) { topic in
-                SessionView(topic: topic)
-                    .environmentObject(appState)
-            }
+            .fullScreenCover(item: $selectedContext) { context in
+                UnifiedSessionView(context: context)
+                    .environmentObject(appState)
+            }
         }
     }

     // ... feelingCard（変更なし） ...
 }
```

---

## パッチ3: `AppDelegate.swift` 等の呼び出し元修正

```diff
 // HabitSessionViewを呼び出している箇所をすべてUnifiedSessionViewに変更

 // 例: AppDelegate.swift または NotificationHandler
-HabitSessionView(habit: habit)
+UnifiedSessionView(context: .habit(habit))

 // 例: MainTabView や ContentView
-HabitSessionView(habit: habit)
+UnifiedSessionView(context: .habit(habit))
```

---

## パッチ4: `UsageLimitModalView.swift` の完全版

```swift
// aniccaios/aniccaios/Views/UsageLimitModalView.swift

import SwiftUI

enum QuotaHoldReason {
    case quotaExceeded      // 月間クオータを使い切った
    case sessionTimeCap     // 1セッション30分上限
}

struct UsageLimitModalView: View {
    let plan: SubscriptionInfo.Plan
    let reason: QuotaHoldReason
    let onClose: () -> Void
    let onUpgrade: () -> Void
    let onManage: () -> Void
    
    init(plan: SubscriptionInfo.Plan,
         reason: QuotaHoldReason = .quotaExceeded,
         onClose: @escaping () -> Void,
         onUpgrade: @escaping () -> Void,
         onManage: @escaping () -> Void) {
        self.plan = plan
        self.reason = reason
        self.onClose = onClose
        self.onUpgrade = onUpgrade
        self.onManage = onManage
    }
    
    var body: some View {
        VStack(spacing: 24) {
            // アイコン
            Image(systemName: "clock.badge.exclamationmark")
                .font(.system(size: 48))
                .foregroundStyle(AppTheme.Colors.accent)
                .padding(.top, 32)
            
            // タイトル
            Text(titleText)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .multilineTextAlignment(.center)
            
            // メッセージ
            Text(messageText)
                .font(.body)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            
            Spacer()
            
            // ボタン
            VStack(spacing: 12) {
                if plan == .free || plan == .grace {
                    // 無料/グレースユーザー: アップグレードボタン
                    Button(action: onUpgrade) {
                        Text(String(localized: "usage_limit_button_upgrade"))
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .background(AppTheme.Colors.accent)
                            .clipShape(Capsule())
                    }
                } else {
                    // 有料ユーザー: プラン管理ボタン
                    Button(action: onManage) {
                        Text(String(localized: "usage_limit_button_manage"))
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .background(AppTheme.Colors.accent)
                            .clipShape(Capsule())
                    }
                }
                
                Button(action: onClose) {
                    Text(String(localized: "usage_limit_button_close"))
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .background(AppTheme.Colors.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }
    
    private var titleText: String {
        switch reason {
        case .quotaExceeded:
            return String(localized: "usage_limit_title_quota")
        case .sessionTimeCap:
            return String(localized: "usage_limit_title_session_cap")
        }
    }
    
    private var messageText: String {
        switch reason {
        case .quotaExceeded:
            switch plan {
            case .free, .grace:
                return String(localized: "usage_limit_message_free")
            case .pro:
                return String(localized: "usage_limit_message_pro")
            }
        case .sessionTimeCap:
            return String(localized: "usage_limit_message_session_cap")
        }
    }
}
```

---

## パッチ5: `AppState.swift` の修正

```diff
 // aniccaios/aniccaios/AppState.swift

 // MARK: - Subscription Hold
 @Published var subscriptionHold: Bool = false
 @Published var subscriptionHoldPlan: SubscriptionInfo.Plan?
+@Published var quotaHoldReason: QuotaHoldReason?

-func markQuotaHold(plan: SubscriptionInfo.Plan?) {
+func markQuotaHold(plan: SubscriptionInfo.Plan?, reason: QuotaHoldReason = .quotaExceeded) {
     if let plan = plan {
         subscriptionHold = true
         subscriptionHoldPlan = plan
+        quotaHoldReason = reason
     } else {
         subscriptionHold = false
         subscriptionHoldPlan = nil
+        quotaHoldReason = nil
     }
 }
```

---

## パッチ6: `en.lproj/Localizable.strings`（英語）

```
// MARK: - Usage Limit Modal
"usage_limit_title_quota" = "Monthly Limit Reached";
"usage_limit_title_session_cap" = "Session Time Limit";

"usage_limit_message_free" = "You've used all 30 minutes this month.\nUpgrade to Pro for 300 minutes.";
"usage_limit_message_pro" = "You've used all 300 minutes this month.\nYour limit will reset next month.";
"usage_limit_message_session_cap" = "This session has reached the 30-minute limit.\nPlease start a new session to continue.";

"usage_limit_button_upgrade" = "Upgrade to Pro";
"usage_limit_button_manage" = "Manage Plan";
"usage_limit_button_close" = "Close";
```

---

## パッチ7: `ja.lproj/Localizable.strings`（日本語）

```
// MARK: - Usage Limit Modal
"usage_limit_title_quota" = "月間利用上限に達しました";
"usage_limit_title_session_cap" = "セッション時間の上限";

"usage_limit_message_free" = "今月の30分を使い切りました。\nProプランで300分に増やしましょう。";
"usage_limit_message_pro" = "今月の300分を使い切りました。\n来月にリセットされますのでお待ちください。";
"usage_limit_message_session_cap" = "このセッションが30分に達しました。\n続けるには新しいセッションを開始してください。";

"usage_limit_button_upgrade" = "Proにアップグレード";
"usage_limit_button_manage" = "プランを管理";
"usage_limit_button_close" = "閉じる";
```

---

## パッチ8: 旧ファイル削除

```diff
- aniccaios/aniccaios/Views/Session/SessionView.swift （削除）
- aniccaios/aniccaios/Views/Session/HabitSessionView.swift （削除）
```

---

# TO-BE（修正後のユーザー体験）

## シナリオ1: 無料ユーザー（30分使い切り）→ 通知から習慣セッションに遷移

| ステップ | 動作 |
|----------|------|
| 1 | 通知をタップ |
| 2 | `UnifiedSessionView(context: .habit(habit))`が開く |
| 3 | `checkQuotaAndStartSession()`で`remaining <= 0`を検出 |
| 4 | **セッションを開始せずに**`UsageLimitModalView`が表示される |
| 5 | シートはスワイプで閉じられない（`.interactiveDismissDisabled()`） |
| 6 | **表示内容**:<br>タイトル:「月間利用上限に達しました」<br>メッセージ:「今月の30分を使い切りました。Proプランで300分に増やしましょう。」<br>ボタン: [Proにアップグレード] [閉じる] |
| 7a | **[Proにアップグレード]をタップ** → Paywallが表示 |
| 7b | **[閉じる]をタップ** → 元の画面（Habitsタブ）に戻る |

## シナリオ2: 有料ユーザー（Pro 300分使い切り）→ Talk画面からFeelingセッション

| ステップ | 動作 |
|----------|------|
| 1 | Talk画面で「Self-Loathing」カードをタップ |
| 2 | `UnifiedSessionView(context: .feeling(.selfLoathing))`が開く |
| 3 | `checkQuotaAndStartSession()`で`remaining <= 0`を検出 |
| 4 | **セッションを開始せずに**`UsageLimitModalView`が表示される |
| 5 | **表示内容**:<br>タイトル:「月間利用上限に達しました」<br>メッセージ:「今月の300分を使い切りました。来月にリセットされますのでお待ちください。」<br>ボタン: [プランを管理] [閉じる] |
| 6a | **[プランを管理]をタップ** → RevenueCat Customer Centerが表示 |
| 6b | **[閉じる]をタップ** → Talk画面に戻る |

## シナリオ3: クレジットが残っている状態 → Feelingセッション

| ステップ | 動作 |
|----------|------|
| 1 | Talk画面でカードをタップ |
| 2 | `UnifiedSessionView(context: .feeling(topic))`が開く |
| 3 | `checkQuotaAndStartSession()`でクオータOK |
| 4 | `controller.startFeeling(topic:)`が実行され、セッション開始 |
| 5 | ユーザーが会話する |
| 6 | 終了ボタンをタップ → `endSession()`が呼ばれる |
| 7 | Feelingセッションなので`shouldAskFeelingEMA`をチェック |
| 8 | 3秒以上なら`EMAModal`が表示される（「気分は良くなりましたか？」） |
| 9 | EMA回答後、画面が閉じる |

## シナリオ4: クレジットが残っている状態 → 習慣セッション

| ステップ | 動作 |
|----------|------|
| 1 | 通知をタップ、または習慣カードをタップ |
| 2 | `UnifiedSessionView(context: .habit(habit))`が開く |
| 3 | `checkQuotaAndStartSession()`でクオータOK |
| 4 | `controller.start(shouldResumeImmediately:)`が実行され、セッション開始 |
| 5 | ユーザーが会話する |
| 6 | 終了ボタンをタップ → `endSession()`が呼ばれる |
| 7 | 習慣セッションなので**EMAは表示されず**、直接画面が閉じる |

---

## 修正効果まとめ

| 問題 | 修正前 | 修正後 |
|------|--------|--------|
| シートが一瞬で消える | `onChange`の連続発火で競合 | `onAppear`で先にチェック、セッション開始を防ぐ |
| Talk→SessionViewでシートが出ない | SessionViewにUsageLimitModalがなかった | 統合によりどちらでも表示 |
| シートをスワイプで閉じられる | デフォルト挙動 | `.interactiveDismissDisabled()` |
| コード重複 | 2ファイルで95%同じコード | 1つの`UnifiedSessionView`に統合 |
| EMAの扱い | SessionViewのみ | Feelingセッションのみで表示（習慣は出さない） |
| 文言がハードコード | 英語のみ | `Localizable.strings`に日英両方 |