# App Store Connect 設定と課金機能実装計画

## 現状確認

- Bundle ID: `ai.anicca.app.ios`
- Development Team: `S5U8UH3JLJ`
- バージョン: `1.0.0` (Build `1`)
- RevenueCat SDK は追加済みだが実装コードなし
- App Store Connect でアプリ未作成

## フェーズ1: App Store Connect でのアプリ作成と基本設定

### 1.1 App Store Connect でアプリを作成

- App Store Connect にログイン
- 「マイ App」→「+」→「新しい App」をクリック
- 以下を入力：
- プラットフォーム: iOS
- 名前: Anicca（または希望の名前）
- プライマリ言語: 日本語
- Bundle ID: `ai.anicca.app.ios`（既存を選択、なければ作成）
- SKU: `anicca-ios-001`（任意のユニークID）
- 「作成」をクリック

### 1.2 App Information の設定

- 「App Information」セクションで以下を設定：
- カテゴリ: ヘルスケア/フィットネス（既に Info.plist に設定済み）
- プライバシーポリシー URL: `apps/landing/app/privacy/page.tsx` の URL を確認して設定
- サポート URL: 同様に設定

### 1.3 App Privacy の設定

- 「App Privacy」セクションでデータ収集内容を設定：
- 収集データ: 名前、メールアドレス、音声データ、使用状況データ
- 利用目的: アプリ機能の提供、分析、マーケティング
- 第三者共有: 必要に応じて設定

## フェーズ2: 課金機能の実装（RevenueCat + StoreKit）

### 2.1 RevenueCat ダッシュボードでの設定

- RevenueCat アカウント作成（未作成の場合）
- プロジェクト作成: Anicca iOS
- App Store Connect と連携（API キー取得）
- Product 作成:
- Product ID: `anicca_pro_monthly`（例）
- Type: Subscription
- Duration: 1 month
- Offering 作成: `default` Offering に上記 Product を追加

### 2.2 iOS アプリ側の実装

- `Services/BillingService.swift` を新規作成：
- RevenueCat SDK の初期化（`Purchases.configure`）
- 購読状態の監視（`Purchases.shared.customerInfo`）
- 購読開始処理（`Purchases.shared.purchase(package:)`）
- 購読復元処理（`Purchases.shared.restorePurchases()`）
- `AppDelegate` で RevenueCat を初期化
- `AppState` に購読状態を追加（`subscriptionStatus: free/pro/grace`）
- ペイウォール UI コンポーネント作成（`Onboarding/TrialPaywallView.swift`）

### 2.3 バックエンド連携（必要に応じて）

- `apps/api` で RevenueCat Webhook を受信
- 購読状態を Supabase の `user_subscriptions` テーブルと同期

## フェーズ3: TestFlight 準備

### 3.1 アーカイブとアップロード

- Xcode で Product → Archive
- Organizer ウィンドウで「Distribute App」→「App Store Connect」→「Upload」
- アップロード完了を待つ（数分〜数十分）

### 3.2 TestFlight 内部テスト設定

- App Store Connect → TestFlight タブ
- アップロードしたビルドを選択
- 「Internal Testing」セクションで設定：
- What to Test: 50-80文字でテスト観点を記述
- テスト手順: 箇条書きで3項目程度
- 内部テスター（チームメンバー）に配布

### 3.3 TestFlight 外部テスト設定（オプション）

- 「External Testing」セクションで外部テスターグループ作成
- テスト情報と審査用質問に回答
- Apple の外部審査を待つ（1-2日）

## フェーズ4: App Store 審査準備

### 4.1 メタデータ準備

- アプリ説明文: 200文字程度
- キーワード: カンマ区切りで10語程度
- スクリーンショット: iPhone 6.7″ / 6.5″ / 5.5″ の PNG
- プライバシーポリシー URL・サポート URL の最終確認

### 4.2 Version Information 設定

- リリースノート: 初回リリースの内容
- Review Notes: Time Sensitive 通知の利用理由と再現手順を明記
- テストアカウント情報（必要に応じて）

### 4.3 審査提出

- 「Submit for Review」をクリック
- エクスポートコンプライアンスの質問に回答
- 審査提出を完了

## フェーズ5: 公開と確認

### 5.1 審査通過後の公開

- 審査通過の通知を確認
- 公開方法を選択（自動公開 or 手動公開）
- App Store でアプリが表示されることを確認

### 5.2 公開後の確認

- App Store でアプリが公開されているか確認
- ダウンロードリンクが正しく動作するか確認
- バージョン情報が正しく表示されているか確認

## 必要なファイル作成・更新

1. `aniccaios/aniccaios/Services/BillingService.swift`（新規）
2. `aniccaios/aniccaios/Onboarding/TrialPaywallView.swift`（新規）
3. `aniccaios/aniccaios/AppDelegate.swift`（RevenueCat 初期化を追加）
4. `aniccaios/aniccaios/AppState.swift`（購読状態を追加）
5. `docs/Launch.md`（進捗を更新）

## 注意事項

- App Store Connect での設定は一度に完了する必要はなく、段階的に進められる
- 課金機能は TestFlight 内部テストで十分に検証してから外部テスト・本番リリースに進む
- RevenueCat の API キーは環境変数や Config ファイルで管理し、コミットしない
- プライバシーポリシーとサポート URL は実際にアクセス可能な URL を設定する