# Anicca ペイウォール最適化指示書（RevenueCat Paywalls）

## 概要

- **目的**: Aniccaのペイウォール画面を継続的に改善/A/Bテストし、サブスクリプションのコンバージョン率を上げる
- **採用ツール**: RevenueCat Paywalls機能（既存のRevenueCat SDKの延長で使用可能）
- **対象**: iOSクライアント（`aniccaios/`）とRevenueCatダッシュボード

---

## 1. 採用ツールと方針決定

### 1.1 RevenueCat Paywalls を採用する理由

- ✅ **追加SDKコストが小さい**: 既にRevenueCat SDKを使用しているため
- ✅ **ダッシュボードで管理**: コード変更なしでテンプレート編集や実験の切り替えが可能
- ✅ **A/Bテスト機能**: RevenueCatが提供する範囲でA/Bテストが可能

### 1.2 Superwall は導入しない

- **理由**: 現フェーズでは不要
- **将来**: もっと細かいセグメントや複雑なフローが必要になった段階で再検討

---

## 2. ゴール

- コード側は「どのPaywall IDを表示するか」を決めるだけに近づける
- RevenueCatダッシュボード上で:
  - 複数パターンのペイウォール（文言・レイアウト）の管理
  - A/B比較（現状のRevenueCatが提供する範囲で）
  ができる状態にする

---

## 3. 現状の把握

### 3.1 既存ペイウォールの確認

以下のファイルを確認:

- `aniccaios/aniccaios/Views/SubscriptionRequiredView.swift`
- `aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift`
- `aniccaios/aniccaios/Services/SubscriptionManager.swift`

**確認項目**:
- 現在のペイウォール表示ロジック
- どのタイミングでペイウォールが表示されるか
- 現在のデザイン・コピー

### 3.2 現在のフロー整理

| タイミング | 表示場所 | 現在のコピー | メモ |
|-----------|----------|-------------|------|
| オンボーディング後 | `SubscriptionRequiredView` | [現在の値] | |
| 設定画面から | `ManageSubscriptionSheet` | [現在の値] | |
| 利用量上限到達時 | `SubscriptionRequiredView` | [現在の値] | |

---

## 4. RevenueCat Paywalls 機能の準備

### 4.1 RevenueCatダッシュボードでの確認

1. [RevenueCatダッシュボード](https://app.revenuecat.com/)にログイン
2. プロジェクト選択 → **Paywalls** または **Offerings** を確認
3. RevenueCat Paywalls機能が有効か確認

### 4.2 最初のPaywallテンプレート作成

1. RevenueCatダッシュボード → **Paywalls** → **Create Paywall**
2. 基本設定:
   - **Paywall ID**: `default_onboarding_paywall`
   - **Name**: `Default Onboarding Paywall`
   - **Platform**: iOS

3. **Offering / Package設定**:
   - 既存のOfferingを選択（例: `default`）
   - 表示するPackageを選択（月額・年額など）

4. **デザイン設定**:
   - テンプレートを選択（RevenueCatが提供するテンプレートから）
   - カスタマイズ:
     - タイトル: 「Anicca Pro」
     - サブコピー: 「AIコーチと毎日話して、生活リズムを整える」
     - CTAボタン文言: 「無料トライアルを開始」
     - プラン比較セクション: 有効化

5. **保存**

### 4.3 追加Paywallテンプレート作成

以下のPaywallも作成:

| Paywall ID | 用途 | メモ |
|------------|------|------|
| `habit_wake_focused_paywall` | 起床習慣訴求 | オンボで起床習慣を選んだユーザー向け |
| `quota_hold_paywall` | 利用量上限到達時 | 利用量上限に達したユーザー向け |

---

## 5. iOSクライアントでの実装

### 5.1 RevenueCat Paywalls SDK確認

RevenueCat iOS SDKにPaywalls機能が含まれているか確認:

- バージョン: RevenueCat SDK v4.0.0以上推奨
- ドキュメント: [RevenueCat Paywalls iOS](https://www.revenuecat.com/docs/paywalls)

### 5.2 Paywall表示の実装

**方針**: 既存の`SubscriptionRequiredView`を、RevenueCat Paywallsで置き換える or 包む

**実装例**:

```swift
// SubscriptionRequiredView.swift
import RevenueCat

struct SubscriptionRequiredView: View {
    @StateObject private var paywallViewModel = PaywallViewModel()
    let source: PaywallSource
    
    var body: some View {
        // RevenueCat Paywallを表示
        PaywallView(
            paywallId: paywallIdForSource(source),
            onPurchase: { package in
                // 購入処理
                Task {
                    await purchasePackage(package)
                }
            },
            onRestore: {
                // 復元処理
                Task {
                    await restorePurchases()
                }
            },
            onDismiss: {
                // 閉じる処理
                dismiss()
            }
        )
    }
    
    private func paywallIdForSource(_ source: PaywallSource) -> String {
        switch source {
        case .onboarding:
            return "default_onboarding_paywall"
        case .quotaHold:
            return "quota_hold_paywall"
        case .settings:
            return "default_onboarding_paywall" // または専用のPaywall
        }
    }
    
    private func purchasePackage(_ package: Package) async {
        do {
            let (transaction, customerInfo) = try await RevenueCat.shared.purchase(package: package)
            // 購入成功
            SubscriptionManager.shared.syncNow()
            dismiss()
        } catch {
            // エラーハンドリング
            print("Purchase failed: \(error)")
        }
    }
    
    private func restorePurchases() async {
        do {
            let customerInfo = try await RevenueCat.shared.restorePurchases()
            SubscriptionManager.shared.syncNow()
            dismiss()
        } catch {
            print("Restore failed: \(error)")
        }
    }
}
```

**注意**: 実際のRevenueCat Paywalls APIは、最新のドキュメントを参照すること。

### 5.3 PaywallViewModel作成（オプション）

より複雑なロジックが必要な場合:

```swift
// PaywallViewModel.swift
import RevenueCat
import Combine

class PaywallViewModel: ObservableObject {
    @Published var paywall: Paywall?
    @Published var isLoading = false
    @Published var error: Error?
    
    func loadPaywall(id: String) {
        isLoading = true
        RevenueCat.shared.getPaywall(id: id) { [weak self] paywall, error in
            DispatchQueue.main.async {
                self?.isLoading = false
                if let error = error {
                    self?.error = error
                } else {
                    self?.paywall = paywall
                }
            }
        }
    }
}
```

---

## 6. ペイウォールパターン A/B/C の設計

### 6.1 パターン定義

RevenueCat側で以下のバリエーションを作成:

| Paywall ID | 訴求 | コピー例 | メモ |
|------------|------|---------|------|
| `default_onboarding_paywall_v1` | 現行デザイン | [現在のコピー] | ベースライン |
| `default_onboarding_paywall_v2` | 年額プラン推し | 「年額プランなら◯%お得」 | |
| `default_onboarding_paywall_v3` | ベネフィット強調 | 「夜更かしから抜け出す」 | |

### 6.2 コード側での切り替えロジック

**方針**: アプリ内では「論理名」から「Paywall ID」へのマッピングだけを持つ

```swift
// PaywallConfig.swift
struct PaywallConfig {
    enum Context {
        case onboardingDefault
        case quotaHold
        case settings
    }
    
    static func paywallId(for context: Context) -> String {
        // 現在有効なPaywall IDを返す
        // 実験の切り替えは原則としてRevenueCat側の設定変更で完結
        switch context {
        case .onboardingDefault:
            return "default_onboarding_paywall_v2" // 現在有効なバージョン
        case .quotaHold:
            return "quota_hold_paywall"
        case .settings:
            return "default_onboarding_paywall_v2"
        }
    }
}
```

**実験の切り替え**:
- 原則として **RevenueCat側の設定変更で完結**（コード変更不要）
- ただし、大きな変更（新しいPaywall IDの追加など）はコード更新が必要

---

## 7. 計測と分析

### 7.1 RevenueCatダッシュボードでの確認

RevenueCatダッシュボード → **Analytics** → **Paywalls** で確認:

| 指標 | Paywall ID | 値 | メモ |
|------|-----------|-----|------|
| 表示回数 | `default_onboarding_paywall_v1` | [数値] | |
| 購読開始率 | `default_onboarding_paywall_v1` | [%] | |
| トライアル開始率 | `default_onboarding_paywall_v1` | [%] | |
| プラン別内訳 | `default_onboarding_paywall_v1` | [数値] | 月額/年額 |

### 7.2 Amplitude連携（Step2と連動）

Step2で導入したAmplitudeと組み合わせ:

- `paywall_shown`イベントのプロパティに`paywall_id` or `paywall_variant`を持たせる
- ファネル分析（例: `paywall_shown` → RevenueCat `initial_purchase`）に活用

**実装例**:

```swift
// SubscriptionRequiredView.swift
.onAppear {
    AnalyticsService.shared.track("paywall_shown", properties: [
        "source": source.rawValue,
        "paywall_id": paywallIdForSource(source),
        "paywall_variant": PaywallConfig.paywallId(for: .onboardingDefault)
    ])
}
```

---

## 8. A/Bテストの実施

### 8.1 RevenueCatでのA/Bテスト設定

RevenueCatが提供するA/Bテスト機能を使用:

1. RevenueCatダッシュボード → **Experiments** → **Create Experiment**
2. 実験名: `Onboarding Paywall Test v1`
3. 対象Paywall: `default_onboarding_paywall`
4. Variant設定:
   - Variant A: `default_onboarding_paywall_v1`（ベースライン）
   - Variant B: `default_onboarding_paywall_v2`
   - Variant C: `default_onboarding_paywall_v3`（オプション）
5. 配信比率: 50:50（または33:33:34）
6. 開始

### 8.2 結果の判定

- **期間**: 少なくとも2〜4週間
- **指標**: 購読開始率、トライアル開始率
- **判定**: 統計的に有意な差が出たら、勝ちパターンを採用

---

## 9. 継続的な改善サイクル

### 9.1 月次レビュー

- 毎月1回、Paywallのパフォーマンスをレビュー
- 新しい仮説を立てて、次のA/Bテストを計画

### 9.2 データドリブンな判断

- RevenueCat Analyticsのデータを見ながら、仮説を立てる
- Step2（Amplitude）のデータも参照し、「どのユーザーがコンバージョンしているか」を分析

### 9.3 ドキュメント化

- `.cursor/plans/paywall-history.md` に以下を記録:
  - テストしたPaywallパターン
  - 結果（コンバージョン率）
  - 勝った理由の仮説
  - 次回の改善案

---

## 10. 成果物チェックリスト

- [ ] RevenueCatダッシュボードでPaywallテンプレートが1つ以上作成されている
- [ ] iOSクライアントからRevenueCat Paywallsが表示されている
- [ ] 複数パターンのPaywall（A/B/C）が定義されている
- [ ] RevenueCat AnalyticsでPaywallのパフォーマンスが確認できる
- [ ] Amplitude連携で`paywall_shown`イベントに`paywall_id`が含まれている
- [ ] A/Bテストが1つ以上実施されている

---

## 11. 参考リンク

- [RevenueCat Paywalls ドキュメント](https://www.revenuecat.com/docs/paywalls)
- [RevenueCat Paywalls iOS SDK](https://www.revenuecat.com/docs/paywalls/ios)
- [RevenueCat Analytics ガイド](https://www.revenuecat.com/docs/analytics)

---

## 12. トラブルシューティング

### Paywallが表示されない

- RevenueCatダッシュボードでPaywall IDが正しいか確認
- iOS SDKのバージョンが最新か確認
- ネットワーク接続を確認

### 購入が完了しない

- StoreKitの設定を確認
- Sandbox環境でテストアカウントが正しく設定されているか確認
- RevenueCatのログを確認

### A/Bテストの結果に差が出ない

- テスト期間を延長（4週間以上）
- より大きく異なるパターンで再テスト
- サンプルサイズが十分か確認

