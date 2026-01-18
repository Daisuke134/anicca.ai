# Anicca v0.3 フェーズ5 擬似パッチ

## 概要
- 対象フェーズ: 5（iOS UI: Talk / Session）
- 対象タスク: `5.1`〜`5.5`
- 出力物: **この `patch.md` のみ**（コードはまだ触らない前提）

## 対象タスク（todolist.md から）
- `5.1 TalkView/FeelingCard構築`
- `5.2 QuoteCard連携`
- `5.3 SessionView/Orb/EMA UI`
- `5.4 VoiceSessionController拡張`
- `5.5 Realtimeプロンプト/ツール定義更新`

## 参照仕様（v3）
- `.cursor/plans/v3/todolist.md`（フェーズ5）
- `.cursor/plans/v3/v3-ui.md`（Talk / Session / Orb / EMA）
- `.cursor/plans/v3/v3-ux.md`（トーン）
- `.cursor/plans/v3/prompts-v3.md`（Realtime tools schema / プロンプト方針）
- `.cursor/plans/v3/migration-patch-v3.md`（1.2: VoiceSessionController拡張の方針）
- `.cursor/plans/v3/tech-ema-v3.md`（EMA: UI/閾値/送信仕様）
- `.cursor/plans/v3/file-structure-v3.md`（Views/Talk, Views/Session の配置）
- 既存コード:
  - `aniccaios/aniccaios/VoiceSessionController.swift`
  - `aniccaios/aniccaios/SessionView.swift`（現状は Talk タブ相当として使われている）
  - `aniccaios/aniccaios/Services/NetworkSessionManager.swift`
  - `aniccaios/aniccaios/Resources/Prompts/*`

## 参照した公式URL一覧（妄想禁止のための一次情報）
> 本フェーズは Realtime のイベント名・payload 形が破綻すると成立しないため、**公式API Referenceを根拠として固定**する。

### OpenAI（Realtime / Events / Tools）
- `https://platform.openai.com/docs/guides/realtime-conversations`（Realtime conversations / フロー / function calling の Realtime 版）
- `https://platform.openai.com/docs/api-reference/realtime-client-events/session/update`（`session.update` の受理payload）
- `https://platform.openai.com/docs/api-reference/realtime-client-events/response/create`（`response.create`）
- `https://platform.openai.com/docs/api-reference/realtime-server-events`（`output_audio_buffer.started/stopped`・`input_audio_buffer.speech_started/stopped`・`response.done`・`response.function_call_arguments.*` 等）
- `https://platform.openai.com/docs/guides/function-calling`（Strict mode / JSON schema の要件）
- `https://platform.openai.com/docs/guides/tools`（tools 概観）

## 重要な仕様メモ（v3-ui / tech-ema から抜粋して固定）
- Talk タブ:
  - Quote カード + Feeling 4カード（3動的 + `Something else` 固定）
  - カードタップで `SessionView(topic: ...)` に push 遷移（`Talk to Anicca` ボタンは置かない）
- Session:
  - 上部pill: `Talking about <topic>`
  - 青オーブ: **breath（常時） + マイクRMS連動（必須、0.9–1.1、平滑化 0.7:0.3）**
  - 状態テキスト: `Anicca is listening… / speaking…`（Realtime 状態に合わせて更新）
  - 下部: mic トグル（左） + End（右、赤丸）
- EMA:
  - End/Back 時に表示
  - セッション継続 **5秒以上のみ**表示。未満は `emaBetter=null` 扱いで送信
  - 質問: `Did you feel a bit better?` / `さっきより楽になった？`
  - Yes/No/Skip（Skip/スワイプdismiss は `null`）

## ファイル別の変更概要（フェーズ5）

### 1) Talk UI を `Views/Talk/*` として新設（5.1, 5.2）
- `Views/Talk/TalkView.swift`: Quote + Feeling cards（push で Session）
- `Views/Talk/FeelingCard.swift`: v3-ui のカード構造を共通化
- `Views/Talk/QuoteCard.swift`: QuoteProvider から日替わり表示（依存: フェーズ3.5）
- `Views/Talk/FeelingTopic.swift`: Talk/Session 共通の topic 列挙

### 2) Session UI を v3-ui に合わせて刷新（5.3）
- `Views/Session/SessionView.swift`: pill / Orb / status / mic + end / EMA sheet
- `Views/Session/OrbView.swift`: AVAudioEngine の input tap で RMS→正規化→平滑化→scale
- `Views/Session/EMAModal.swift`: tech-ema-v3 の UI/閾値に準拠

### 3) Realtime payload/イベント/ツール呼び出しを公式仕様へ寄せる（5.4, 5.5）
- `VoiceSessionController.swift`:
  - `session.update` を **公式の `audio.{input,output}` / `output_modalities` 形式**へ移行
  - v3-ui の状態表示用に `isModelSpeaking/isUserSpeaking` を Publish
  - Realtime function calling を受けたら（`response.done` 内の `function_call` item）:
    - iOS→`POST /tools/<name>` へ転送
    - `conversation.item.create`（`function_call_output`）で Realtime に返す
    - `response.create` で会話を続行
- `Resources/Prompts/*`:
  - Talk セッションの system prompt（人格・短文テンポ・禁止事項）を追加
  - Realtime tools（`get_context_snapshot` 等）の schema を追加（**Realtime API 形式**で記述）

## 完全パッチ（apply_patch 互換）

### 5.1 TalkView / FeelingCard（新規）

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Talk/FeelingTopic.swift
+import Foundation
+
+/// Talk/Session 共通のトピックID（v3-ui の topic 名に合わせて固定）
+enum FeelingTopic: String, CaseIterable, Hashable, Identifiable {
+    case selfLoathing = "self_loathing"
+    case anxiety = "anxiety"
+    case irritation = "irritation"
+    case freeConversation = "free_conversation"
+
+    var id: String { rawValue }
+}
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Talk/FeelingCard.swift
+import SwiftUI
+
+struct FeelingCard: View {
+    let emoji: String
+    let title: LocalizedStringKey
+    let subtitle: LocalizedStringKey
+
+    var body: some View {
+        HStack(spacing: AppTheme.Spacing.lg) {
+            Text(emoji)
+                .font(.system(size: 28))
+                .frame(width: 36, height: 36, alignment: .center)
+
+            VStack(alignment: .leading, spacing: 6) {
+                Text(title)
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
+
+                Text(subtitle)
+                    .font(AppTheme.Typography.subheadlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                    .fixedSize(horizontal: false, vertical: true)
+            }
+
+            Spacer(minLength: 0)
+        }
+        .padding(AppTheme.Spacing.lg)
+        .frame(maxWidth: .infinity, alignment: .leading)
+        .background(
+            RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
+                .fill(AppTheme.Colors.cardBackground)
+                .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 2)
+        )
+        .overlay(
+            RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
+                .stroke(AppTheme.Colors.borderLight, lineWidth: 1)
+        )
+        .contentShape(RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous))
+    }
+}
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Talk/QuoteCard.swift
+import SwiftUI
+
+struct QuoteCard: View {
+    let quote: String
+
+    var body: some View {
+        Text(quote)
+            .font(AppTheme.Typography.bodyDynamic)
+            .foregroundStyle(AppTheme.Colors.label)
+            .multilineTextAlignment(.center)
+            .padding(AppTheme.Spacing.xl)
+            .frame(maxWidth: .infinity)
+            .background(
+                RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
+                    .fill(AppTheme.Colors.cardBackground)
+                    .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 2)
+            )
+            .overlay(
+                RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
+                    .stroke(AppTheme.Colors.borderLight, lineWidth: 1)
+            )
+    }
+}
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Talk/TalkView.swift
+import SwiftUI
+
+struct TalkView: View {
+    @EnvironmentObject private var appState: AppState
+
+    // v3-ux: 上3つは動的。v0.3 ではまず「固定 + 軽い並べ替え」→ tool/context 導入後に差し替え。
+    private var topics: [FeelingTopic] {
+        // 最低限: Something else は常に末尾固定
+        let base: [FeelingTopic] = [.selfLoathing, .anxiety, .irritation]
+
+        // 既存 UserProfile.problems（例: rumination/self_criticism/anxiety）を軽く反映し、上に寄せる
+        // ※厳密な選別は v3 の context_snapshot/mem0 連携後に置き換える（本フェーズではUI要件を満たすための最小実装）
+        let problems = Set(appState.userProfile.problems)
+        var prioritized: [FeelingTopic] = []
+        if problems.contains("self_criticism") || problems.contains("rumination") { prioritized.append(.selfLoathing) }
+        if problems.contains("anxiety") { prioritized.append(.anxiety) }
+        // irritation は現状 profile からの確定キーが無いので、残り枠で補完
+
+        let merged = (prioritized + base).removingDuplicates()
+        return Array(merged.prefix(3)) + [.freeConversation]
+    }
+
+    var body: some View {
+        NavigationStack {
+            ScrollView {
+                VStack(spacing: AppTheme.Spacing.xl) {
+                    QuoteCard(quote: QuoteProvider.shared.todayQuote())
+
+                    VStack(spacing: AppTheme.Spacing.lg) {
+                        ForEach(topics, id: \\.self) { topic in
+                            NavigationLink(value: topic) {
+                                feelingCard(for: topic)
+                            }
+                            .buttonStyle(.plain)
+                        }
+                    }
+                }
+                .padding(.horizontal, AppTheme.Spacing.lg)
+                .padding(.top, AppTheme.Spacing.lg)
+                .padding(.bottom, AppTheme.Spacing.xxl)
+            }
+            .background(AppBackground())
+            .navigationTitle(String(localized: "talk_nav_title"))
+            .navigationBarTitleDisplayMode(.large)
+            .navigationDestination(for: FeelingTopic.self) { topic in
+                SessionView(topic: topic)
+                    .environmentObject(appState)
+            }
+        }
+    }
+
+    @ViewBuilder
+    private func feelingCard(for topic: FeelingTopic) -> some View {
+        switch topic {
+        case .selfLoathing:
+            FeelingCard(
+                emoji: "😔",
+                title: "talk_feeling_self_loathing_title",
+                subtitle: "talk_feeling_self_loathing_subtitle"
+            )
+        case .anxiety:
+            FeelingCard(
+                emoji: "😨",
+                title: "talk_feeling_anxiety_title",
+                subtitle: "talk_feeling_anxiety_subtitle"
+            )
+        case .irritation:
+            FeelingCard(
+                emoji: "😡",
+                title: "talk_feeling_irritation_title",
+                subtitle: "talk_feeling_irritation_subtitle"
+            )
+        case .freeConversation:
+            FeelingCard(
+                emoji: "💬",
+                title: "talk_feeling_something_else_title",
+                subtitle: "talk_feeling_something_else_subtitle"
+            )
+        }
+    }
+}
+
+private extension Array where Element: Hashable {
+    func removingDuplicates() -> [Element] {
+        var seen = Set<Element>()
+        return self.filter { seen.insert($0).inserted }
+    }
+}
+
*** End Patch
```

### 5.1 既存 `SessionView.swift` は「旧Talk相当」なので退避（衝突回避）
> 現状 `MainTabView` が `typealias TalkTabView = SessionView` で `SessionView.swift` をTalkルートにしている。  
> v3 では Talk ルートは `TalkView`、Sessionは `Views/Session/SessionView` に分離するため、旧 `SessionView` は型名を変更して退避する。

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/SessionView.swift
@@
-struct SessionView: View {
+/// v0.2/現行の「Talkタブ相当」画面（フェーズ5以降は TalkView に置き換え）
+struct LegacyTalkRootView: View {
@@
     @ViewBuilder
     var body: some View {
@@
     }
@@
 }
*** End Patch
```

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/MainTabView.swift
@@
 struct MainTabView: View {
@@
     var body: some View {
         TabView(selection: $appState.selectedRootTab) {
-            TalkTabView()
+            TalkView()
                 .tabItem {
                     Label(String(localized: "tab_talk"), systemImage: "message")
                 }
                 .tag(AppState.RootTab.talk)
@@
         .background(AppBackground())
     }
 }
 
-// SessionViewをTalkTabViewにリネーム
-typealias TalkTabView = SessionView
+// v3: Talk のルートは TalkView（Sessionは push 遷移）
 
*** End Patch
```

### 5.2 QuoteCard 連携（依存: QuoteProvider）
> `QuoteProvider.shared.todayQuote()` はフェーズ3.5で追加済み前提（本フェーズでは UI 連携のみ）。

---

### 5.3 SessionView / Orb / EMA（新規）

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Session/OrbView.swift
+import SwiftUI
+import AVFoundation
+import Accelerate
+
+/// v3-ui 必須: 青いオーブ（breath + マイクRMS連動）
+struct OrbView: View {
+    @StateObject private var meter = MicLevelMeter()
+    @State private var breathe = false
+
+    var body: some View {
+        let base = breathe ? 1.05 : 0.95
+        let mic = 0.9 + 0.2 * meter.smoothedLevel // 0.9–1.1
+        let scale = base * mic
+
+        Circle()
+            .fill(
+                RadialGradient(
+                    colors: [
+                        Color(red: 0.22, green: 0.50, blue: 0.95).opacity(0.95),
+                        Color(red: 0.10, green: 0.32, blue: 0.85).opacity(0.95)
+                    ],
+                    center: .center,
+                    startRadius: 10,
+                    endRadius: 160
+                )
+            )
+            .frame(width: 190, height: 190)
+            .scaleEffect(scale)
+            .animation(.easeInOut(duration: 2.8), value: breathe)          // breath
+            .animation(.easeOut(duration: 0.08), value: meter.smoothedLevel) // mic follow
+            .onAppear {
+                breathe = true
+                meter.start()
+            }
+            .onDisappear {
+                meter.stop()
+            }
+    }
+}
+
+/// AVAudioEngine で RMS を測って 0–1 に正規化し、平滑化（0.7:0.3）して公開する
+@MainActor
+final class MicLevelMeter: ObservableObject {
+    @Published private(set) var smoothedLevel: CGFloat = 0
+
+    private let engine = AVAudioEngine()
+    private var isRunning = false
+
+    func start() {
+        guard !isRunning else { return }
+        isRunning = true
+
+        let input = engine.inputNode
+        let format = input.outputFormat(forBus: 0)
+        input.removeTap(onBus: 0)
+
+        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
+            guard let self else { return }
+            let normalized = self.normalizedRMS(from: buffer)
+            Task { @MainActor in
+                // v3-ui: 平滑化 0.7:0.3（必須）
+                self.smoothedLevel = 0.7 * self.smoothedLevel + 0.3 * normalized
+            }
+        }
+
+        do {
+            try engine.start()
+        } catch {
+            // 計測失敗時もUIは壊さない（smoothedLevel=0 のまま）
+            isRunning = false
+        }
+    }
+
+    func stop() {
+        guard isRunning else { return }
+        engine.inputNode.removeTap(onBus: 0)
+        engine.stop()
+        isRunning = false
+        smoothedLevel = 0
+    }
+
+    private func normalizedRMS(from buffer: AVAudioPCMBuffer) -> CGFloat {
+        guard let channelData = buffer.floatChannelData?[0] else { return 0 }
+        let frameLength = Int(buffer.frameLength)
+        guard frameLength > 0 else { return 0 }
+
+        var rms: Float = 0
+        vDSP_rmsqv(channelData, 1, &rms, vDSP_Length(frameLength))
+
+        // 20*log10(rms) を [-80,0] → [0,1] に正規化
+        let levelDb = 20 * log10f(max(rms, 0.000_001))
+        let minDb: Float = -80
+        let clamped = max(levelDb, minDb)
+        let normalized = (clamped - minDb) / -minDb
+        return CGFloat(min(max(normalized, 0), 1))
+    }
+}
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Session/EMAModal.swift
+import SwiftUI
+import UIKit
+
+/// tech-ema-v3 準拠: 「楽になった？」Yes/No/Skip（dismissはSkip扱い）
+struct EMAModal: View {
+    let onAnswer: (Bool?) -> Void
+
+    var body: some View {
+        VStack(spacing: AppTheme.Spacing.xl) {
+            Text(String(localized: "ema_question"))
+                .font(.system(size: 20, weight: .semibold))
+                .multilineTextAlignment(.center)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, AppTheme.Spacing.lg)
+
+            HStack(spacing: AppTheme.Spacing.lg) {
+                PrimaryButton(
+                    title: String(localized: "ema_yes"),
+                    isEnabled: true,
+                    isLoading: false,
+                    style: .primary,
+                    action: { haptic(); onAnswer(true) }
+                )
+                PrimaryButton(
+                    title: String(localized: "ema_no"),
+                    isEnabled: true,
+                    isLoading: false,
+                    style: .unselected,
+                    action: { haptic(); onAnswer(false) }
+                )
+            }
+            .padding(.horizontal, AppTheme.Spacing.xl)
+
+            Button {
+                haptic()
+                onAnswer(nil)
+            } label: {
+                Text(String(localized: "ema_skip"))
+                    .font(AppTheme.Typography.caption1Dynamic)
+                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
+            }
+            .padding(.top, AppTheme.Spacing.lg)
+
+            Spacer(minLength: 0)
+        }
+        .padding(.bottom, AppTheme.Spacing.xxl)
+        .presentationDetents([.medium])
+        .presentationDragIndicator(.visible)
+    }
+
+    private func haptic() {
+        UIImpactFeedbackGenerator(style: .light).impactOccurred()
+    }
+}
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Views/Session/SessionView.swift
+import SwiftUI
+import AVFoundation
+
+struct SessionView: View {
+    @EnvironmentObject private var appState: AppState
+    @Environment(\\.dismiss) private var dismiss
+    @ObservedObject private var controller = VoiceSessionController.shared
+
+    let topic: FeelingTopic
+
+    @State private var showMicAlert = false
+    @State private var isShowingEMA = false
+    @State private var pendingDismissAfterEMA = false
+
+    var body: some View {
+        VStack(spacing: AppTheme.Spacing.xl) {
+            topicPill
+
+            Spacer(minLength: AppTheme.Spacing.xl)
+
+            OrbView()
+
+            Text(statusText)
+                .font(AppTheme.Typography.bodyDynamic)
+                .foregroundStyle(AppTheme.Colors.secondaryLabel)
+
+            Spacer(minLength: AppTheme.Spacing.xl)
+
+            controlsRow
+        }
+        .padding(.horizontal, AppTheme.Spacing.lg)
+        .padding(.top, AppTheme.Spacing.lg)
+        .padding(.bottom, AppTheme.Spacing.xxl)
+        .background(AppBackground())
+        .navigationBarBackButtonHidden(true)
+        .toolbar {
+            ToolbarItem(placement: .navigationBarLeading) {
+                Button {
+                    endSessionAndMaybeAskEMA()
+                } label: {
+                    HStack(spacing: 6) {
+                        Image(systemName: "chevron.left")
+                        Text(String(localized: "common_back"))
+                    }
+                }
+            }
+        }
+        .onAppear {
+            ensureMicrophonePermissionAndStart()
+        }
+        .onDisappear {
+            // 画面が閉じたらセッションは終了しておく（多重接続防止）
+            if controller.connectionStatus != .disconnected {
+                controller.stop()
+            }
+        }
+        .sheet(isPresented: $isShowingEMA) {
+            EMAModal { answer in
+                Task { @MainActor in
+                    await controller.submitFeelingEMA(emaBetter: answer)
+                    isShowingEMA = false
+                    dismiss()
+                }
+            }
+        }
+        .alert(String(localized: "session_mic_permission_title"), isPresented: $showMicAlert) {
+            Button(String(localized: "common_open_settings")) {
+                if let url = URL(string: UIApplication.openSettingsURLString) {
+                    UIApplication.shared.open(url)
+                }
+            }
+            Button(String(localized: "common_cancel"), role: .cancel) {}
+        } message: {
+            Text(String(localized: "session_mic_permission_message"))
+        }
+    }
+
+    private var topicPill: some View {
+        Text(topicLabel)
+            .font(AppTheme.Typography.caption1Dynamic)
+            .foregroundStyle(AppTheme.Colors.secondaryLabel)
+            .padding(.horizontal, AppTheme.Spacing.lg)
+            .padding(.vertical, AppTheme.Spacing.sm)
+            .background(
+                RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous)
+                    .fill(AppTheme.Colors.buttonUnselected)
+            )
+    }
+
+    private var topicLabel: String {
+        switch topic {
+        case .selfLoathing: return String(localized: "session_topic_self_loathing")
+        case .anxiety: return String(localized: "session_topic_anxiety")
+        case .irritation: return String(localized: "session_topic_irritation")
+        case .freeConversation: return String(localized: "session_topic_free_conversation")
+        }
+    }
+
+    private var statusText: String {
+        if controller.connectionStatus == .connecting { return String(localized: "session_status_connecting") }
+        if controller.isModelSpeaking { return String(localized: "session_status_speaking") }
+        if controller.connectionStatus == .connected { return String(localized: "session_status_listening") }
+        return String(localized: "session_status_disconnected")
+    }
+
+    private var controlsRow: some View {
+        HStack {
+            Button {
+                controller.toggleMicMuted()
+            } label: {
+                Image(systemName: controller.isMicMuted ? "mic.slash.fill" : "mic.fill")
+                    .font(.system(size: 18, weight: .semibold))
+                    .foregroundStyle(AppTheme.Colors.label)
+                    .frame(width: 56, height: 56)
+                    .background(Circle().fill(AppTheme.Colors.cardBackground))
+                    .overlay(Circle().stroke(AppTheme.Colors.borderLight, lineWidth: 1))
+            }
+
+            Spacer()
+
+            Button {
+                endSessionAndMaybeAskEMA()
+            } label: {
+                Image(systemName: "xmark")
+                    .font(.system(size: 18, weight: .semibold))
+                    .foregroundStyle(Color.white)
+                    .frame(width: 56, height: 56)
+                    .background(Circle().fill(Color.red))
+            }
+        }
+        .padding(.horizontal, AppTheme.Spacing.lg)
+    }
+
+    private func endSessionAndMaybeAskEMA() {
+        let shouldAsk = controller.shouldAskFeelingEMA
+        controller.stop()
+        if shouldAsk {
+            isShowingEMA = true
+        } else {
+            Task { @MainActor in
+                await controller.submitFeelingEMA(emaBetter: nil)
+                dismiss()
+            }
+        }
+    }
+
+    private func ensureMicrophonePermissionAndStart() {
+        if #available(iOS 17.0, *) {
+            switch AVAudioApplication.shared.recordPermission {
+            case .granted:
+                controller.startFeeling(topic: topic)
+            case .undetermined:
+                AVAudioApplication.requestRecordPermission { granted in
+                    DispatchQueue.main.async {
+                        granted ? controller.startFeeling(topic: topic) : (showMicAlert = true)
+                    }
+                }
+            default:
+                showMicAlert = true
+            }
+        } else {
+            switch AVAudioSession.sharedInstance().recordPermission {
+            case .granted:
+                controller.startFeeling(topic: topic)
+            case .undetermined:
+                AVAudioSession.sharedInstance().requestRecordPermission { granted in
+                    DispatchQueue.main.async {
+                        granted ? controller.startFeeling(topic: topic) : (showMicAlert = true)
+                    }
+                }
+            default:
+                showMicAlert = true
+            }
+        }
+    }
+}
+
*** End Patch
```

> `common_back` は既存キーが無いため、Localizable に追加する（下記）。

### 5.3 文言追加（Talk/Session/EMA）

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
@@
 "common_cancel" = "Cancel";
+"common_back" = "Back";
@@
 "tab_talk" = "Talk";
@@
+"talk_nav_title" = "How are you feeling now?";
+"talk_feeling_self_loathing_title" = "Self-Loathing";
+"talk_feeling_self_loathing_subtitle" = "When you’re being hard on yourself.";
+"talk_feeling_anxiety_title" = "Anxiety & Worry";
+"talk_feeling_anxiety_subtitle" = "When your mind won’t stop spinning.";
+"talk_feeling_irritation_title" = "Irritation";
+"talk_feeling_irritation_subtitle" = "When tension is rising in you.";
+"talk_feeling_something_else_title" = "Something else";
+"talk_feeling_something_else_subtitle" = "Start a free conversation.";
+
+"session_topic_self_loathing" = "Talking about self-loathing";
+"session_topic_anxiety" = "Talking about anxiety";
+"session_topic_irritation" = "Talking about irritation";
+"session_topic_free_conversation" = "Talking about something else";
+
+"session_status_connecting" = "Connecting…";
+"session_status_listening" = "Anicca is listening…";
+"session_status_speaking" = "Anicca is speaking…";
+"session_status_disconnected" = "Session ended";
+
+"ema_question" = "Did you feel a bit better?";
+"ema_yes" = "Yes";
+"ema_no" = "No";
+"ema_skip" = "Skip";
*** End Patch
```

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
@@
 "common_cancel" = "キャンセル";
+"common_back" = "戻る";
@@
 "tab_talk" = "会話";
@@
+"talk_nav_title" = "今どんな感じ？";
+"talk_feeling_self_loathing_title" = "自己嫌悪";
+"talk_feeling_self_loathing_subtitle" = "自分を責めすぎているとき。";
+"talk_feeling_anxiety_title" = "不安";
+"talk_feeling_anxiety_subtitle" = "頭が止まらないとき。";
+"talk_feeling_irritation_title" = "苛立ち";
+"talk_feeling_irritation_subtitle" = "緊張が高まっているとき。";
+"talk_feeling_something_else_title" = "その他";
+"talk_feeling_something_else_subtitle" = "自由に話す。";
+
+"session_topic_self_loathing" = "自己嫌悪について";
+"session_topic_anxiety" = "不安について";
+"session_topic_irritation" = "苛立ちについて";
+"session_topic_free_conversation" = "自由に話す";
+
+"session_status_connecting" = "接続中…";
+"session_status_listening" = "Aniccaが聞いています…";
+"session_status_speaking" = "Aniccaが話しています…";
+"session_status_disconnected" = "セッションを終了しました";
+
+"ema_question" = "さっきより楽になった？";
+"ema_yes" = "はい";
+"ema_no" = "いいえ";
+"ema_skip" = "スキップ";
*** End Patch
```

---

### 5.4 VoiceSessionController 拡張（公式 Realtime イベント/形式へ）
> 根拠: `session.update` は Realtime API reference の `audio.input/output` 構造へ（`https://platform.openai.com/docs/api-reference/realtime-client-events/session/update`）。  
> speaking/listening の判定は `output_audio_buffer.started/stopped` と `input_audio_buffer.speech_started/stopped`（`https://platform.openai.com/docs/api-reference/realtime-server-events`）。

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/VoiceSessionController.swift
@@
 final class VoiceSessionController: NSObject, ObservableObject {
@@
     @Published private(set) var connectionStatus: ConnectionState = .disconnected
+    @Published private(set) var isModelSpeaking: Bool = false
+    @Published private(set) var isUserSpeaking: Bool = false
+    @Published private(set) var isMicMuted: Bool = false
+
+    /// tech-ema-v3: 5秒以上のみ EMA を聞く
+    var shouldAskFeelingEMA: Bool {
+        guard let start = sessionStartTime else { return false }
+        return Date().timeIntervalSince(start) >= 5
+    }
+
+    // Feeling セッション識別（/api/mobile/feeling/end で使用）
+    private var activeFeelingSessionId: String?
+    private var activeFeelingTopic: FeelingTopic?
@@
     func start(shouldResumeImmediately: Bool = false) {
@@
     }
+
+    /// v3: Talk/Feeling セッション開始（TalkView→SessionView から呼ぶ）
+    func startFeeling(topic: FeelingTopic) {
+        guard connectionStatus != .connecting else { return }
+        setStatus(.connecting)
+        activeFeelingTopic = topic
+        currentHabitType = nil
+        stickyActive = AppState.shared.userProfile.stickyModeEnabled
+        stickyUserReplyCount = 0
+        stickyReady = false
+        Task { [weak self] in
+            await self?.establishSession(resumeImmediately: false)
+        }
+    }
@@
     func stop() {
@@
         sessionStartTime = nil
@@
         cachedSecret = nil
         setStatus(.disconnected)
         deactivateAudioSession()
         // stop()時にはmarkQuotaHoldを呼ばない（エンドセッション押下時の誤表示を防ぐ）
     }
+
+    /// tech-ema-v3: Feeling セッション終了時の EMA をサーバへ送信（true/false/null）
+    @MainActor
+    func submitFeelingEMA(emaBetter: Bool?) async {
+        guard let feelingSessionId = activeFeelingSessionId,
+              case .signedIn(let credentials) = AppState.shared.authStatus else {
+            // まだ start が走っていない or 未ログインなら何もしない
+            activeFeelingTopic = nil
+            activeFeelingSessionId = nil
+            return
+        }
+        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("mobile/feeling/end"))
+        request.httpMethod = "POST"
+        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
+        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
+        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
+
+        let payload: [String: Any] = [
+            "session_id": feelingSessionId,
+            "emaBetter": emaBetter as Any
+        ]
+        request.httpBody = try? JSONSerialization.data(withJSONObject: payload, options: [])
+
+        do {
+            _ = try await NetworkSessionManager.shared.session.data(for: request)
+        } catch {
+            logger.error("Failed to submit EMA: \(error.localizedDescription, privacy: .public)")
+        }
+        activeFeelingTopic = nil
+        activeFeelingSessionId = nil
+    }
@@
     func sendSessionUpdate() {
@@
-        var sessionPayload: [String: Any] = [
-            "modalities": ["text", "audio"],
-            "voice": "alloy",
-            "input_audio_format": "pcm16",
-            "output_audio_format": "pcm16",
-            "input_audio_noise_reduction": [
-                "type": "near_field"
-            ],
-            "max_response_output_tokens": "inf"
-        ]
+        // OpenAI Realtime 公式: session.update は audio.{input,output} / output_modalities 形式
+        // refs:
+        // - https://platform.openai.com/docs/api-reference/realtime-client-events/session/update
+        // - https://platform.openai.com/docs/guides/realtime-conversations
+        var sessionPayload: [String: Any] = [
+            "type": "realtime",
+            "output_modalities": ["audio", "text"],
+            "max_output_tokens": "inf",
+            "audio": [
+                "input": [
+                    "format": [
+                        "type": "audio/pcm",
+                        "rate": 24000
+                    ]
+                ],
+                "output": [
+                    "format": [
+                        "type": "audio/pcm",
+                        "rate": 24000
+                    ],
+                    "voice": "alloy",
+                    "speed": 1.0
+                ]
+            ],
+            "tool_choice": "auto",
+            "tools": RealtimeTools.defaultTools
+        ]
@@
-        // トレーニング時は turn_detection を null に設定してマイク入力を完全に無効化
-        if isTrainingMode {
-            // トレーニング時: マイク入力を完全に無効化（一方向モード）
-            sessionPayload["turn_detection"] = NSNull()
-            logger.info("Training mode: turn_detection disabled for one-way audio")
-        } else {
-            // その他の習慣: 双方向対話を維持
-            sessionPayload["turn_detection"] = [
-                "type": "semantic_vad",
-                "eagerness": "low",
-                "interrupt_response": true,
-                "create_response": true
-            ]
-        }
+        // Realtime: audio.input.turn_detection
+        if isTrainingMode {
+            // 一方向（入力なし）
+            (sessionPayload["audio"] as? [String: Any])?["input"] = [
+                "format": ["type": "audio/pcm", "rate": 24000],
+                "turn_detection": NSNull()
+            ]
+            logger.info("Training mode: turn_detection disabled for one-way audio")
+        } else {
+            (sessionPayload["audio"] as? [String: Any])?["input"] = [
+                "format": ["type": "audio/pcm", "rate": 24000],
+                "turn_detection": [
+                    "type": "server_vad",
+                    "create_response": true,
+                    "interrupt_response": true
+                ]
+            ]
+        }
@@
-        var shouldTriggerHabitResponse = false
-        var instructions: String?
-        if let prompt = AppState.shared.consumePendingPrompt() {
-            instructions = prompt
-            shouldTriggerHabitResponse = true   // habit プロンプト送信を記録
-        } else if let consultPrompt = AppState.shared.consumePendingConsultPrompt() {
-            instructions = consultPrompt
-        }
+        var shouldTriggerImmediateResponse = false
+        var instructions: String?
+        if let prompt = AppState.shared.consumePendingPrompt() {
+            instructions = prompt
+            shouldTriggerImmediateResponse = true   // habit: 起動時に話し始める
+        } else if let consultPrompt = AppState.shared.consumePendingConsultPrompt() {
+            instructions = consultPrompt
+            shouldTriggerImmediateResponse = true   // consult: v3 では「モデルが先に話す」前提
+        } else if let feeling = activeFeelingTopic {
+            instructions = RealtimePromptBuilder.buildFeelingInstructions(topic: feeling, profile: AppState.shared.userProfile)
+            shouldTriggerImmediateResponse = true
+        }
@@
         if let instructions {
             sessionPayload["instructions"] = instructions
         }
@@
         if shouldTriggerHabitResponse {
-            sendWakeResponseCreate()
+            sendWakeResponseCreate()
             Task { @MainActor in
                 AppState.shared.clearPendingHabitTrigger()
             }
         }
     }
@@
     private func handleRealtimeEvent(_ event: [String: Any]) {
         guard let type = event["type"] as? String else { return }
         switch type {
-        case "output_audio_buffer.started":
+        case "output_audio_buffer.started":
             logger.info("output_audio_buffer.started: stickyActive=\(self.stickyActive), stickyReady=\(self.stickyReady)")
             print("output_audio_buffer.started: stickyActive=\(stickyActive), stickyReady=\(stickyReady)")
+            isModelSpeaking = true
             if stickyActive && !stickyReady {
                 stickyReady = true
                 logger.info("Sticky ready: first audio started → stickyReady=true")
                 print("Sticky ready: first audio started → stickyReady=true")
             }
+
+        case "output_audio_buffer.stopped", "output_audio_buffer.cleared":
+            isModelSpeaking = false
         
+        case "input_audio_buffer.speech_started":
+            isUserSpeaking = true
+
         case "input_audio_buffer.speech_stopped":
             // ★★★ ユーザーの発話終了を検知（WebRTCでの正しいイベント）★★★
             logger.info("input_audio_buffer.speech_stopped: stickyActive=\(self.stickyActive), stickyReady=\(self.stickyReady)")
             print("input_audio_buffer.speech_stopped: stickyActive=\(stickyActive), stickyReady=\(stickyReady)")
+            isUserSpeaking = false
             guard stickyActive && stickyReady else { return }
@@
         case "response.done":
+            // Function calling: response.done 内の function_call item を検出し、HTTP tool に転送して戻す
+            // refs:
+            // - https://platform.openai.com/docs/guides/realtime-conversations#function-calling
+            // - https://platform.openai.com/docs/api-reference/realtime-server-events
+            if let response = event["response"] as? [String: Any],
+               let output = response["output"] as? [[String: Any]] {
+                Task { @MainActor in
+                    await self.handleFunctionCallsIfNeeded(outputItems: output)
+                }
+            }
             if stickyActive {
                 logger.info("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): response.done → scheduling next in 5s")
                 print("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): response.done → scheduling next in 5s")
                 Task { @MainActor in
                     try? await Task.sleep(nanoseconds: 5_000_000_000)
                     guard self.stickyActive else {
                         self.logger.info("Sticky: cancelled during 5s delay (stickyActive=false)")
                         return
                     }
                     self.sendWakeResponseCreate()
                 }
             }
         
         default:
             break
         }
     }
+
+    @MainActor
+    private func handleFunctionCallsIfNeeded(outputItems: [[String: Any]]) async {
+        let functionCalls = outputItems.filter { ($0["type"] as? String) == "function_call" }
+        guard !functionCalls.isEmpty else { return }
+
+        for call in functionCalls {
+            guard let name = call["name"] as? String,
+                  let callId = call["call_id"] as? String,
+                  let arguments = call["arguments"] as? String else { continue }
+            let result = await RealtimeToolRouter.callTool(name: name, argumentsJSON: arguments)
+            sendFunctionCallOutput(callId: callId, output: result)
+        }
+        // ツール出力を足した後、モデルに続きの応答を作らせる
+        sendResponseCreate()
+    }
+
+    private func sendFunctionCallOutput(callId: String, output: String) {
+        let payload: [String: Any] = [
+            "type": "conversation.item.create",
+            "item": [
+                "type": "function_call_output",
+                "call_id": callId,
+                "output": output
+            ]
+        ]
+        sendEvent(payload)
+    }
+
+    private func sendResponseCreate() {
+        sendEvent(["type": "response.create"])
+    }
+
+    private func sendEvent(_ payload: [String: Any]) {
+        guard let channel = dataChannel, channel.readyState == .open else { return }
+        do {
+            let data = try JSONSerialization.data(withJSONObject: payload, options: [.fragmentsAllowed])
+            channel.sendData(RTCDataBuffer(data: data, isBinary: false))
+        } catch {
+            logger.error("Failed to send event \(payload["type"] as? String ?? "unknown"): \(error.localizedDescription, privacy: .public)")
+        }
+    }
 }
+
+/// Realtime tools（v3-stack: /tools/*）の定義を Swift 側に固定（Prompts/Tools と同一）
+private enum RealtimeTools {
+    static var defaultTools: [[String: Any]] {
+        // Realtime API の tools 形（name/description/parameters がトップレベル）
+        // refs: https://platform.openai.com/docs/guides/realtime-conversations#configure-callable-functions
+        [
+            [
+                "type": "function",
+                "name": "get_context_snapshot",
+                "description": "Get the user's current context including recent behavior, feelings, and patterns",
+                "parameters": [
+                    "type": "object",
+                    "strict": true,
+                    "additionalProperties": false,
+                    "properties": [
+                        "userId": ["type": "string"],
+                        "includeDailyMetrics": ["type": "boolean"]
+                    ],
+                    "required": ["userId"]
+                ]
+            ],
+            [
+                "type": "function",
+                "name": "choose_nudge",
+                "description": "Choose the best nudge template for a target behavior",
+                "parameters": [
+                    "type": "object",
+                    "strict": true,
+                    "additionalProperties": false,
+                    "properties": [
+                        "userId": ["type": "string"],
+                        "targetBehavior": ["type": "string"]
+                    ],
+                    "required": ["userId", "targetBehavior"]
+                ]
+            ],
+            [
+                "type": "function",
+                "name": "log_nudge",
+                "description": "Log a nudge that was delivered and its metadata",
+                "parameters": [
+                    "type": "object",
+                    "strict": true,
+                    "additionalProperties": false,
+                    "properties": [
+                        "userId": ["type": "string"],
+                        "templateId": ["type": "string"],
+                        "channel": ["type": "string"]
+                    ],
+                    "required": ["userId", "templateId", "channel"]
+                ]
+            ],
+            [
+                "type": "function",
+                "name": "get_behavior_summary",
+                "description": "Get today's behavior summary for the Behavior tab",
+                "parameters": [
+                    "type": "object",
+                    "strict": true,
+                    "additionalProperties": false,
+                    "properties": [
+                        "userId": ["type": "string"]
+                    ],
+                    "required": ["userId"]
+                ]
+            ]
+        ]
+    }
+}
+
+/// tools 呼び出しを iOS→Backend にルーティングして JSON 文字列で返す
+private enum RealtimeToolRouter {
+    @MainActor
+    static func callTool(name: String, argumentsJSON: String) async -> String {
+        guard case .signedIn(let credentials) = AppState.shared.authStatus else {
+            return "{\"error\":{\"code\":\"UNAUTHORIZED\",\"message\":\"Not signed in\"}}"
+        }
+        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("tools/\\(name)"))
+        request.httpMethod = "POST"
+        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
+        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
+        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
+        request.httpBody = argumentsJSON.data(using: .utf8)
+
+        do {
+            let (data, _) = try await NetworkSessionManager.shared.session.data(for: request)
+            return String(data: data, encoding: .utf8) ?? "{}"
+        } catch {
+            return "{\"error\":{\"code\":\"NETWORK_ERROR\",\"message\":\"\\(error.localizedDescription)\"}}"
+        }
+    }
+}
+
+/// Talk/Feeling 用の Realtime instructions を Resources/Prompts から構築
+private enum RealtimePromptBuilder {
+    static func buildFeelingInstructions(topic: FeelingTopic, profile: UserProfile) -> String {
+        // common.txt は HabitPromptBuilder と同じ言語ロックを流用（LANGUAGE_LINE を埋める）
+        let common = (load(name: "common", ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
+        let talkSystem = (load(name: "talk_session", ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
+        let openerName: String = {
+            switch topic {
+            case .selfLoathing: return "feeling_self_loathing"
+            case .anxiety: return "feeling_anxiety"
+            case .irritation: return "feeling_irritation"
+            case .freeConversation: return "feeling_free_conversation"
+            }
+        }()
+        let opener = (load(name: openerName, ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
+        // 既存の置換ロジックを最小限で複製（LANGUAGE_LINE/USER_NAME 等）
+        let rendered = HabitPromptBuilder().buildPrompt(for: .custom, scheduledTime: nil, now: Date(), profile: profile)
+        return [common, talkSystem, opener, "\\n\\n[Profile]\\n\\(rendered)"].joined(separator: "\\n\\n")
+    }
+
+    private static func load(name: String, ext: String) -> String? {
+        guard let url = Bundle.main.url(forResource: name, withExtension: ext) else { return nil }
+        return try? String(contentsOf: url, encoding: .utf8)
+    }
+}
*** End Patch
```

### 5.4 補足（VoiceSessionController の設計判断）
- `session.update` の payload は **公式の `audio.input/output` 構造へ統一**（現状コードの `modalities/input_audio_format/...` は旧形式）
- speaking/listening の UI は Realtime server event で判定:
  - `output_audio_buffer.started` → speaking
  - `output_audio_buffer.stopped|cleared` → listening
  - `input_audio_buffer.speech_started|stopped` → ユーザー発話中UIなどに拡張可能
- ツール呼び出しは `response.done` の `output[]` に `function_call` が入る公式フローに合わせる（Realtime conversations の function calling 節）

---

### 5.5 Prompts / Tools 更新（Resources/Prompts）
> `prompts-v3.md` の tools 定義（Chat Completions 風の `function:{...}` ネスト）は **Realtime では形が異なる**ため、iOS 実装側（本パッチ）では Realtime公式の `tools: [{type,name,description,parameters}]` 形式を採用する。  
> 根拠: `https://platform.openai.com/docs/guides/realtime-conversations#configure-callable-functions`

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Resources/Prompts/talk_session.txt
+あなたは Anicca。音声でユーザーの苦しみを和らげ、行動と心を整える導師。
+
+Core Principles
+- Warm and compassionate, never judgmental.
+- Feeling セッション開始時は、ユーザーより先に短い opener を話し始める。
+- Realtime では 1–2 文で短く。長い独白は禁止。
+- 苦しみを認めてから、次の一歩を静かに指し示す（命令ではなく示す）。
+
+Prohibited
+- 診断/医療助言/法的助言
+- 恥辱化/断罪/説教調
+
+Operational
+- 文脈が不足している時は tools を使って確認する（推測で断定しない）。
+- ${LANGUAGE_LINE} 以外で話さない（common.txt の LANGUAGE LOCK に従う）。
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Resources/Prompts/feeling_self_loathing.txt
+[Feeling: self_loathing]
+短い opener を 2–3 文で。痛みの承認→事実と解釈の分離→優しさの足場。
+質問攻めにしない。
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Resources/Prompts/feeling_anxiety.txt
+[Feeling: anxiety]
+短い opener を 2–3 文で。身体/現在へのグラウンディング→受容→最小の一歩。
+質問攻めにしない。
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Resources/Prompts/feeling_irritation.txt
+[Feeling: irritation]
+短い opener を 2–3 文で。反応の前に 1 呼吸→評価語を避ける→価値に沿う一歩。
+質問攻めにしない。
+
*** End Patch
```

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Resources/Prompts/feeling_free_conversation.txt
+[Feeling: free_conversation]
+短い opener を 2–3 文で。安全の宣言→主導権がユーザー→沈黙も許容。
+必要なら tool で context を取ってから話し始める。
+
*** End Patch
```

---

## 課題対応（該当する場合）
- **prompts-v3.md の tool schema 形式差**:
  - 本パッチは **Realtime API の tools 形式**（`type/name/description/parameters`）に合わせる（公式根拠URL上記）
  - `prompts-v3.md` 自体の更新はフェーズ5の対象外だが、ドキュメントと実装の齟齬が残るため v0.3 期間中に追随修正推奨

## 注意点・改善提案
- `OrbView` の AVAudioEngine tap が WebRTC 音声入力と競合する可能性があるため、実装後は実機で「WebRTC音声が途切れない」ことを最優先で確認する（競合する場合は計測経路を `AVAudioRecorder` メータリングへ切り替えるが、仕様変更が必要なので別途根拠提示）。









