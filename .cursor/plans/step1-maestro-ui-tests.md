# Anicca iOS UI自動テスト導入指示書（Maestro）

## 概要

- **目的**: Anicca iOSアプリの主要ユーザーフロー（オンボーディング・音声セッション・課金）を、Maestroを用いたE2E UIテストで自動化し、ローカルとCIで常時回せるようにする。
- **対象プロジェクト**: `aniccaios/aniccaios.xcodeproj`
- **技術スタック**: SwiftUI + RevenueCat + WebRTC

---

## 1. 採用ツールと選定理由

### 1.1 採用ツール: Maestro (mobile.dev)

**Maestroとは**:
- YAMLベースのE2E UIテストフレームワーク
- iOSシミュレータ上でアプリを起動し、「画面をタップ・テキストを入力・画面に表示されているか確認」といった操作を記述可能
- CLIベースでCIとの相性が良い

**選定理由**:
- XCUITestは公式だが、Swiftコードで細かく書く必要があり初期投資が重い
- 今回は「黒箱E2E」のみを対象とし、Maestroで十分と判断
- 将来Android対応時も同じ記法を流用可能

### 1.2 他候補との比較

| ツール | メリット | デメリット | 採用判断 |
|--------|----------|------------|----------|
| **Maestro** | YAMLで簡単、クロスプラットフォーム対応 | iOS実機未対応（シミュレータのみ） | ✅ **採用** |
| XCUITest | Apple公式、強力 | Swiftコードで記述、実装コスト高 | 将来のUI単体テストで検討 |
| Appium | クロスプラットフォーム | セットアップが重い | 今回は不要 |

---

## 2. 対象フロー定義

この指示書で必ず自動化すべきフロー:

1. **オンボーディング完走**
   - 初回起動 → 全オンボステップ完了 → ホーム/メイン画面表示

2. **音声セッション開始/終了**
   - 既存ユーザー状態で起動 → 「セッション開始」ボタン → 接続中表示 → セッション終了 → ホームに戻る

3. **ペイウォール & サブスク (Sandbox)**
   - ペイウォール表示 → トライアル/購読開始 → アプリが「サブスク有効」状態を認識

---

## 3. リポジトリ構造と命名規則

### 3.1 Maestro用ディレクトリ

プロジェクトルートに `maestro/` ディレクトリを作成:

```
anicca-project/
  maestro/
    01-onboarding.yml
    02-session-start.yml
    03-paywall-subscription.yml
    README.md (簡易説明)
```

**命名規則**:
- `NN-description.yml` 形式（`NN`は2桁の連番）
- 1ファイル = 1シナリオが原則

### 3.2 バンドルID確認

iOSアプリのバンドルIDをXcodeで確認:
- Xcode → `aniccaios.xcodeproj` → Target `aniccaios` → General → Bundle Identifier
- 以降、この値を `BUNDLE_ID` として記載（例: `com.anicca.ios`）

---

## 4. Maestro セットアップ手順

### 4.1 CLIインストール（ローカル）

```bash
# Homebrewでインストール
brew tap mobile-dev-inc/tap
brew install maestro

# バージョン確認
maestro --version
```

### 4.2 プロジェクトに `maestro/` ディレクトリ追加

```bash
cd /Users/cbns03/Downloads/anicca-project
mkdir -p maestro
```

---

## 5. アプリ側の準備（Accessibility Identifier）

Maestroはテキストマッチでも操作できるが、UI文言変更に強いように、**重要UIには`accessibilityIdentifier`を付与**する。

### 5.1 付与すべき要素一覧

| 画面/機能 | 要素 | Identifier名 |
|-----------|------|--------------|
| オンボーディング | 「次へ」ボタン | `onboarding_next_button` |
| オンボーディング | 「スキップ」ボタン | `onboarding_skip_button` |
| オンボーディング | 「完了」ボタン | `onboarding_done_button` |
| 音声セッション | 「セッション開始」ボタン | `start_session_button` |
| 音声セッション | 「終了」ボタン | `end_session_button` |
| ペイウォール | メインCTAボタン | `paywall_primary_cta_button` |
| ペイウォール | 「復元」ボタン | `paywall_restore_button` |
| ペイウォール | 閉じるボタン | `paywall_close_button` |

### 5.2 実装例（SwiftUI）

```swift
// 例: OnboardingFlowView.swift
Button("次へ") {
    viewModel.next()
}
.accessibilityIdentifier("onboarding_next_button")
```

**命名規則**: 英小文字＋スネークケース

### 5.3 実装箇所の確認

以下のファイルを確認し、必要に応じてIdentifierを追加:

- `aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift`
- `aniccaios/aniccaios/VoiceSessionController.swift` (UI部分)
- `aniccaios/aniccaios/Views/SubscriptionRequiredView.swift`
- `aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift`

---

## 6. Maestro YAMLシナリオ設計

### 6.1 共通構造

各YAMLファイルの基本形:

```yaml
appId: BUNDLE_ID
name: Scenario Name
env:
  # 必要なら環境変数
---
# ここからステップ
- launchApp
- tapOn:
    id: button_identifier
- assertVisible:
    id: expected_element
```

### 6.2 シナリオ1: オンボーディング完走

**ファイル**: `maestro/01-onboarding.yml`

**要件**:
- アプリを「初回起動状態」にする
- 全オンボステップを通過して、ホーム画面が出ていることを確認
- マイク・通知ダイアログは「許可」を選ぶ

**YAML例**:

```yaml
appId: com.anicca.ios
name: Onboarding flow

---
- deleteApp
- launchApp

# 権限ダイアログ（出た場合のみ）
- tapOn:
    text: "許可"
    optional: true

# オンボーディング各ステップ
- tapOn:
    id: onboarding_next_button
- tapOn:
    id: onboarding_next_button
# ... 必要な回数繰り返し ...

# 最終ステップ「完了」
- tapOn:
    id: onboarding_done_button

# ホーム画面確認
- assertVisible:
    id: start_session_button
```

**注意**: 実際の画面構造はアプリを起動して確認し、必要に応じて修正すること。

### 6.3 シナリオ2: セッション開始/終了

**ファイル**: `maestro/02-session-start.yml`

**要件**:
- 既存ログイン済みユーザー状態からスタート
- 「セッション開始」ボタンタップ → 接続状態表示 → 「終了」ボタンタップ → 正常にホームへ戻る

**YAML例**:

```yaml
appId: com.anicca.ios
name: Voice session basic flow

---
- launchApp

# セッション開始
- tapOn:
    id: start_session_button

- assertVisible:
    text: "接続中"
    timeout: 5000

# セッション終了
- tapOn:
    id: end_session_button

- assertVisible:
    id: start_session_button
```

### 6.4 シナリオ3: ペイウォール & サブスク

**ファイル**: `maestro/03-paywall-subscription.yml`

**要件**:
- SandboxテストアカウントでStoreKit購読フローを通す
- 成功後、アプリが「サブスク有効」状態になっていることを確認

**注意**:
- Sandbox Apple IDのログインは手動でシミュレータに設定しておく
- MaestroからはStoreKitダイアログの「続ける」「購入」ボタンをテキストでタップ

**YAML例**:

```yaml
appId: com.anicca.ios
name: Paywall subscription

---
- launchApp

# ペイウォールを開く操作
- tapOn:
    id: open_paywall_button

- assertVisible:
    id: paywall_primary_cta_button

- tapOn:
    id: paywall_primary_cta_button

# StoreKit ダイアログ処理
- tapOn:
    text: "続ける"
- tapOn:
    text: "購入"
    optional: true

# サブスク有効状態確認
- assertVisible:
    text: "サブスクリプション有効"
    timeout: 10000
```

---

## 7. 実行スクリプト & CI連携

### 7.1 ローカル実行スクリプト

**ファイル**: `scripts/run-maestro-e2e.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# 必要に応じてビルド（スキーム名・デバイス名は実アプリに合わせる）
# xcodebuild -scheme aniccaios -destination 'platform=iOS Simulator,name=iPhone 15' build

# Maestroテスト実行
maestro test maestro/

echo "✅ All Maestro tests passed"
```

**実行権限付与**:
```bash
chmod +x scripts/run-maestro-e2e.sh
```

### 7.2 CI（GitHub Actions）設定

**ファイル**: `.github/workflows/maestro-e2e.yml`

```yaml
name: Maestro E2E Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  maestro-tests:
    runs-on: macos-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Xcode
        uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: latest-stable
      
      - name: Install Maestro
        run: |
          brew tap mobile-dev-inc/tap
          brew install maestro
      
      - name: List available simulators
        run: xcrun simctl list devices available
      
      - name: Build app
        run: |
          xcodebuild -scheme aniccaios \
            -destination 'platform=iOS Simulator,name=iPhone 15' \
            -derivedDataPath ./build \
            build
      
      - name: Run Maestro tests
        run: |
          maestro test maestro/
```

---

## 8. テスト & 検証

### 8.1 ローカル検証

```bash
# 個別シナリオ実行
maestro test maestro/01-onboarding.yml

# 全シナリオ実行
maestro test maestro/

# スクリプト経由
./scripts/run-maestro-e2e.sh
```

### 8.2 CI検証

1. テスト用ブランチでworkflowを動かし、成功を確認
2. わざとIdentifierを壊してCIが落ちることを確認（ガードとして機能するか）

---

## 9. 運用ルール

### 9.1 新しいフロー追加時

- 新しい重要フローを追加したら、Maestroシナリオも追加する
- 命名規則に従い、`maestro/NN-new-feature.yml` 形式で追加

### 9.2 既存フロー変更時

- 既存フローを大きく変えたPRでは、E2Eの更新を必須にする
- CIが赤くなったら、まずMaestroログとスクショを確認

### 9.3 メンテナンス

- 定期的に（月1回程度）全シナリオをローカルで実行し、動作確認
- アプリのUI変更に合わせて、Identifierやアサーションを更新

---

## 10. 成果物チェックリスト

- [ ] `maestro/` ディレクトリが存在し、少なくとも3本のシナリオYAMLがある
- [ ] 重要なボタンに`accessibilityIdentifier`が付与されている
- [ ] `scripts/run-maestro-e2e.sh`が存在し、ローカルで実行できる
- [ ] GitHub Actions（または同等のCI）でMaestro E2Eが実行されている
- [ ] 上記手順が簡単に追える簡易ドキュメントが残っている

---

## 11. 参考リンク

- [Maestro公式ドキュメント](https://maestro.mobile.dev/)
- [Maestro GitHub](https://github.com/mobile-dev-inc/maestro)
- [Maestro YAML構文リファレンス](https://maestro.mobile.dev/reference)

---

## 12. トラブルシューティング

### シミュレータが見つからない

```bash
# 利用可能なシミュレータ一覧
xcrun simctl list devices available

# 特定のシミュレータを起動
xcrun simctl boot "iPhone 15"
```

### アプリがインストールされない

- Xcodeで手動ビルド&インストールを試し、エラーを確認
- 証明書やプロビジョニングプロファイルの問題の可能性

### 要素が見つからない

- `maestro --debug` で詳細ログを確認
- アプリ側でIdentifierが正しく設定されているか確認
- テキストマッチの場合は、実際のUI文言と完全一致しているか確認

