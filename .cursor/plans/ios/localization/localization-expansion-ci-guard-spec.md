## 概要

Anicca iOS を **日本語/英語 + 追加4言語（de/fr/es/pt-BR）** にローカライズ拡張し、同時に「翻訳漏れ（＝一部が英語のまま等）」を **CIで検出して出荷不能**にする。

本Specは「何を/なぜ」を固定し、実装（How）はこのSpecに従って進める。

---

## 背景（Why）

### いま起きている問題

| # | 問題 | 具体例 | リスク |
|---|------|--------|--------|
| 1 | 画面内の一部だけ別言語になる | `Text("Please Sign In")` のような直書きが残ると、端末/アプリ言語変更で混在 | CVR低下 + 品質低下 |
| 2 | 通知の言語がUIと一致しない | サーバーが返す `message` をそのまま通知本文に使うと、ユーザーの言語設定とズレる | 継続率/信頼の低下 |
| 3 | 言語追加で “漏れ” が指数的に増える | 言語が2→6になると、人力確認のコストが爆発 | リリース速度低下 |

### 絶対に達成したいこと

| ゴール | 定義 |
|---|---|
| 漏れない | 直書き/未翻訳があると **CIが落ちる**（出荷できない） |
| 一貫する | 画面/通知/課金導線で **同一の言語ソース**を使う |
| 伸びる | 追加言語が “支払いが強い市場” を広くカバーする |

---

## 対象言語（決定）

| 追加言語 | ロケール | 主要ターゲット | 選定理由（要点） |
|---|---|---|---|
| ドイツ語 | `de` | DACH | iOS課金が強い欧州市場。英語のみはCVRが落ちやすい |
| フランス語 | `fr` | FR/BE/CH/CA(一部) | 大型課金市場。ASO/ストアCVR改善が狙える |
| スペイン語 | `es` | ES + 中南米(一部) | 1言語で広範囲カバー。クリエイティブ横展開が容易 |
| ポルトガル語(ブラジル) | `pt-BR` | BR | 巨大市場。現地語で心理的障壁が下がる |

### 意図的に今回やらない言語（境界）

| 言語 | 理由 |
|---|---|
| 韓国語 | 方針として「富豪になってから」＝今回は対象外 |
| RTL言語（例: アラビア語） | UI検証/崩れ対応コストが跳ね上がるため、まず “漏れない基盤” を先に固める |

---

## As-Is（現状）

| 領域 | 現状 | 備考 |
|---|---|---|
| 文字列 | `Localizable.strings` が `en.lproj` / `ja.lproj` のみ | `.xcstrings` は未導入 |
| SwiftUI | `String(localized:)` が多いが、`Text("...")` 直書きも残存 | 直書きは漏れの原因 |
| 通知（Problem） | `NSLocalizedString(key)` でキー参照（良い） | 一部はユーザー情報にキーを保存 |
| 通知（Server-driven） | `message` をそのまま通知本文に利用 | サーバー文言が英語固定なら必ずズレる |
| 言語ソース | OS言語 + `preferredLanguage` + サーバーの文言が混在 | “日本語アカなのに英語が混ざる” 根本原因になりうる |

---

## To-Be（変更後の設計）

### 1) 言語ソース（Single Source of Truth）

**決め:** アプリ内で使う表示言語は `AppState.userProfile.preferredLanguage` を正とし、未設定の場合のみ OS 言語にフォールバックする。

| ルール | 目的 |
|---|---|
| UI/通知/アクションタイトルなど、文字列の解決は同じ仕組みを使う | 混在を根絶 |
| “OS言語” と “アカウント言語” を同時に参照しない | 事故を減らす |

#### 想定API（シグネチャ例）

| 機能 | シグネチャ（案） |
|---|---|
| 現在の表示言語 | `AppLanguageResolver.currentLanguage(appState:) -> AppLanguage` |
| バンドル解決 | `LocalizationBundleProvider.bundle(for:) -> Bundle` |
| 文字列取得 | `L10n.t(_ key: String) -> String`（内部でBundleを参照） |

> 注: 具体実装はこのSpecでは固定しない（How）。ただし「どこから言語を取るか」「混在を許さない」は固定。

### 2) 文字列資産の正規化

**決め:** 文字列は **String Catalog（`.xcstrings`）に寄せる**。ただし移行期間は `.strings` と併存を許す。

| 方針 | 理由 |
|---|---|
| `.xcstrings` で言語追加時のMissingを可視化 | 追加言語で事故らない |
| `.strings` は移行期間のみ残す | 既存資産が大きいので段階移行が安全 |

### 3) 型安全（キーのタイポを潰す）

**決め:** SwiftGen（または同等）で `L10n.*` を生成し、コードからは **生キー参照を原則禁止**。

| ルール | 例 |
|---|---|
| NG | `String(localized: "mypath_header_description")`（生キー） |
| OK | `Text(L10n.mypathHeaderDescription)`（生成定数） |

### 4) CIでの “漏れ” ガード（最重要）

**決め:** 以下のどれか1つでも検出したらCIをFailにする。

| # | 何を落とすか | 検出方法（案） | 例 |
|---|---|---|---|
| 1 | SwiftUI直書き（production領域） | SwiftLint custom rule（regex） | `Text("Please Sign In")` |
| 2 | `NSLocalizedString("...")` の生キー（段階的に） | SwiftLint custom rule | 生キーのタイポ事故防止 |
| 3 | 言語ファイルに存在しないキー参照 | 生成コード（SwiftGen）によりコンパイル時に検知 | `L10n.xxx` が存在しない |
| 4 | 追加言語の翻訳が未投入（重要キー群） | “必須キーリスト”の存在チェック（スクリプト） | onboarding/main/notifications/paywallの最重要 |

---

## 受け入れ条件（Acceptance Criteria）

| # | 条件 | 期待結果 |
|---|---|---|
| 1 | `de/fr/es/pt-BR` がiOSプロジェクトに追加されている | Xcode上で各ロケールが認識される |
| 2 | オンボーディング→メイン→通知→設定→課金導線の主要文言が全言語で表示される | 主要導線で混在が起きない |
| 3 | production領域に “直書き文字列” が残っている場合、CIがFailする | 「忘れて出荷」が不可能 |
| 4 | 通知（Server-driven）の言語がアプリの表示言語と一致する | 日本語ユーザーに英語通知が出ない |
| 5 | 既存の `en/ja` の表示が壊れていない | 既存ユーザーの体験が維持される |

---

## To-Be チェックリスト

| # | To-Be | 完了条件 |
|---|---|---|
| 1 | 追加4言語（de/fr/es/pt-BR）をプロジェクトに追加 | ビルド成果物に各lprojが含まれる |
| 2 | 文字列を `.xcstrings` 中心へ移行開始 | String Catalogが導入される |
| 3 | 型安全な参照方式を導入（SwiftGen等） | 生キー参照が段階的に減る |
| 4 | CIで直書き/未翻訳を検出してFail | GitHub ActionsでFailする |
| 5 | 言語ソースを一本化（UI/通知の整合） | 混在が再現しない |
| 6 | 運用ドキュメントを追加 | 次回以降の手順が迷子にならない |

---

## テストマトリックス（実装時）

| # | To-Be | テスト種別 | テスト名（案） | カバー |
|---|---|---|---|---|
| 1 | 言語ソース一本化 | Unit | `test_resolveLanguage_prefersUserProfile()` | ✅ |
| 2 | Bundle解決 | Unit | `test_bundleForLanguage_fallbackToMain()` | ✅ |
| 3 | CI直書き検出 | CI | `lint_no_hardcoded_strings` | ✅ |
| 4 | 必須キー存在チェック | CI | `lint_required_localization_keys` | ✅ |
| 5 | Server-driven通知の言語一致 | Integration（可能なら） | `test_serverDrivenNudge_usesPreferredLanguage()` | ⚠️（API依存） |

---

## E2Eシナリオ（UI変更がある場合のみ）

| Flow | 目的 | 期待 |
|---|---|---|
| `onboarding/full-flow` | 主要導線の表示確認 | 各画面でキーが漏れていない |
| `main/mypath` | メイン画面の見出し/ボタン | 混在がない |
| `notification/open-nudge-card` | 通知タップ→カード | 文言が正しい言語で表示 |

---

## ユーザー作業（あなた側 / GUI）

### 実装前（先にやる）

| # | 対象 | タスク | 成果物 |
|---|---|---|---|
| 1 | Superwall | Paywallの4言語分ローカライズ投入（タイトル/CTA/説明/FAQ等） | Superwall上でロケール別に表示 |
| 2 | App Store Connect | 4言語分のメタデータ（説明/サブタイトル/キーワード等） | 各ロケールのストア情報 |
| 3 | App Store Connect | サブスク表示名/説明のローカライズ（必要なら） | ストア購入導線の現地語化 |

### 実装中（必要に応じて）

| # | タイミング | タスク | 理由 |
|---|---|---|---|
| 1 | 主要文言が揃った段階 | 4言語のTikTokスライドショー文案を確定 | クリエイティブ制作を並走するため |

### 実装後（確認）

| # | タスク | 確認項目 |
|---|---|---|
| 1 | 端末/アプリ言語を切替 | UIと通知の言語が一致する |
| 2 | Superwall表示確認 | Paywallの言語が一致する |

---

## 実装手順（私がやる / コード）

| # | ステップ | 触る可能性が高い領域 |
|---|---|---|
| 1 | String Catalog導入（移行の土台） | `aniccaios/Resources/*` |
| 2 | 4言語ロケール追加（lproj / catalog） | Xcode project settings / Resources |
| 3 | 直書き文字列の置換（productionのみ） | `aniccaios/aniccaios/**` |
| 4 | 型安全参照（SwiftGen等）導入 | build scripts / 生成ファイル / 呼び出し置換 |
| 5 | CIガード追加（SwiftLint+スクリプト） | `.github/workflows/*`, `.swiftlint.yml` 等 |
| 6 | 通知の言語整合（Server-driven） | iOS側 + 必要ならAPIに言語ヘッダ/パラメータ |
| 7 | 運用ドキュメント作成 | `.cursor/plans/ios/localization/*` |

---

## Skills / Sub-agents

| ステージ | 使用するもの | 用途 |
|---|---|---|
| Spec確定 | `/plan` | 実装計画の精緻化 |
| 実装 | `/coding-standards` | Swift/SwiftUI規約順守 |
| CI設計 | `tech-spec-researcher` | iOSローカライズCIの実務パターン整理 |
| 実装レビュー | `/codex-review` | Review Gate（ok: trueまで修正） |
| コード品質 | `code-quality-reviewer` | 直書き検知ルールの妥当性チェック |

---

## 境界（Boundaries）

### 触るファイル（想定）

| 種別 | パス例 |
|---|---|
| ローカライズ資産 | `aniccaios/Resources/**` |
| UI | `aniccaios/aniccaios/Views/**`, `Onboarding/**`, `Settings/**` |
| 通知 | `aniccaios/aniccaios/Notifications/**`, `AniccaNotificationService/**` |
| CI | `.github/workflows/**`, `*.swiftlint*`, `scripts/**`（新規） |

### 触らない（今回の対象外）

| 対象外 | 理由 |
|---|---|
| `#if DEBUG` のデバッグUI（State Injection等） | ユーザー要望「productionのみ」 |
| Venus/Debug用のUI | ユーザー要望 |
| RTL対応が必要な言語追加 | 今回の目的（漏れない基盤）を優先 |

---

## ローカライズ（追加される文字列）

追加4言語では、まず既存 `en/ja` と同じキー集合を対象にする。

| 種類 | 対象 |
|---|---|
| UI | オンボーディング / タブ / 設定 / My Path / Profile 等 |
| 通知 | Problem通知のタイトル/本文/詳細、通知アクション |
| 課金導線 | アプリ内表示文言（Superwall内はあなた側で対応） |

---

## 実行手順（コマンド）

| 目的 | コマンド例 |
|---|---|
| iOSテスト | `cd aniccaios && fastlane test` |
| Lint（CI相当） | `cd aniccaios && swiftlint`（導入後） |

---

## レビューチェックリスト

| # | 観点 | 確認 |
|---|---|---|
| 1 | 言語ソースが一本化されているか | [ ] |
| 2 | production領域に直書きが残っていないか | [ ] |
| 3 | 追加4言語で主要導線が欠けていないか | [ ] |
| 4 | CIが “漏れ” を確実に落とすか | [ ] |
| 5 | 既存 `en/ja` の挙動が壊れていないか | [ ] |

