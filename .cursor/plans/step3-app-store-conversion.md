# Anicca App Store コンバージョン最適化指示書

## 概要

- **目的**: App Storeでの「インプレッション → プロダクトページ → ダウンロード」のコンバージョン率を改善する
- **現状CVR（実力値）**: **3.92%**（14%は友人紹介のまぐれ）
- **目標CVR**: **10%**（第一段階）→ **25%+**（Health & Fitness平均）
- **コード変更なし**。全部App Store Connectとデザインツール側の作業

---

## 2025-12-14 更新（今回のタスク範囲 / 実行準備OK）

### 今回やること（確定）

- **変更対象**: **スクリーンショット1枚目のみ**（JP/EN）
- **狙い**: UI説明を捨てて「ベネフィット一言」を大きく出す

### 成果物（このリポジトリ内の参照先）

- 1枚目スクショ仕様: `.cursor/plans/PROMO/ss1-hero-spec.md`
- Canva/Figma作成手順: `.cursor/plans/PROMO/ss1-hero-canva-figma-howto.md`
- PPOテスト設計（設定値/勝敗ルール）: `.cursor/plans/PROMO/ppo-ss1-benefit-test.md`
- App Store Connect操作手順: `.cursor/plans/PROMO/app-store-connect-ppo-step-by-step.md`

---

## 関連ファイル（重要）

| ファイル/フォルダ | 内容 |
|---|---|
| `.cursor/plans/PROMO/appstore-analytics-baseline.md` | CVR/インプレッション等の数値記録、目標値、PPO設定決定事項 |
| `.cursor/plans/PROMO/screenshots/` | スクショ履歴（日付_CVRでフォルダ分け） |
| `.cursor/plans/PROMO/screenshots/2024-12-14_cvr3.92/jp.jpg` | 改善前の日本語スクショ（ベースライン） |
| `.cursor/plans/PROMO/screenshots/2024-12-14_cvr3.92/en.png` | 改善前の英語スクショ（ベースライン） |

---

## 今回やること（決定事項）

### 変更対象

**1枚目のスクリーンショットのみ**（2枚目・3枚目は変更しない）

### 日本語版（jp）の1枚目

| 要素 | 現在 | 変更後 |
|---|---|---|
| **見出し** | 習慣と時間を設定 | **夜更かしが、やめられる。** |
| **中身** | UIスクショ（設定画面） | **削除**。代わりに「朝日が差し込む窓」のイメージ画像を背景にする |
| **デバイスモック** | あり（iPhoneの枠） | **削除**。画像だけにする |
| **背景色** | 水色 | **そのまま**（水色グラデでOK） |

### 英語版（en）の1枚目

| 要素 | 現在 | 変更後 |
|---|---|---|
| **見出し** | 1. Set Your Ideal Habits | **Finally stop staying up late.** |
| **中身** | UIスクショ（設定画面） | **削除**。日本語版と同じ「朝日」イメージを使う |
| **デバイスモック** | あり | **削除** |
| **背景色** | 水色 | **そのまま** |

### デザイン仕様

- **見出しフォントサイズ**: 今の1.5倍（検索結果のサムネで読めるサイズ）
- **見出し位置**: 画面中央やや上
- **見出し色**: 白 or 濃い青（背景とのコントラストを確保）
- **背景画像**: 「朝日 窓 シルエット」でフリー素材を検索して使う（Unsplash等）
- **Aniccaロゴ**: 右下に小さく入れる（なくてもいい）
- **画像サイズ**: iPhone 6.7インチ用（1290 x 2796 px）

### PPOテスト設定（これを入力する）

| 項目 | 入力値 |
|---|---|
| 参照名 | `ppo_2024-12-14_JPEN_ss1_benefit` |
| トリートメント数 | **1** |
| トラフィック割合 | **100%** |
| ローカリゼーション | **日本語、英語** |
| 改善率 | **30%** |

### 作業手順

1. Canva or Figma を開く
2. 1枚目スクショを新規作成（iPhone 6.7インチサイズ: 1290 x 2796 px）
3. 背景に水色グラデ + 朝日の窓画像を薄く重ねる
4. 中央に「夜更かしが、やめられる。」を大きく配置
5. 保存 → JP用
6. 同じファイルを複製し、文言を「Finally stop staying up late.」に変える
7. 保存 → EN用
8. App Store Connect → 配信 → プロダクトページの最適化 → テストを作成
9. 上の設定を入力
10. Treatment に新しい1枚目を入れる
11. テスト開始
12. **90% Confidence**になるまで待つ
13. 勝ったら「Apply treatment」をクリック

### 勝敗判定基準

- **90% Confidence（信頼度90%以上）**でTreatmentがControlを上回ったら「勝ち」
- App Store Connect → プロダクトページの最適化 → テストを開く → Confidence を確認

---

## 1. 使う機能・ツール

### 1.1 App Store Connect機能

- **Product Page Optimization (PPO)**: **アプリアイコン / スクリーンショット / プレビュー動画**のA/Bテスト
- **Custom Product Pages (CPP)**: 広告用ランディング（Step5と連携）

公式（一次情報）:
- PPO: https://developer.apple.com/app-store/product-page-optimization/
- PPO（App Store Connect Help）: https://developer.apple.com/help/app-store-connect/create-product-page-optimization-tests/overview-of-product-page-optimization/
- CPP: https://developer.apple.com/app-store/custom-product-pages/

### 1.2 スクショ作成ツール

- **既存**: アップスクリーン（継続使用）
- **補助**: Figma等、画像編集ツール（任意）

### 1.3 サードパーティツール

- **初期は導入しない（推奨）**: SplitMetrics / StoreMaven / AppTweak / SensorTower 等
  - **役割**: 競合調査、キーワード分析、制作ワークフロー強化、PPO前の疑似テスト（有料が多い）
  - **結論**: Aniccaの現状（ボトルネック解消が先）では、まず **PPO/CPPで回して勝ち筋を作ってから** 必要なら導入

---

## 2. 現状の棚卸し

### 2.1 App Store Connectでの確認

1. [App Store Connect](https://appstoreconnect.apple.com/)にログイン
2. アプリ選択 → **App Information** / **Product Page** を開く
3. 以下をスクショ or Markdownに貼り付けてドキュメント化:

| 項目 | 現在の値 | メモ |
|------|----------|------|
| アプリアイコン | [画像] | |
| タイトル | Anicca | |
| サブタイトル | [現在の値] | |
| プロモーションテキスト | [現在の値] | |
| 説明文（冒頭） | [現在の値] | |
| スクリーンショット1 | [画像] | |
| スクリーンショット2 | [画像] | |
| ... | ... | |

### 2.2 App Analyticsでの現状確認

1. App Store Connect → **Analytics** → **Metrics**
2. 期間: 直近30日〜90日
3. 以下をメモ:

| 指標 | 値 | メモ |
|------|-----|------|
| Impressions | [数値] | |
| Product Page Views | [数値] | |
| App Units | [数値] | |
| Conversion Rate (Impressions → App Unit) | [%] | 目標: 13.8% → 20%+ |
| Conversion Rate (Product Page Views → App Unit) | [%] | |

---

## 3. ベンチマークリサーチ

### 3.1 競合アプリ分析

同カテゴリで以下をピックアップ（3〜5個）:

- 「音声AI」「習慣形成」「睡眠改善」系アプリ
- App Storeで検索して、上位に出てくるアプリ

### 3.2 分析項目

各アプリについて以下をメモ:

| アプリ名 | 1枚目スクショ構成 | アイコンのトーン | サブタイトル訴求軸 | メモ |
|----------|------------------|------------------|-------------------|------|
| [例] | ベネフィット強調 | 温かみ | 「生活リズムを整える」 | |
| ... | ... | ... | ... | |

**訴求軸の例**:
- ベネフィット型: 「夜更かしから抜け出す」「早起き習慣」
- 機能型: 「AIコーチと毎日話す」「音声対話で習慣化」
- 感情型: 「自分を変える」「新しい自分へ」

---

## 4. 仮説パターンの定義

Anicca向けに **2〜3パターン** の方向性を定める。

### 4.1 パターンA: 「夜更かしから抜け出す」に全振り

**ターゲット**: 夜更かしに悩む20〜30代

**スクショ構成**:
- 1枚目: 「AIと毎晩話して、夜更かしをやめる」＋印象的なビジュアル（夜のシーン or 朝の爽やかなシーン）
- 2枚目: オンボーディング画面（簡単さを強調）
- 3枚目: 音声セッション画面（実際のUI）

**サブタイトル**: 「音声コーチで生活リズムを整える習慣アプリ」

**説明文冒頭**:
```
毎晩夜更かしして、朝起きられない...そんな自分を変えたい。

Aniccaは、AIコーチと毎晩話すだけで、自然と生活リズムが整う習慣アプリです。
```

### 4.2 パターンB: 「健康・パフォーマンス向上」寄り

**ターゲット**: 健康意識の高い20〜40代

**スクショ構成**:
- 1枚目: 「朝のルーティンで1日を始める」＋朝のシーン
- 2枚目: トレーニング習慣画面
- 3枚目: 睡眠の質改善画面

**サブタイトル**: 「AIコーチと一緒に、理想の生活リズムを作る」

**説明文冒頭**:
```
理想の生活リズムを作りたい。でも続かない...

Aniccaは、AIコーチがあなたのペースに合わせて、無理なく習慣化をサポートします。
```

### 4.3 パターンC: 「AIコーチ×音声UIの未来感」寄り

**ターゲット**: テクノロジー好きの20〜30代

**スクショ構成**:
- 1枚目: 「AIコーチとリアルタイムで対話」＋音声UIの画面
- 2枚目: セッション中の画面（会話の流れ）
- 3枚目: 習慣達成の画面

**サブタイトル**: 「音声AIで、習慣化の新しい体験を」

**説明文冒頭**:
```
AIと話すだけで、習慣が変わる。

Aniccaは、最新の音声AI技術で、あなたの生活リズムを自然に整えます。
```

### 4.4 パターン選定

- まずは **パターンA** と **パターンB** でA/Bテストを開始
- パターンCは将来のオプションとして温存

---

## 5. App Store Connect で Product Page Optimization 設定

### 5.1 PPOテスト作成

1. App Store Connect → アプリ選択 → **Product Page Optimization**
2. 「Create Test」をクリック
3. テスト名: `Onboarding Paywall Test v1`（任意）

**重要（PPOでテストできる要素）**:
- Apple公式のPPOでテストできるのは主に **アプリアイコン / スクリーンショット / アプリプレビュー**。
- サブタイトルや説明文などの「メタデータ」そのものはPPOのテスト要素に含まれない（変更は通常のメタデータ更新で行う）。

### 5.2 ベースライン設定

- **Baseline**: 現在のストアページ（変更なし）

### 5.3 Variant A/B 設定
（この章は「将来の多変量テスト」用のメモとして残す）

**今回（2025-12-14）の設定は“Treatment 1つ”のみ**:

- 参照名: `ppo_2024-12-14_JPEN_ss1_benefit`
- 変更点: **スクショ1枚目だけ差し替え（JP/EN）**
- 詳細手順/設定値は以下を参照:
  - `.cursor/plans/PROMO/ppo-ss1-benefit-test.md`
  - `.cursor/plans/PROMO/app-store-connect-ppo-step-by-step.md`

### 5.4 テスト期間設定

- **期間**: 少なくとも2〜4週間
- **目標**: 統計的に有意な差が出るまで回す
- **配信比率**: 50:50（デフォルト）

### 5.5 テスト開始

1. 設定を確認
2. 「Start Test」をクリック
3. 審査が必要な場合は、Apple審査を待つ

---

## 6. 結果の読み方と反映

### 6.1 メイン指標

App Store Connect → **Analytics** → **Product Page Optimization** で確認:

| 指標 | ベースライン | Variant A | Variant B | 勝者 |
|------|-------------|-----------|-----------|------|
| Impressions | [数値] | [数値] | [数値] | |
| Product Page Views | [数値] | [数値] | [数値] | |
| App Units | [数値] | [数値] | [数値] | |
| Conversion Rate (Impressions → App Unit) | [%] | [%] | [%] | |

### 6.2 判定ルール

- Variantがベースラインより **有意に高いCVR**（例: +2%以上）を示したら、それを本番パターンとして採用
- 逆に悪化した場合は、仮説を破棄 or 方向を調整して再テスト

### 6.3 採用後の反映

1. App Store Connect → **Product Page** → **Version Information**
2. 採用したコピー＆スクショを **App Storeのデフォルトページに反映**
3. その情報を内部ドキュメント（例: `.cursor/plans/aso-history.md`）に残し、なぜ勝ったかの仮説も一文で書いておく

---

## 7. Custom Product Pages (CPP) の設計

### 7.1 CPPとは

- 広告キャンペーン用に、**専用のランディングページ**を作成できる機能
- 広告の訴求に合わせて、スクショやテキストをカスタマイズ可能

### 7.2 Anicca向けCPP設計

以下の3つのCPPを作成:

| CPP名 | 訴求 | 用途 |
|-------|------|------|
| `habit-wake-focused` | 早起き/起床習慣 | Apple Search Ads「早起き」キーワード用 |
| `sleep-improvement` | 睡眠の質改善 | Apple Search Ads「睡眠」キーワード用 |
| `training-focus` | トレーニング習慣 | Apple Search Ads「トレーニング」キーワード用 |

### 7.3 CPP作成手順

1. App Store Connect → アプリ選択 → **Custom Product Pages**
2. 「Create Custom Product Page」をクリック
3. 名前: `habit-wake-focused`（例）
4. スクショ・テキストをその訴求に合わせてカスタマイズ
5. 保存

### 7.4 CPPと広告の紐付け

- Step5（広告タスク）で、Apple Search AdsのキャンペーンとCPPを紐付ける
- ここでは「CPPが作成されている」状態にしておく

---

## 8. スクリーンショット作成のベストプラクティス

### 8.1 1枚目の重要性

- **最重要**: 1枚目スクショがコンバージョンを大きく左右する
- ユーザーは1枚目を見て「ダウンロードするか」を判断する

### 8.2 デザイン原則

1. **ベネフィットを明確に**
   - 「何ができるか」ではなく「何が良くなるか」を伝える
2. **視認性**
   - 小さな画面でも読みやすいフォントサイズ
   - コントラストを高く
3. **一貫性**
   - アプリのブランドカラー・トーンを統一

### 8.3 テキストオーバーレイ

- スクショ上にテキストを重ねる場合:
  - 1行目: ベネフィット（例: 「夜更かしから抜け出す」）
  - 2行目: サポート情報（例: 「AIコーチがサポート」）
- フォント: 太字、読みやすいサイズ

### 8.4 アップスクリーンでの作成

1. アップスクリーンを開く
2. テンプレート選択（iPhone 15 Pro Max推奨）
3. スクショ画像をアップロード
4. テキストオーバーレイを追加
5. エクスポート

---

## 9. 継続的な改善サイクル

### 9.1 テスト頻度

- **月1回**: 新しいパターンでPPOテストを開始
- **四半期1回**: 大きな方向転換を検討

### 9.2 データドリブンな判断

- App Analyticsのデータを見ながら、仮説を立てる
- Step2（Mixpanel）のデータも参照し、「どのユーザーがコンバージョンしているか」を分析

### 9.3 ドキュメント化

- `.cursor/plans/aso-history.md` に以下を記録:
  - テストしたパターン
  - 結果（CVR）
  - 勝った理由の仮説
  - 次回の改善案

---

## 10. 成果物チェックリスト

- [ ] 現行ストアページの内容がMarkdownなどで保存されている
- [ ] 競合アプリの分析が完了している
- [ ] 少なくとも2パターンのクリエイティブ仮説が定義されている
- [ ] Product Page Optimizationのテストが1つ以上走っている
- [ ] テスト結果をもとに、「勝ちパターン」が本番に反映されている
- [ ] Custom Product Pagesが1つ以上作成され、どの訴求で使うか定義されている

---

## 11. 参考リンク

- [App Store Connect ヘルプ](https://help.apple.com/app-store-connect/)
- [Product Page Optimization ガイド](https://developer.apple.com/app-store/product-page-optimization/)
- [Custom Product Pages ガイド](https://developer.apple.com/app-store/custom-product-pages/)

### 追加（自動化）

- App Store Connect API（メタデータ/アセット管理の自動化入口）: https://developers.apple.com/app-store-connect/api
- fastlane snapshot（スクショ自動生成）: https://docs.fastlane.tools/actions/snapshot
- fastlane deliver（メタデータ/スクショ/バイナリのアップロード自動化）: https://docs.fastlane.tools/actions/deliver

---

## 13. どこまで自動化できるか（現実）

### 13.1 自動化できること（強い）

- **スクリーンショット生成**: fastlane `snapshot`（XCUITestで撮る）で、端末/言語ごとのスクショを自動生成できる
- **スクリーンショット & メタデータのアップロード**: fastlane `deliver` で自動アップロードできる
- **Custom Product Pages（CPP）のメタデータ管理**: Appleは「App Store Connect APIでカスタムプロダクトページのメタデータのアップロード/提出を自動化できる」旨を明記している

### 13.2 自動化しにくいこと（GUIが主戦場）

- **PPO（Product Page Optimization）の“テスト作成・配信設定・開始”**は、少なくともAppleヘルプはGUI手順中心。\n
  したがって「スクショ作る/アップロードする」は自動化できても、**PPO自体の運用はApp Store Connect GUIに寄る**前提で設計するのが安全。

---

## 12. トラブルシューティング

### テストが承認されない

- Apple審査ガイドラインに準拠しているか確認
- スクショがApp Store審査ガイドラインに違反していないか確認

### 結果に差が出ない

- テスト期間を延長（4週間以上）
- より大きく異なるパターンで再テスト
- サンプルサイズが十分か確認