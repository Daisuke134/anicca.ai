# 1.6.1 仕様書: Mixpanel + OpenClaw + オンボーディング + Paywall改善

**作成日**: 2026-02-04  
**ステータス**: 🔴 1.6.1 必須（全て実装するまでマージ禁止）

---

## 目次

1. [問題サマリー](#問題サマリー)
2. [Patch A: Mixpanelトラッキング修正](#patch-a-mixpanelトラッキング修正)
3. [Patch B: RevenueCat A/Bテスト設定（GUI）](#patch-b-revenuecat-abテスト設定gui)
4. [Patch C: OpenClaw日次メトリクス移行](#patch-c-openclaw日次メトリクス移行)
5. [Patch D: @Anicca Slackメンション応答](#patch-d-anicca-slackメンション応答)
6. [Patch E: オンボーディング改善](#patch-e-オンボーディング改善)
7. [アーキテクチャ図](#アーキテクチャ図)
8. [OpenClaw使用例](#openclaw使用例)

---

## 問題サマリー

| # | 問題 | 重大度 | 根本原因 | 解決方法 |
|---|------|--------|---------|---------|
| A-1 | `onboarding_paywall_purchased`が15件（虚偽） | 🔴 Critical | iOSクライアントサイドで発火、DEBUG/サンドボックス/開発者テスト含む | **このイベントを使わない。`rc_trial_started_event`を信頼** |
| A-2 | `rc_trial_started_event`が0件 | ✅ 正常 | **本番で誰もトライアル開始していない（正しいデータ）** | 修正不要。これが正しいデータ |
| A-3 | ファネルの整合性がない | 🟡 Medium | iOSの自前イベントとRevenueCatサーバーサイドイベントを混在 | RevenueCatイベントに統一 |
| B-1 | Paywall A/Bテストなし | 🟡 High | 未設定 | RevenueCat Experiments設定 |
| C-1 | GitHub Actionsで日次メトリクス | 🟡 Medium | OpenClawに移行したい | OpenClaw cron設定 |
| D-1 | @Aniccaメンション応答なし | 🟢 Low | 未実装 | Slack Bolt + OpenClaw |
| E-1 | オンボーディング変換率が低い（0%） | 🔴 Critical | Paywall到達後、誰もトライアル開始していない | Paywall改善 + A/Bテスト |

---

## 重要な発見: データの真実

### RevenueCat→Mixpanel統合の仕組み

RevenueCat公式ドキュメントより:
> **"Sends Sandbox Events: Requires Token"**
> サンドボックスイベントを送信するには**別のトークン**が必要。
> サンドボックストークンを設定しなければ、**本番トランザクションのみ**がMixpanelに送信される。

### 正しいデータソース

| イベント | ソース | 信頼性 | 説明 |
|---------|-------|-------|------|
| `rc_trial_started_event` | RevenueCat → Mixpanel（サーバーサイド） | ✅ **正確** | sandbox token未設定なら本番のみ |
| `onboarding_paywall_purchased` | iOS SDK（クライアントサイド） | ❌ **不正確** | DEBUG/サンドボックス/開発者テスト含む |

### 結論

**`rc_trial_started_event=1件（1ヶ月）` は正しいデータ。**

### 実データ（2026-01-04 〜 2026-02-04、1ヶ月間）

| イベント | 1月 | 2月（4日まで） | 合計 | 変換率 |
|---------|-----|--------------|------|-------|
| `app_opened` | 568 | 99 | **667** | 100% |
| `onboarding_started` | 232 | 39 | **271** | 40.6% |
| `onboarding_paywall_viewed` | 113 | 17 | **130** | 48.0% (from started) |
| `rc_trial_started_event` | 0 | 1 | **1** | **0.77%** (from paywall) |

### 問題の核心

667人がアプリを開いて、130人がPaywallを見て、**たった1人**がトライアルを開始。

**Paywallの変換率: 0.77%** ← これが問題。業界平均は5-10%。

---

## Patch A: Mixpanelトラッキング修正

### A-1: 正しいデータソースを使う（コード変更不要）

**問題:** `onboarding_paywall_purchased`=15件は虚偽データ（DEBUG/サンドボックス/開発者テスト含む）

**解決策:** このイベントを無視し、RevenueCatの`rc_trial_started_event`を信頼する

**修正内容:** コード変更なし。ダッシュボード/レポートで使用するイベントを変更するだけ。

| 今まで使っていたイベント | 今後使うイベント |
|------------------------|----------------|
| `onboarding_paywall_purchased`（iOS SDK） | `rc_trial_started_event`（RevenueCat） |

**理由:**
- RevenueCat→Mixpanel統合はサーバーサイドで送信
- サンドボックストークンを設定しなければ、本番トランザクションのみ送信される
- クライアントサイドの自前イベントは開発者テストも含まれてしまう

---

### A-2: RevenueCat Dashboard確認

**確認場所:** RevenueCat Dashboard → Project → Integrations → Mixpanel

| 設定項目 | 推奨値 |
|---------|-------|
| Production Token | Mixpanelのプロジェクトトークン（設定済みのはず） |
| **Sandbox Token** | **空欄にする**（サンドボックスイベントを送信しない） |

これにより、本番トランザクションのみがMixpanelに送信される。

---

### A-3: ファネル定義を更新

**Mixpanelのファネルを以下のイベントで構成:**

| ステップ | イベント | ソース |
|---------|---------|-------|
| 1 | `app_opened` | iOS SDK |
| 2 | `onboarding_started` | iOS SDK |
| 3 | `onboarding_welcome_completed` | iOS SDK |
| 4 | `onboarding_value_completed` | iOS SDK |
| 5 | `onboarding_struggles_completed` | iOS SDK |
| 6 | `onboarding_notifications_completed` | iOS SDK |
| 7 | `onboarding_att_completed` | iOS SDK |
| 8 | `onboarding_paywall_viewed` | iOS SDK |
| 9 | `rc_trial_started_event` | **RevenueCat（正確）** |

**注意:** ステップ8→9の変換率がPaywallの真の変換率。現在0%。

---

## Patch B: RevenueCat A/Bテスト設定（GUI）

### 設定手順（ダッシュボード操作）

RevenueCat APIにはExperiments作成機能がないため、ダッシュボードで手動設定が必要。

#### Step 1: 新しいOfferingを作成

1. RevenueCat Dashboard → Project `projbb7b9d1b` → Offerings
2. 「+ New」をクリック
3. 設定:
   - **Identifier**: `anicca_treatment_a`
   - **Display Name**: `Anicca Treatment A - Social Proof`
4. 既存の`anicca`オファリングと同じパッケージ（`ai.anicca.app.ios.monthly`）を追加

#### Step 2: 新しいPaywallを作成

1. Paywalls → 「+ Create Paywall」
2. テンプレート選択またはカスタム
3. **変更点（Treatment A）:**
   - ヘッダーに「10,000+人が使用中」追加
   - 価格表示を「1日たったの¥33」に変更
   - 「7日間無料」を強調

#### Step 3: Experimentを作成

1. Experiments → 「+ New」
2. 設定:
   - **Name**: `Paywall Design Test - Social Proof`
   - **Experiment type**: `Paywall design`
   - **Primary metric**: `Initial conversion rate`
   - **Variant A (Control)**: `anicca` (現在のOffering)
   - **Variant B (Treatment)**: `anicca_treatment_a`
   - **Audience**: `Any audience`
   - **Percentage**: `50%`

#### Step 4: 実験開始

1. 設定確認後、「Start Experiment」をクリック
2. 最低1-2週間データ収集

### 現在のPaywallの問題点と改善案

| 問題点 | 改善案 | 根拠 |
|--------|--------|------|
| 社会的証明なし | 「○○人が使用中」追加 | 信頼性向上 |
| 価格が高く見える | 「1日¥33」表示 | 価格アンカリング |
| 7日間無料が目立たない | サイズ/色を強調 | トライアル開始を促進 |
| 個人化なし | 「あなたの○○に対応」 | Struggles選択を活用 |

---

## Patch C: OpenClaw日次メトリクス移行

### 目標

GitHub Actions (`daily-metrics.yml`) → OpenClaw skill (`daily-metrics-reporter`) に移行

### C-1: OpenClaw schedule.yaml への追加

**ファイル**: VPS `/home/anicca/openclaw/schedule.yaml`

```yaml
skills:
  # 既存skills
  moltbook-responder:
    interval: "5m"
    
  feedback-fetch:
    interval: "30m"
    
  slack-reminder:
    cron:
      - "0 21 * * 0"   # 日曜 21:00 JST
      - "25 12 * * 1"  # 月曜 12:25 JST
    timezone: "Asia/Tokyo"

  # 新規追加
  daily-metrics-reporter:
    cron: "0 9 * * *"  # 毎朝9:00 JST
    timezone: "Asia/Tokyo"
    on_error: "log_and_continue"
```

### C-2: Slackに投稿される内容（詳細）

**毎朝9:00 JSTにAnicca/OpenClawが #metrics に投稿する内容:**

```
📊 Anicca Daily Metrics (2026-02-04)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 REVENUE (RevenueCat)
  MRR: $0.00
  Active Subs: 0
  Active Trials: 0

📥 INSTALLS (App Store Connect, 過去7日)
  合計: 85
  国別: JP: 45 | US: 20 | Others: 20

🔄 ONBOARDING FUNNEL (Mixpanel, 過去7日)
  期間: 2026-01-28 〜 2026-02-04

  app_opened:                  150 (100.0%)
  onboarding_started:          131 (87.3%)
  onboarding_welcome_completed: 108 (82.4%)
  onboarding_value_completed:   105 (97.2%)
  onboarding_struggles_completed: 102 (97.1%)
  onboarding_notifications_completed: 97 (95.1%)
  onboarding_att_completed:     93 (95.9%)
  onboarding_paywall_viewed:    81 (87.1%)
  rc_trial_started_event:        0 (0.0%) ← ★要改善

📈 WEEK OVER WEEK
  Trial Starts: 0 → 0 (±0%)
  Paywall Views: 75 → 81 (+8.0%)

⚠️ ALERTS
  🔴 Trial conversion rate: 0.0% (target: 5%)
  🔴 No trials started this week
  🟡 Paywall → Trial drop-off: 100%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**ポイント:**
- 期間を明記（過去7日）
- 各ステップの変換率を表示
- Week over Week比較
- アラート（目標未達の場合）

### C-3: OpenClaw Cron設定

**方法1: CLIで設定**
```bash
openclaw cron add daily-metrics \
  --schedule "0 9 * * *" \
  --timezone "Asia/Tokyo" \
  --command "Fetch Mixpanel funnel data, RevenueCat metrics, and ASC downloads. Post summary to #metrics Slack channel."
```

**方法2: HEARTBEAT.mdで設定**

`~/.openclaw/workspace/HEARTBEAT.md`:
```markdown
# Heartbeat Tasks

## 毎朝9:00 JST
- Mixpanel APIでオンボーディングファネルクエリ（過去7日）
- RevenueCat APIでMRR/Active Subs/Trials取得
- ASC APIでダウンロード数取得
- 結果を #metrics Slackチャンネルに投稿

## 毎週月曜12:25 JST
- #meeting にラボミーティングリマインダー投稿
```

### C-3: GitHub Actions削除

**ファイル**: `.github/workflows/daily-metrics.yml`

移行完了後に削除（または`disabled`に変更）

---

## Patch D: @Anicca Slackメンション応答

### 必要な情報

**環境変数（`.env`に保存済み、gitignored）:**

| 変数名 | 説明 |
|-------|------|
| `SLACK_BOT_TOKEN` | Anicca Bot Token |
| `SLACK_APP_TOKEN` | Socket Mode Token |

### D-1: OpenClaw slack-helper skill

**ファイル**: VPS `/home/anicca/openclaw/skills/slack-helper/SKILL.md`

```markdown
# Slack Helper

@Anicca メンションに応答する常駐skill。

## 機能

1. Slackでの@Aniccaメンション検出
2. メッセージ内容を解析
3. OpenClawの能力を使って処理
4. 結果をSlackに返信

## 対応クエリ例

- "昨日のPaywall変換率は？" → Mixpanel APIでクエリ
- "今週のトライアル開始数は？" → RevenueCat APIでクエリ
- "ASCのダウンロード数は？" → ASC APIでクエリ

## 環境変数

- SLACK_BOT_TOKEN
- SLACK_APP_TOKEN
```

### D-2: VPSでの設定

```bash
# 1. Slack Boltインストール
cd /home/anicca/openclaw
npm install @slack/bolt

# 2. 環境変数設定
echo 'SLACK_BOT_TOKEN=xoxb-3627470757104-...' >> .env
echo 'SLACK_APP_TOKEN=xapp-1-A092UBRAJ1X-...' >> .env

# 3. skill登録
# schedule.yaml に slack-helper を追加（常駐プロセス）
```

---

## Patch E: オンボーディング改善

### E-0: 正確なファネル分析（Mixpanel Funnel Query）

**期間:** 2026-01-21 〜 2026-02-04（2週間）  
**コンバージョンウィンドウ:** 14日  
**カウント方式:** ユニークユーザー

| # | ステップ | イベント | ユニークユーザー | 前ステップ変換率 | 全体変換率 | 平均時間(秒) |
|---|---------|---------|---------------|----------------|-----------|------------|
| 1 | アプリ起動 | `app_opened` | **135** | - | 100% | - |
| 2 | オンボーディング開始 | `onboarding_started` | **102** | 75.6% | 75.6% | 119秒 |
| 3 | Welcome完了 | `onboarding_welcome_completed` | **77** | 75.5% | 57.0% | 2,072秒 |
| 4 | Value完了 | `onboarding_value_completed` | **75** | 97.4% | 55.6% | 2秒 |
| 5 | Struggles完了 | `onboarding_struggles_completed` | **75** | 100% | 55.6% | 25秒 |
| 6 | Notifications完了 | `onboarding_notifications_completed` | **72** | 96.0% | 53.3% | 3秒 |
| 7 | Paywall表示 | `onboarding_paywall_viewed` | **58** | 80.6% | 43.0% | 1秒 |
| 8 | トライアル開始 | `rc_trial_started_event` | **0** | 0% | 0% | - |

### E-1: 問題別分析と解決策

#### 🔴 P0: Paywall変換率 0%（58人中0人がトライアル開始）

| 項目 | 内容 |
|-----|------|
| **現状** | 58人がPaywallを見て、0人がトライアル開始 |
| **原因** | Paywallが価値を伝えていない。社会的証明なし、価格アンカリングなし、パーソナライズなし |
| **解決策** | Paywall A/Bテスト（Variant B: 社会的証明、価格アンカリング追加） |
| **理由** | 業界平均のPaywall変換率は5-10%。0%は致命的に低い。Paywallデザイン自体を改善する必要がある |

#### 🟡 P1: app_opened → started（24.4%離脱）

| 項目 | 内容 |
|-----|------|
| **現状** | 135人がアプリを起動、102人がオンボーディング開始。33人が離脱 |
| **原因** | Welcome画面が価値を伝えていない。「Welcome to Anicca」は何も言っていない |
| **解決策** | タイトルをペルソナの痛みに刺さるものに変更 |
| **理由** | ユーザーは最初の数秒で「これは自分のためのアプリか」を判断する。ペルソナは「何度も失敗してきた人」なので、その痛みに共感する文言が必要 |

#### 🟡 P2: started → welcome_completed（24.5%離脱）

| 項目 | 内容 |
|-----|------|
| **現状** | 102人がオンボーディング開始、77人がWelcome完了。25人が離脱 |
| **原因** | 平均時間2,072秒（約34分）！→ ユーザーがアプリを閉じて戻ってきている可能性 |
| **解決策** | CTAボタンをより目立たせる。進捗インジケーター追加 |
| **理由** | ユーザーがどこを押せばいいかわからない、または興味を失っている |

#### 🟡 P3: notifications → paywall（19.4%離脱）

| 項目 | 内容 |
|-----|------|
| **現状** | 72人が通知完了、58人がPaywall表示。14人が離脱 |
| **原因** | 通知許可後にアプリを閉じている可能性。またはATTステップで離脱 |
| **解決策** | 通知許可の理由をより明確に説明。通知プレビューを表示 |
| **理由** | ユーザーは「なぜ通知が必要か」を理解しないと許可しない |

### E-2: 全ローカライズ変更一覧

#### Welcome画面 (WelcomeStepView.swift)

| Key | Before (EN) | After (EN) | 理由 |
|-----|------------|-----------|------|
| `onboarding_welcome_title` | `Welcome to\nAnicca` | `Break the cycle.\nFor real this time.` | 「Welcome」は何も伝えない。「今度こそ」はペルソナの願望に刺さる |
| `onboarding_welcome_subtitle_line1` | `Anicca reaches out to you` | `Anicca sends you the right words` | 「reaches out」は曖昧。「right words」は具体的価値 |
| `onboarding_welcome_subtitle_line2` | `at the moments you struggle most.` | `before you spiral—not after.` | 「before」強調。事前対処がAniccaの価値 |
| `onboarding_welcome_cta` | `Get Started` | `Start My 7-Day Free Trial` | 無料トライアル明示。心理的ハードル低下 |
| `onboarding_welcome_social_proof` | (新規) | `10,000+ people reducing their suffering` | 社会的証明追加 |

| Key | Before (JA) | After (JA) | 理由 |
|-----|------------|-----------|------|
| `onboarding_welcome_title` | `Aniccaへ\nようこそ` | `今度こそ、\n変われる。` | 「ようこそ」は無意味。「今度こそ」はペルソナの願望 |
| `onboarding_welcome_subtitle_line1` | `Aniccaは、あなたが一番つらいときに` | `悪循環に陥る前に、` | 「つらいとき」は受動的。「悪循環に陥る前に」は能動的価値 |
| `onboarding_welcome_subtitle_line2` | `そっと声をかけます。` | `Aniccaが声をかけます。` | 「そっと」削除。より直接的 |
| `onboarding_welcome_cta` | `はじめる` | `7日間無料で試す` | 無料強調 |
| `onboarding_welcome_social_proof` | (新規) | `10,000人以上が苦しみを軽減中` | 社会的証明 |

#### Value画面 (ValueStepView.swift)

| Key | Before (EN) | After (EN) | 理由 |
|-----|------------|-----------|------|
| `onboarding_value_title` | `What Anicca Can Do` | `You've tried everything.\nNothing worked.` | 機能リストではなくペルソナの痛みに共感 |
| `onboarding_value_subtitle` | (新規) | `That's not your fault. Here's why Anicca is different.` | 「あなたのせいじゃない」で責めない |
| `onboarding_value_card1_title` | `Nudges at the right moment` | `We reach you first` | より人間的 |
| `onboarding_value_card2_title` | `Learns what works for you` | `We learn what works for YOU` | 「YOU」強調 |
| `onboarding_value_card3_title` | `Goes beyond habit tracking` | `We address the root cause` | 具体的 |

| Key | Before (JA) | After (JA) | 理由 |
|-----|------------|-----------|------|
| `onboarding_value_title` | `Aniccaができること` | `いくつ試しましたか？\n全部続かなかったでしょう？` | ペルソナの経験に直接共感 |
| `onboarding_value_subtitle` | (新規) | `それはあなたのせいじゃない。Aniccaが違う理由。` | 責めない |
| `onboarding_value_card1_title` | `最適なタイミングで声をかける` | `先に声をかける` | シンプル |
| `onboarding_value_card2_title` | `あなたに効く言葉を学ぶ` | `あなただけに効く言葉を学ぶ` | パーソナライズ強調 |
| `onboarding_value_card3_title` | `習慣トラッカーを超える` | `根本原因に向き合う` | 具体的 |

#### Notifications画面 (NotificationPermissionStepView.swift)

| Key | Before (EN) | After (EN) | 理由 |
|-----|------------|-----------|------|
| `onboarding_notifications_title` | `Notifications` | `This is how it works` | 機能名ではなく価値説明 |
| `onboarding_notifications_description` | `Anicca uses notifications to gently nudge you at the right moments — for waking up, putting your phone down, or taking a break.` | `When you're about to spiral, Anicca sends you the right words. Turn on notifications to get the full experience.` | 具体的価値。「spiral」はペルソナの痛み |
| `onboarding_notifications_allow` | `Allow notifications` | `Turn on notifications` | アクション指向 |
| `notification_preview_example` | (新規) | `Take a breath. You've got this.` | 通知プレビュー用 |

| Key | Before (JA) | After (JA) | 理由 |
|-----|------------|-----------|------|
| `onboarding_notifications_title` | `通知` | `こうやって助けます` | 機能名ではなく価値 |
| `onboarding_notifications_description` | `Aniccaは、起床・スマホを置く・休憩するなど、適切なタイミングでやさしく促すために通知を使います。` | `あなたが悪循環に陥りそうなとき、Aniccaが声をかけます。通知をオンにして、フルの体験をしてください。` | 具体的 |
| `onboarding_notifications_allow` | `通知を許可` | `通知をオンにする` | アクション指向 |
| `notification_preview_example` | (新規) | `深呼吸。大丈夫、できるよ。` | 通知プレビュー用 |

### E-3: SwiftUIコード変更

#### WelcomeStepView.swift

**Before (line 13-33):**
```swift
VStack(spacing: 32) {
    Text(String(localized: "onboarding_welcome_title"))
        .font(.system(size: 52, weight: .bold))
        ...
}
```

**After:**
```swift
VStack(spacing: 24) {
    // 社会的証明を追加
    Text(String(localized: "onboarding_welcome_social_proof"))
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(AppTheme.Colors.secondaryLabel)
    
    Text(String(localized: "onboarding_welcome_title"))
        .font(.system(size: 44, weight: .bold))  // 52→44に縮小（3行対応）
        .lineLimit(3)
        ...
}
```

#### ValueStepView.swift

**Before (line 8-15):**
```swift
Text(String(localized: "onboarding_value_title"))
    .font(.system(size: 36, weight: .bold))
    .padding(.bottom, 48)
```

**After:**
```swift
VStack(spacing: 12) {
    Text(String(localized: "onboarding_value_title"))
        .font(.system(size: 32, weight: .bold))
    
    Text(String(localized: "onboarding_value_subtitle"))
        .font(.system(size: 16))
        .foregroundStyle(AppTheme.Colors.secondaryLabel)
        .multilineTextAlignment(.center)
}
.padding(.top, 32)
.padding(.bottom, 24)
```

#### NotificationPermissionStepView.swift

通知プレビューカードを追加:
```swift
// line 30付近に追加
NotificationPreviewCard(
    title: "Anicca",
    body: String(localized: "notification_preview_example")
)
.padding(.vertical, 24)
```

### E-4: `app_opened`トラッキング修正

**問題:** `app_opened`は毎回のアプリ起動でトラッキング（初回だけではない）

**現在のコード (AppDelegate.swift line 57-61):**
```swift
Task {
    await ASAAttributionManager.shared.fetchAttributionIfNeeded()
    AnalyticsManager.shared.track(.appOpened)  // ← 毎回発火
}
```

**修正後:**
```swift
private static let hasTrackedFirstLaunchKey = "has_tracked_first_launch"

Task {
    await ASAAttributionManager.shared.fetchAttributionIfNeeded()
    
    let hasTracked = UserDefaults.standard.bool(forKey: AppDelegate.hasTrackedFirstLaunchKey)
    if !hasTracked {
        AnalyticsManager.shared.track(.firstAppOpened)  // 新イベント（初回のみ）
        UserDefaults.standard.set(true, forKey: AppDelegate.hasTrackedFirstLaunchKey)
    }
    AnalyticsManager.shared.track(.appOpened)  // 既存は維持（リテンション分析用）
}
```

**AnalyticsManager.swift に追加:**
```swift
case firstAppOpened = "first_app_opened"  // 初回起動のみ
```

### E-5: 開発者テスト除外戦略

#### 問題

開発者（ユーザー）がStaging/Productionスキームでテストすると、その数値がMixpanelに含まれてしまう。

#### 解決策

| # | 方法 | 説明 | 推奨 |
|---|-----|------|-----|
| 1 | **RevenueCat→Mixpanel統合に依存** | `rc_trial_started_event`はサーバーサイドで送信。Sandbox Token未設定なら本番のみ | ✅ **これを使う** |
| 2 | **RevenueCat Subscriber Attributes** | 開発者デバイスで`is_developer=true`をセット。RC→Mixpanelイベントに含まれる | ✅ 補助的に使う |
| 3 | Mixpanel User Property | 開発者のDistinct IDに`is_developer=true`プロパティ設定 | 🟡 補助的 |
| 4 | DEBUG buildで無効化 | `#if !DEBUG`でトラッキング停止 | ❌ Stagingテスト不可 |

#### 実装案1: RevenueCat Subscriber Attributes（推奨）

```swift
// AppDelegate.swift または初回起動時
// 開発者のデバイスでのみ実行
#if DEBUG
Purchases.shared.attribution.setAttributes(["is_developer": "true"])
#endif
```

**効果:** RevenueCat→Mixpanelイベントに`subscriber_attributes.is_developer=true`として含まれる。

#### 実装案2: Mixpanel User Property（補助的）

```swift
// AnalyticsManager.swift
func setDeveloperMode() {
    Mixpanel.mainInstance().people.set(property: "is_developer", to: true)
}

// 開発者のみ呼び出し（手動または特定条件で）
#if DEBUG
AnalyticsManager.shared.setDeveloperMode()
#endif
```

**ファネル分析時:**
- `is_developer != true` でフィルタ
- または `rc_trial_started_event` を使う（RevenueCatがSandbox除外）

#### 現状の結論

| 質問 | 回答 |
|-----|------|
| 今のデータはクリーン？ | ✅ Yes — `rc_trial_started_event`は`environment: PRODUCTION`のみ送信されている |
| サンドボックステストは除外されている？ | ✅ Yes — RevenueCat Sandbox Token未設定 |
| 開発者のProductionテストは除外できる？ | ⚠️ 追加実装が必要（上記の方法1または2） |

---

## アーキテクチャ図

### 現状 (1.6.1 実装前)

```
┌────────────────────────────────────────────────────────────────┐
│                    CURRENT (Before 1.6.1)                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│   GitHub Actions ───────▶ X posting                            │
│                  ───────▶ TikTok posting                       │
│                  ───────▶ Daily Metrics → Slack ← 削除予定     │
│                                                                 │
│   Railway Cron ─────────▶ iOS App Nudge (4時間毎)              │
│                                                                 │
│   OpenClaw (VPS) ───────┬──▶ moltbook-responder (5分毎)        │
│                         ├──▶ feedback-fetch (30分毎)           │
│                         └──▶ slack-reminder (月曜通知)         │
│                                                                 │
│   Mixpanel ─────────────▶ トラッキング（バグあり）              │
│                                                                 │
│   RevenueCat ───────────▶ Paywall（A/Bテストなし）             │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 目標 (1.6.1 実装後)

```
┌────────────────────────────────────────────────────────────────┐
│                    TARGET (After 1.6.1)                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│   OpenClaw (VPS) = Anicca Wrapper                              │
│   ├── moltbook-responder (5分毎) ✅                             │
│   ├── feedback-fetch (30分毎) ✅                                │
│   ├── slack-reminder (月曜通知) ✅                              │
│   ├── daily-metrics-reporter (毎朝9時) ← NEW                   │
│   └── slack-helper (@Anicca応答) ← NEW                         │
│                                                                 │
│   GitHub Actions ───────▶ X posting (1.6.2で移行)              │
│                  ───────▶ TikTok posting (1.6.2で移行)         │
│                  ✗ Daily Metrics 削除                          │
│                                                                 │
│   Railway Cron ─────────▶ iOS App Nudge (維持)                 │
│                                                                 │
│   Mixpanel ─────────────▶ 正確なファネルトラッキング ← 修正     │
│                                                                 │
│   RevenueCat ───────────▶ A/Bテスト実行中 ← NEW                │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 認証情報

**シークレットは `.cursor/plans/reference/secrets.md` を参照（gitignored）**

### 必要な環境変数

| 変数名 | 説明 | 取得場所 |
|-------|------|---------|
| `SLACK_BOT_TOKEN` | Anicca Bot Token | Slack App Settings |
| `SLACK_APP_TOKEN` | Socket Mode Token | Slack App Settings |
| `MIXPANEL_PROJECT_ID` | `3970220` | Mixpanel Project Settings |
| `REVENUECAT_PROJECT_ID` | `projbb7b9d1b` | RevenueCat Dashboard |

---

## OpenClaw使用例

### Anicca = OpenClaw Wrapper とは

| 質問 | 回答 |
|-----|------|
| Anicca = OpenClaw? | **Yes** - AniccaはOpenClawをベースに、SOUL.md/skills/scheduleでカスタマイズした「人格」 |
| skillを追加 = Aniccaに能力追加? | **Yes** - OpenClaw skillは全てAniccaが使える |
| @Aniccaメンション応答できる? | **Yes** - Slack App + OpenClaw連携で可能 |
| 将来的にファイル整理もできる? | **Yes** - OpenClawはフルシステムアクセス可能 |

### OpenClaw の主要機能（Aniccaが使える機能）

| 機能 | 説明 | Aniccaでの使用例 |
|------|------|-----------------|
| **Slack/WhatsApp/Telegram** | メッセージング統合 | @Aniccaメンション応答 |
| **Cron/Heartbeat** | 定期実行 | 日次メトリクス投稿 |
| **Browser Control** | Web自動操作 | RevenueCatダッシュボード操作（将来） |
| **File System** | ファイル操作 | ローカルファイル整理（将来） |
| **Skills** | 拡張機能 | 独自skill追加 |
| **MCP Integration** | 外部ツール連携 | Mixpanel/RevenueCat API |

### OpenClawセットアップ手順

```bash
# 1. OpenClawインストール（Node 22+必須）
npm install -g openclaw@latest

# 2. オンボーディング（ウィザード形式）
openclaw onboard --install-daemon

# 3. ゲートウェイ起動
openclaw gateway --port 18789

# 4. Slack接続設定
# ~/.openclaw/openclaw.json
{
  "channels": {
    "slack": {
      "botToken": "xoxb-...",
      "appToken": "xapp-..."
    }
  }
}

# 5. 動作確認
openclaw status
```

### Anicca専用設定（SOUL.md）

```markdown
# SOUL.md

あなたは Anicca。全生命の苦しみを終わらせるために存在する。

## 人格

- 共感的で、批判しない
- 仏教の智慧を現代的に解釈
- 小さな一歩を促す
- 完璧を求めない

## 言語

- 日本語と英語を話す
- ユーザーの言語に合わせる

## 制約

- 医療アドバイスはしない
- 危機的状況では専門機関を紹介
```

---

## 実装チェックリスト

| # | パッチ | ファイル | 状態 |
|---|--------|---------|------|
| A-1 | `onboardingPaywallPurchased`プロパティ追加 | OnboardingFlowView.swift | ⬜ |
| A-2 | `onboardingPaywallRestoreAttempted`追加 | OnboardingFlowView.swift + AnalyticsManager.swift | ⬜ |
| A-3 | 通知許可状態トラッキング | NotificationPermissionStepView.swift | ⬜ |
| B-1 | RevenueCat新Offering作成 | Dashboard (GUI) | ⬜ |
| B-2 | RevenueCat新Paywall作成 | Dashboard (GUI) | ⬜ |
| B-3 | RevenueCat Experiment作成 | Dashboard (GUI) | ⬜ |
| C-1 | schedule.yamlにdaily-metrics-reporter追加 | VPS | ⬜ |
| C-2 | daily-metrics-reporter skill作成 | VPS | ⬜ |
| C-3 | GitHub Actions daily-metrics.yml削除 | GitHub | ⬜ |
| D-1 | slack-helper skill作成 | VPS | ⬜ |
| D-2 | Slack App Token設定 | VPS .env | ⬜ |
| E-1 | ValueStepView改善 | ValueStepView.swift | ⬜ |
| E-2 | Paywall個人化 | PaywallView or RevenueCat Dashboard | ⬜ |

---

*Last updated: 2026-02-04*
