# Anicca 分析基盤指示書（RevenueCat × Amplitude）

## 概要

- **目的**: Aniccaの「行動ログ＋サブスクイベント」を一箇所（Amplitude）に集約し、
  - オンボーディング離脱ポイント
  - 音声セッション利用状況
  - ペイウォール → トライアル → 課金ファネル
  をいつでも見れる状態にする。
- **対象**:
  - iOSクライアント（`aniccaios/`）
  - RevenueCatダッシュボード
  - Amplitudeプロジェクト

---

## 1. 採用ツールと方針

### 1.1 採用ツール

- **Amplitude**（プロダクト分析・ファネル分析）
- **RevenueCat**（既に導入済みのサブスク管理）
  - RevenueCat → Amplitude 公式連携を使用

### 1.2 追加ツールの扱い

- **Intercom / Mixpanel など**: 現フェーズでは導入しない
  - 必要になったときに、Amplitudeのデータを見ながら別タスクで検討

### 1.3 なぜ今導入するか

- ユーザー数が少なくても、「どの導線がハマっているか／どこで落ちているか」を早めに把握
- プロダクト改善の打ち手を外しにくくなる
- 後から履歴を見返せる（レトロスペクティブがしやすい）

---

## 2. ユーザーID戦略（最重要）

### 2.1 方針

すべてのシステムで「同じユーザー」を指すIDを揃える。

**Canonical ID = バックエンド / RevenueCat の `user-id`**（Apple Sign-in後にサーバから返る値）

### 2.2 実装ポリシー

| システム | IDの設定方法 | 確認箇所 |
|----------|-------------|----------|
| **RevenueCat** | `App User ID`に`user-id`をセット | `SubscriptionManager.handleLogin()` |
| **Amplitude** | `setUserId(userId)`に`user-id`を渡す | クライアント初期化時 |
| **バックエンド** | 既に`user-id`ヘッダで処理 | 変更不要 |

### 2.3 匿名ユーザーの扱い

- 未ログイン状態では、Amplitudeの自動生成anonymous IDのままでもよい
- ログイン時に`setUserId()`で上書きする

---

## 3. Amplitude プロジェクト準備

### 3.1 プロジェクト作成

1. [Amplitude](https://amplitude.com/)にログイン
2. 「Create Project」→ プロジェクト名: `Anicca iOS`
3. Platform: **iOS** を選択

### 3.2 API Key取得

1. Settings → Projects → `Anicca iOS` → API Keys
2. **API Key（クライアントキー）**を控える
   - 例: `abc123def456...`（実際の値に置き換える）

### 3.3 タイムゾーン設定

1. Settings → Projects → `Anicca iOS` → General
2. Timezone を **Asia/Tokyo (UTC+9)** に設定

### 3.4 環境分け（オプション）

- 開発用・本番用を分ける場合は2プロジェクト作成 or Environment機能を利用
- ここでは最低限「本番用プロジェクト」を用意しておけばよい

---

## 4. RevenueCat → Amplitude 連携設定

### 4.1 連携有効化

1. [RevenueCatダッシュボード](https://app.revenuecat.com/)にログイン
2. プロジェクト選択 → **Integrations** → **Amplitude** を選択
3. 「Connect Amplitude」をクリック

### 4.2 設定項目

1. **Amplitude API Key**:
   - 上記3.2で取得したAPI Keyを入力

2. **Event Types**（送信するイベント）:
   - ✅ `initial_purchase`
   - ✅ `trial_started`
   - ✅ `trial_converted`
   - ✅ `renewal`
   - ✅ `cancellation`
   - ✅ `billing_issue`

3. **User Identification**:
   - RevenueCatの`App User ID`をAmplitudeの`user_id`として送る設定にする
   - 「Map App User ID to Amplitude User ID」にチェック

4. **Save**して有効化

### 4.3 動作確認

1. Sandbox環境でテスト用ユーザーで1件サブスクを開始
2. 数分後、Amplitudeの「Events」画面で確認:
   - `initial_purchase`（など）が届いている
   - `user_id`に`user-id`が入っている

---

## 5. iOSクライアントへの Amplitude SDK 導入

### 5.1 依存関係追加

**Swift Package Manager (SPM) を使用**:

1. Xcode → `aniccaios.xcodeproj` → Package Dependencies
2. 「+」をクリック
3. URL: `https://github.com/amplitude/Amplitude-iOS.git`
4. Version: 最新の安定版（例: `8.17.0`）
5. Target: `aniccaios` に追加

### 5.2 初期化コード

**初期化場所**: `aniccaios/aniccaios/AppState.swift` または `AppDelegate.swift`

**実装例**:

```swift
import Amplitude

// AppState.swift または AppDelegate.swift
class AppState: ObservableObject {
    private var amplitude: Amplitude?
    
    init() {
        // Amplitude初期化
        amplitude = Amplitude.instance()
        amplitude?.initializeApiKey(Config.amplitudeApiKey)
        
        // デフォルト設定
        amplitude?.setServerUrl("https://api2.amplitude.com")
    }
    
    func setUserId(_ userId: String?) {
        amplitude?.setUserId(userId)
    }
    
    func clearUserId() {
        amplitude?.setUserId(nil)
    }
}
```

**Config.swift にAPI Keyを追加**:

```swift
// Config.swift
struct Config {
    static var amplitudeApiKey: String {
        // Info.plistから読み込む
        guard let key = Bundle.main.object(forInfoDictionaryKey: "AMPLITUDE_API_KEY") as? String else {
            fatalError("AMPLITUDE_API_KEY not found in Info.plist")
        }
        return key
    }
}
```

**Info.plist に追加**:

```xml
<key>AMPLITUDE_API_KEY</key>
<string>YOUR_API_KEY_HERE</string>
```

### 5.3 ユーザーID設定タイミング

**サインイン時**:

```swift
// AppState.swift の updateUserCredentials など
func updateUserCredentials(_ credentials: UserCredentials) {
    // ... 既存の処理 ...
    
    // AmplitudeにユーザーIDを設定
    setUserId(credentials.userId)
}
```

**サインアウト時**:

```swift
func signOut() {
    // ... 既存の処理 ...
    
    // AmplitudeのユーザーIDをクリア
    clearUserId()
}
```

---

## 6. クライアントイベント設計

### 6.1 イベント命名規則

- すべて英小文字＋スネークケース
- 例:
  - `onboarding_step_completed`
  - `paywall_shown`
  - `voice_session_started`
  - `voice_session_ended`

### 6.2 AnalyticsService ラッパー作成

**新規ファイル**: `aniccaios/aniccaios/Services/AnalyticsService.swift`

```swift
import Amplitude

class AnalyticsService {
    static let shared = AnalyticsService()
    private let amplitude = Amplitude.instance()
    
    private init() {}
    
    func track(_ eventName: String, properties: [String: Any]? = nil) {
        amplitude?.logEvent(eventName, withEventProperties: properties)
    }
    
    func setUserProperty(_ property: String, value: Any) {
        amplitude?.setUserProperties([property: value])
    }
}
```

### 6.3 送信ポイント & プロパティ定義

#### 6.3.1 オンボーディング

**場所**: `Onboarding/OnboardingFlowView.swift`

**イベント**: `onboarding_step_completed`

**プロパティ**:
- `step`: `welcome`, `microphone`, `notifications`, `account`, `profile`, `habit_setup`, `paywall`, `completion`
- `from_push_notification`: Bool（通知から起動した場合にtrue）

**実装例**:

```swift
// OnboardingFlowView.swift
func moveToNextStep() {
    // ... 既存の処理 ...
    
    AnalyticsService.shared.track("onboarding_step_completed", properties: [
        "step": currentStep.rawValue,
        "from_push_notification": false
    ])
}
```

#### 6.3.2 ペイウォール

**場所**: `Views/SubscriptionRequiredView.swift` または `Views/ManageSubscriptionSheet.swift`

**イベント**: `paywall_shown`

**プロパティ**:
- `source`: `onboarding`, `settings`, `quota_hold` など
- `offering_identifier`: RevenueCat Offering ID
- `paywall_variant`: 将来A/Bテスト用（Step4と連動）

**実装例**:

```swift
// SubscriptionRequiredView.swift
var body: some View {
    // ...
    .onAppear {
        AnalyticsService.shared.track("paywall_shown", properties: [
            "source": source.rawValue,
            "offering_identifier": offering.identifier,
            "paywall_variant": "default"
        ])
    }
}
```

#### 6.3.3 音声セッション

**場所**: `VoiceSessionController.swift`

**イベント**:
- `voice_session_started`
  - `trigger`: `manual`, `habit_wake_notification`, `habit_sleep_notification`, `training_notification`
- `voice_session_ended`
  - `reason`: `user_stopped`, `quota_exceeded`, `error`, `timeout`

**実装例**:

```swift
// VoiceSessionController.swift
func start() {
    // ... 既存の処理 ...
    
    AnalyticsService.shared.track("voice_session_started", properties: [
        "trigger": trigger.rawValue
    ])
}

func stop() {
    // ... 既存の処理 ...
    
    AnalyticsService.shared.track("voice_session_ended", properties: [
        "reason": reason.rawValue
    ])
}
```

---

## 7. Amplitude 側でのダッシュボード構築

### 7.1 オンボーディングファネル

1. Amplitudeダッシュボード → **Charts** → **Funnel**
2. イベントを順番に追加:
   - `onboarding_step_completed` (step = welcome)
   - `onboarding_step_completed` (step = account)
   - `onboarding_step_completed` (step = habit_setup)
   - `onboarding_step_completed` (step = paywall)
   - `onboarding_step_completed` (step = completion)
3. どのステップで落ちているかを可視化

### 7.2 課金ファネル

1. **Charts** → **Funnel**
2. イベントを順番に追加:
   - `paywall_shown`（クライアントイベント）
   - `trial_started`（RevenueCat経由）
   - `initial_purchase`（RevenueCat経由）
3. 「ペイウォールを見た人のうち何%がトライアル→課金に至るか」を見る

### 7.3 セッション利用状況

1. **Charts** → **User Composition** → **Active Users**
2. イベント: `voice_session_started`
3. 日次/週次で集計
4. DAU/WAUとの相関を見るチャートを作る

---

## 8. テスト & 検証

### 8.1 クライアントイベント確認

1. 開発環境で:
   - 仮ユーザー1人でオンボーディング→ペイウォール→セッションを1周する
2. Amplitudeの「Live view」でイベントが想定どおりに届いているか確認:
   - [Amplitude Live View](https://analytics.amplitude.com/your-project/live)

### 8.2 RevenueCat連携確認

1. Sandbox環境でテスト課金を1件発生させる
2. 数分後、Amplitudeの「Events」画面で確認:
   - `trial_started` / `initial_purchase` が届いている
   - `user_id`が正しく設定されている

---

## 9. 成果物チェックリスト

- [ ] Amplitudeプロジェクトが作成され、API Keyが管理されている
- [ ] RevenueCat → Amplitude連携が有効で、RCイベントが届いている
- [ ] iOSクライアントから`onboarding_step_completed` / `paywall_shown` / `voice_session_started` / `voice_session_ended`が送信されている
- [ ] ユーザーIDがRevenueCat / Amplitude / Backendで揃っている
- [ ] オンボーディング・課金・セッションのファネルがAmplitudeで見える

---

## 10. 参考リンク

- [RevenueCat Amplitude統合ガイド](https://www.revenuecat.com/docs/integrations/amplitude)
- [Amplitude iOS SDK ドキュメント](https://developers.amplitude.com/docs/ios)
- [Amplitude イベント設計ガイド](https://developers.amplitude.com/docs/event-design-guide)

---

## 11. トラブルシューティング

### イベントが届かない

- Amplitude Live Viewで確認
- API Keyが正しく設定されているか確認
- ネットワーク接続を確認

### ユーザーIDが一致しない

- RevenueCatダッシュボードで`App User ID`を確認
- Amplitudeのイベント詳細で`user_id`を確認
- クライアント側で`setUserId()`が正しく呼ばれているか確認

