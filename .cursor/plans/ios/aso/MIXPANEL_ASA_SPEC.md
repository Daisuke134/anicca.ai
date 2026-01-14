# Mixpanel ASA連携 仕様書

**作成日**: 2025-01-14
**目的**: Jake Mor #51「どのキーワードが課金ユーザーを連れてくるか追跡」

---

## 概要

Apple Search Ads (ASA) からのインストールを追跡し、どのキーワード経由のユーザーが課金するかをMixpanelで分析可能にする。

---

## As Is（現状）

### iOSアプリ (`aniccaios/`)

| 項目 | 状態 |
|------|------|
| Mixpanel SDK | ✅ 導入済み (`AnalyticsManager.swift`) |
| AdServices Framework | ❌ 未導入 |
| ASA Attribution取得 | ❌ 未実装 |
| キーワード追跡 | ❌ 未実装 |

### 現在のAnalyticsManager.swift

```swift
// 既存の機能
- configure() // Mixpanel初期化
- identify(userId:) // ユーザー識別
- setUserProperties(_:) // ユーザープロパティ設定
- track(_:properties:) // イベント追跡
- trackTrialStarted(productId:) // トライアル開始追跡
- trackPurchaseCompleted(productId:revenue:) // 購入完了追跡
```

---

## To Be（目標）

### iOSアプリ (`aniccaios/`)

| 項目 | 状態 |
|------|------|
| Mixpanel SDK | ✅ 導入済み |
| AdServices Framework | ✅ 追加 |
| ASA Attribution取得 | ✅ アプリ初回起動時に取得 |
| キーワード追跡 | ✅ Mixpanelユーザープロパティに設定 |

### 追跡するデータ

Mixpanelユーザープロパティとして以下を設定：

| プロパティ名 | 値 | 説明 |
|-------------|-----|------|
| `asa_attribution` | `true`/`false` | ASA経由かどうか |
| `asa_campaign_id` | `542370539` | キャンペーンID |
| `asa_ad_group_id` | `542317095` | 広告グループID |
| `asa_keyword_id` | `87675432` | キーワードID（重要！） |
| `asa_country` | `US` | 国/地域 |
| `asa_conversion_type` | `Download` | コンバージョンタイプ |
| `asa_claim_type` | `Click`/`Impression` | クリック or 表示 |

---

## 実装詳細

### 1. AdServicesフレームワーク追加

**ファイル**: `aniccaios/aniccaios.xcodeproj/project.pbxproj`

Xcodeで以下を実行：
1. プロジェクト設定 → General → Frameworks, Libraries, and Embedded Content
2. 「+」ボタン → 「AdServices.framework」を追加

### 2. 新規ファイル作成

**ファイル**: `aniccaios/aniccaios/Services/ASAAttributionManager.swift`

```swift
import Foundation
import AdServices
import OSLog

/// Apple Search Ads Attribution Manager
/// Jake Mor #51: "Send keyword attribution to Mixpanel"
@MainActor
final class ASAAttributionManager {
    static let shared = ASAAttributionManager()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "ASAAttribution")

    private let hasCheckedKey = "asa_attribution_checked"

    private init() {}

    /// 初回起動時にASAアトリビューションを取得してMixpanelに送信
    /// AppDelegate.didFinishLaunchingWithOptionsから呼び出す
    func fetchAttributionIfNeeded() async {
        // 既にチェック済みなら何もしない（初回のみ実行）
        guard !UserDefaults.standard.bool(forKey: hasCheckedKey) else {
            logger.debug("ASA attribution already checked, skipping")
            return
        }

        // チェック済みフラグを立てる（次回以降スキップ）
        UserDefaults.standard.set(true, forKey: hasCheckedKey)

        do {
            // Step 1: AdServicesからトークンを取得
            let token = try AAAttribution.attributionToken()
            logger.info("ASA attribution token obtained")

            // Step 2: AppleのAPIにトークンを送信してattribution情報を取得
            let attribution = try await fetchAttributionData(token: token)

            // Step 3: Mixpanelにユーザープロパティとして設定
            await setMixpanelProperties(attribution: attribution)

        } catch {
            // ASA経由でないインストール（Organic）の場合はエラーになる
            // これは正常な挙動なのでdebugログのみ
            logger.debug("ASA attribution not available: \(error.localizedDescription)")

            // Organicインストールとしてマーク
            await AnalyticsManager.shared.setUserProperty("asa_attribution", value: false)
        }
    }

    /// AppleのAttribution APIにトークンを送信
    private func fetchAttributionData(token: String) async throws -> ASAAttributionData {
        let url = URL(string: "https://api-adservices.apple.com/api/v1/")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("text/plain", forHTTPHeaderField: "Content-Type")
        request.httpBody = token.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw ASAError.invalidResponse
        }

        let attribution = try JSONDecoder().decode(ASAAttributionData.self, from: data)
        logger.info("ASA attribution data received: campaign=\(attribution.campaignId ?? 0), keyword=\(attribution.keywordId ?? 0)")

        return attribution
    }

    /// Mixpanelにattributionデータを設定
    private func setMixpanelProperties(attribution: ASAAttributionData) async {
        var properties: [String: MixpanelType] = [
            "asa_attribution": attribution.attribution
        ]

        if let campaignId = attribution.campaignId {
            properties["asa_campaign_id"] = campaignId
        }
        if let adGroupId = attribution.adGroupId {
            properties["asa_ad_group_id"] = adGroupId
        }
        if let keywordId = attribution.keywordId {
            properties["asa_keyword_id"] = keywordId
        }
        if let countryOrRegion = attribution.countryOrRegion {
            properties["asa_country"] = countryOrRegion
        }
        if let conversionType = attribution.conversionType {
            properties["asa_conversion_type"] = conversionType
        }
        if let claimType = attribution.claimType {
            properties["asa_claim_type"] = claimType
        }
        if let adId = attribution.adId {
            properties["asa_ad_id"] = adId
        }

        AnalyticsManager.shared.setUserProperties(properties)
        logger.info("ASA attribution properties set in Mixpanel")
    }
}

// MARK: - Data Models

struct ASAAttributionData: Codable {
    let attribution: Bool
    let orgId: Int?
    let campaignId: Int?
    let conversionType: String?
    let clickDate: String?
    let impressionDate: String?
    let claimType: String?
    let adGroupId: Int?
    let countryOrRegion: String?
    let keywordId: Int?
    let adId: Int?
}

enum ASAError: Error {
    case invalidResponse
    case decodingFailed
}
```

### 3. AppDelegate.swift 修正

**ファイル**: `aniccaios/aniccaios/AppDelegate.swift`

```diff
 func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
     // ... 既存コード ...

     AnalyticsManager.shared.configure()
     AnalyticsManager.shared.track(.appOpened)
+
+    // ASA Attribution取得（初回起動時のみ）
+    Task {
+        await ASAAttributionManager.shared.fetchAttributionIfNeeded()
+    }

     SuperwallManager.shared.configure()

     // ... 既存コード ...
 }
```

### 4. AnalyticsManager.swift にimport追加

**ファイル**: `aniccaios/aniccaios/Services/AnalyticsManager.swift`

変更不要。既存の `setUserProperties` メソッドをそのまま使用。

---

## 完全なパッチ（差分）

### パッチ1: 新規ファイル作成

```bash
# ファイル作成
touch aniccaios/aniccaios/Services/ASAAttributionManager.swift
```

**内容**: 上記「2. 新規ファイル作成」のコード全体

### パッチ2: AppDelegate.swift

```diff
--- a/aniccaios/aniccaios/AppDelegate.swift
+++ b/aniccaios/aniccaios/AppDelegate.swift
@@ -27,6 +27,11 @@ class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDele
         SubscriptionManager.shared.configure()
         AnalyticsManager.shared.configure()
         AnalyticsManager.shared.track(.appOpened)
+
+        // ASA Attribution取得（初回起動時のみ）
+        Task {
+            await ASAAttributionManager.shared.fetchAttributionIfNeeded()
+        }
         SuperwallManager.shared.configure()

         // Phase-7: register BGTask handlers (must complete before launch ends).
```

### パッチ3: Xcodeプロジェクト設定（手動）

```
1. Xcode でプロジェクトを開く
2. ターゲット「aniccaios」を選択
3. General → Frameworks, Libraries, and Embedded Content
4. 「+」→「AdServices.framework」を追加
5. 新規ファイル「ASAAttributionManager.swift」をプロジェクトに追加
```

---

## Mixpanelでの分析方法

### ファネル分析

1. Mixpanel → Funnels
2. 以下のイベントでファネル作成：
   - `app_opened`
   - `onboarding_completed`
   - `paywall_viewed`
   - `trial_started`
   - `purchase_completed`
3. 「Breakdown by」→ `asa_keyword_id`

### キーワード→課金率レポート

1. Mixpanel → Insights
2. イベント: `purchase_completed`
3. Group by: `asa_keyword_id`
4. 14日後にこのレポートを見て、課金率の高いキーワードを特定

### ASAレポートとの突合

`asa_keyword_id` の数値は、ASAダッシュボードの「Keywords」タブでキーワード名と対応している。

---

## お前がやること（GUI設定）

### 必須
1. **Xcodeでプロジェクトを開く**
2. **AdServices.frameworkを追加**
   - ターゲット → General → Frameworks → 「+」 → AdServices
3. **新規ファイルをプロジェクトに追加**
   - `ASAAttributionManager.swift` を作成後、Xcodeのプロジェクトナビゲーターにドラッグ

### 確認事項
- Mixpanelのプロジェクトトークンは既に `Config.swift` にある → 追加設定不要

---

## テスト方法

### 開発中のテスト

1. アプリをアンインストール
2. TestFlightまたはデバイスにインストール
3. `UserDefaults.standard.bool(forKey: "asa_attribution_checked")` を確認
4. Mixpanelのユーザープロファイルで `asa_attribution` プロパティを確認

### 本番テスト

1. ASAキャンペーンが審査通過後
2. App Storeで広告からインストール
3. Mixpanelで `asa_attribution: true` のユーザーを確認
4. `asa_keyword_id` でフィルタリング

---

## 参考リンク

- [Apple AdServices Documentation](https://developer.apple.com/documentation/adservices/aaattribution/)
- [Jake Mor #51](https://twitter.com/jakemor): "Send keyword attribution to @Mixpanel"
- [Mixpanel User Properties](https://docs.mixpanel.com/docs/tracking/how-tos/user-profiles)
