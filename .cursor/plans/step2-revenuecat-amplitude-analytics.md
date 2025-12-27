# Anicca 分析基盤指示書（RevenueCat × Mixpanel）

## 概要（更新: 2025-12）

- **目的**: Aniccaの「行動ログ＋サブスクイベント」を一箇所（Mixpanel）に集約し、
  - オンボーディング離脱ポイント
  - 音声セッション利用状況
  - ペイウォール → トライアル → 課金ファネル
  をいつでも見れる状態にする。
- **対象**:
  - iOSクライアント（`aniccaios/`）
  - RevenueCatダッシュボード
  - Mixpanelプロジェクト

---

## 1. 採用ツールと方針（結論と理由）

### 1.1 採用ツール（推奨）

- **Mixpanel**（プロダクト分析・ファネル分析）
- **RevenueCat**（既に導入済みのサブスク管理）
  - RevenueCat → Mixpanel 公式連携を使用

参考（公式）:
- RevenueCat × Mixpanel 公式連携: https://www.revenuecat.com/docs/integrations/third-party-integrations/mixpanel
- RevenueCat × Amplitude 公式連携（比較用）: https://www.revenuecat.com/docs/integrations/third-party-integrations/amplitude
- RevenueCat 対応インテグレーション一覧: https://www.revenuecat.com/docs/integrations/third-party-integrations/supported-integrations-index

### 1.2 「Amplitudeはダメ？」への回答（バイアス排除）

- **Amplitudeも成立**（RevenueCat公式連携あり）。
- ただし、Aniccaの現状（少人数・最速で回す・ユーザー少なめ）では **Mixpanelのほうが「無料枠の理解と運用」が単純になりやすい** ため、まずMixpanel推奨。
- チームがAmplitudeに慣れている/既存データ基盤がAmplitude中心ならAmplitude採用でもOK（この文書の手順を置換して進める）。

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
| **Mixpanel** | `identify(userId)`に`user-id`を渡す | サインイン直後 |
| **バックエンド** | 既に`user-id`ヘッダで処理 | 変更不要 |

### 2.3 匿名ユーザーの扱い

- 未ログイン状態では、Mixpanelの distinct_id（自動生成）でよい
- ログイン時に `identify(userId)` で紐付ける

---

## 3. Mixpanel プロジェクト準備

### 3.1 プロジェクト作成

1. https://mixpanel.com/ にログイン
2. Project を作成（例: `Anicca iOS`）
3. Timezone を **Asia/Tokyo** に設定（可能なら）

### 3.2 Project Token 取得

1. Project Settings から **Project Token** を控える（クライアント用）

### 3.3 環境分け（オプション）

- 開発用・本番用を分ける場合は2プロジェクト作成 or Environment機能を利用
- ここでは最低限「本番用プロジェクト」を用意しておけばよい

---

## 4. RevenueCat → Mixpanel 連携設定

### 4.1 連携有効化

1. [RevenueCatダッシュボード](https://app.revenuecat.com/)にログイン
2. プロジェクト選択 → **Integrations** → **Mixpanel** を選択
3. Mixpanel連携を有効化

### 4.2 設定項目（最低限）

1. **Project Token**（Mixpanel側）を設定
2. **User Identity**:
   - RevenueCatの `App User ID` が、Mixpanel上の user identity（distinct_id）として扱われるよう設定
3. **Save**して有効化

### 4.3 動作確認

1. Sandbox環境でテスト用ユーザーで1件サブスクを開始
2. 数分後、Mixpanelのイベント一覧で確認:
   - RevenueCat起因のイベント（例: `rc_initial_purchase_event` 等）が届いている
   - distinct_id が期待通り（`user-id`）になっている

---

## 5. iOSクライアントへの Mixpanel SDK 導入

### 5.1 依存関係追加（SPM）

**Swift Package Manager (SPM) を使用**（推奨）:

1. Xcode → `aniccaios.xcodeproj` → Package Dependencies
2. 「+」をクリック
3. URL: `https://github.com/mixpanel/mixpanel-swift.git`
4. Version: 最新の安定版（Xcodeが提示する安定版）
5. Target: `aniccaios` に追加

### 5.2 初期化コード（例）

**初期化場所**: `aniccaios/aniccaios/AppState.swift` または `AppDelegate.swift`

**実装例**:

```swift
import Mixpanel

// AppState.swift または AppDelegate.swift
class AppState: ObservableObject {
    init() {
        Mixpanel.initialize(token: Config.mixpanelToken, trackAutomaticEvents: true)
    }
    
    func identifyUser(_ userId: String) {
        Mixpanel.mainInstance().identify(distinctId: userId)
    }
}
```

**Config.swift に Token を追加**:

```swift
// Config.swift
struct Config {
    static var mixpanelToken: String {
        // Info.plistから読み込む
        guard let token = Bundle.main.object(forInfoDictionaryKey: "MIXPANEL_TOKEN") as? String else {
            fatalError("MIXPANEL_TOKEN not found in Info.plist")
        }
        return token
    }
}
```

**Info.plist に追加**:

```xml
<key>MIXPANEL_TOKEN</key>
<string>YOUR_TOKEN_HERE</string>
```

### 5.3 ユーザーID設定タイミング

**サインイン時**:

```swift
// AppState.swift の updateUserCredentials など
func updateUserCredentials(_ credentials: UserCredentials) {
    // ... 既存の処理 ...
    
    // MixpanelにユーザーIDを紐付け
    identifyUser(credentials.userId)
}
```

**サインアウト時**: Mixpanel側の distinct_id を明示的にクリアする運用は必須ではない（要件に応じて設計）。

---

## 6. クライアントイベント設計（RevenueCatだけでは足りない分）

### 6.1 イベント命名規則

- すべて英小文字＋スネークケース
- 例:
  - `onboarding_step_completed`
  - `paywall_shown`
  - `voice_session_started`
  - `voice_session_ended`

### 6.2 AnalyticsService ラッパー作成（Mixpanel）

**新規ファイル**: `aniccaios/aniccaios/Services/AnalyticsService.swift`

```swift
import Mixpanel

class AnalyticsService {
    static let shared = AnalyticsService()
    
    private init() {}
    
    func track(_ eventName: String, properties: [String: Any]? = nil) {
        Mixpanel.mainInstance().track(event: eventName, properties: properties)
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

## 7. Mixpanel 側でのダッシュボード構築

### 7.1 オンボーディングファネル

1. Mixpanel → **Funnels**
2. イベントを順番に追加:
   - `onboarding_step_completed` (step = welcome)
   - `onboarding_step_completed` (step = account)
   - `onboarding_step_completed` (step = habit_setup)
   - `onboarding_step_completed` (step = paywall)
   - `onboarding_step_completed` (step = completion)
3. どのステップで落ちているかを可視化

### 7.2 課金ファネル

1. Mixpanel → **Funnels**
2. イベントを順番に追加:
   - `paywall_shown`（クライアントイベント）
   - `trial_started`（RevenueCat経由）
   - `initial_purchase`（RevenueCat経由）
3. 「ペイウォールを見た人のうち何%がトライアル→課金に至るか」を見る

### 7.3 セッション利用状況

1. Mixpanel → **Insights**
2. イベント: `voice_session_started`
3. 日次/週次で推移を見る

---

## 8. テスト & 検証

### 8.1 クライアントイベント確認

1. 開発環境で:
   - 仮ユーザー1人でオンボーディング→ペイウォール→セッションを1周する
2. Mixpanel の Live View（またはイベント一覧）でイベントが届いているか確認

### 8.2 RevenueCat連携確認

1. Sandbox環境でテスト課金を1件発生させる
2. 数分後、Mixpanelのイベント一覧で確認:
   - RevenueCatイベントが届いている
   - distinct_id が `user-id` と一致している

---

## 9. 成果物チェックリスト

- [ ] Mixpanelプロジェクトが作成され、Tokenが管理されている
- [ ] RevenueCat → Mixpanel連携が有効で、RCイベントが届いている
- [ ] iOSクライアントから`onboarding_step_completed` / `paywall_shown` / `voice_session_started` / `voice_session_ended`が送信されている
- [ ] ユーザーIDがRevenueCat / Mixpanel / Backendで揃っている
- [ ] オンボーディング・課金・セッションのファネルがMixpanelで見える

---

## 10. 参考リンク

- [RevenueCat Mixpanel統合ガイド](https://www.revenuecat.com/docs/integrations/third-party-integrations/mixpanel)
- [RevenueCat 対応インテグレーション一覧](https://www.revenuecat.com/docs/integrations/third-party-integrations/supported-integrations-index)
- [Mixpanel Swift SDK](https://github.com/mixpanel/mixpanel-swift)

---

## 11. トラブルシューティング

### イベントが届かない

- MixpanelのLive View/イベント一覧で確認
- Tokenが正しく設定されているか確認
- ネットワーク接続を確認

### ユーザーIDが一致しない

- RevenueCatダッシュボードで`App User ID`を確認
- Mixpanelのイベント詳細で distinct_id を確認
- クライアント側で`identify(...)`が正しく呼ばれているか確認

