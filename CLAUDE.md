# Anicca プロジェクト - 開発ガイドライン

## 絶対ルール

### 0. 意思決定ルール（最重要）

**選択肢を出してユーザーに決めさせるのは禁止。**

どんな場合でも：
1. ベストプラクティスを調べる
2. 自分で判断して **1つに決める**
3. その理由を述べる

❌ ダメな例：
```
「Option A, B, Cがあります。どれがいいですか？」
「手動でやる？自動でやる？」
```

✅ 良い例：
```
「自動化一択。理由：手動は忘れるリスクがある、スケールしない。
Hooksで実装する。」
```

### 1. ブランチルール（最重要）

**Trunk-Based Development + Release Branch 戦略を採用。**

#### ブランチ構成

| ブランチ | 役割 | 状態 |
|---------|------|------|
| `main` | App Store で **公開中** のコード | 承認済みのみ |
| `release/x.x.x` | App Store に **提出済み・レビュー中** | 承認待ち |
| `dev` | **開発中** のコード（= trunk） | 常に最新 |

#### ルール

1. **dev で直接開発する**（feature ブランチは作らない）
2. **未完成の機能は Feature Flag で隠す**
3. **リリース準備ができたら `release/x.x.x` を切る**
4. **App Store で承認されたら `release/x.x.x` → `main` にマージ**
5. **レビュー中は絶対に main を触らない**

#### フロー

```
dev で開発
    ↓
完成 → release/x.x.x ブランチを切る
    ↓
TestFlight でテスト
    ↓
App Store に提出
    ↓
【承認されるまで待つ】
    ↓
承認 → release/x.x.x を main にマージ
    ↓
dev で次のバージョン開発を続ける
```

#### 注意
- dev ブランチはプッシュすると自動で Railway（API）にデプロイされる
- 同時に複数バージョンをレビューに出さない（1.0.8 承認後に 1.1.0 を提出）

### 2. バージョニングルール（Semantic Versioning）

```
MAJOR.MINOR.PATCH
  │     │     └── バグ修正（後方互換あり）
  │     └──────── 新機能追加（後方互換あり）
  └────────────── 破壊的変更（後方互換なし）
```

| 変更内容 | バージョン例 |
|---------|-------------|
| バグ修正のみ | 1.0.8 → 1.0.9 |
| 新機能追加（Phase 4 等） | 1.0.8 → 1.1.0 |
| 全面リニューアル | 1.1.0 → 2.0.0 |

### 3. 後方互換ルール（超重要）

**古いバージョンのユーザーを壊さない。**

#### ルール

1. **古いコードを消す前に、最低 2〜3 バージョン待つ**
2. **新形式と古い形式の両方をサポートする移行期間を設ける**
3. **95% 以上のユーザーが新バージョンに移行したら、古いコードを削除可能**
4. **リファクタリング時は「このコードは古いバージョンで使われているか？」を必ず確認**

#### 例：通知の userInfo 形式変更

```swift
// ✅ 正しい：両方サポート
if let newFormat = userInfo["notificationTextKey"] {
    // 新形式で処理
} else if let oldFormat = userInfo["notificationText"] {
    // 古い形式で処理（後方互換）
}

// ❌ 間違い：古い形式を消す
if let newFormat = userInfo["notificationTextKey"] {
    // 新形式のみ → 古いバージョンのユーザーが壊れる
}
```

#### いつ古いコードを消していいか

| 条件 | 削除OK？ |
|------|---------|
| 新バージョンリリース直後 | ❌ |
| 2〜3 バージョン経過 | ⚠️ 要確認 |
| 95% 以上のユーザーが移行 | ✅ |
| 1〜2 ヶ月経過 | ✅ |

### 4. コミット・プッシュルール
- **フェーズごとにこまめにプッシュする**
- 大きな機能は小さなコミットに分割
- コミットメッセージは日本語でもOK

### 3. 言語ルール
- 思考は英語、回答の生成は日本語で行う
- CLAUDE.mdやドキュメントは日本語で記述

### 4. リファクタリング方針（未使用コードの扱い）

**原則: 容赦なく削除する（例外なし）**

根拠: [Avanderlee - Refactoring Swift Best Practices](https://www.avanderlee.com/optimization/refactoring-swift-best-practices/)
> 「シンプルだが非常に価値のあるアクションは、未使用コードを容赦なく削除すること」

**ルール:**
1. **今使っていないコード** → 完全削除
2. **将来使うかもしれないコード** → 削除（git historyから復元可能）
3. **`// UNUSED`コメント付きで残す** → 禁止（レガシーコードの混乱を招く）
4. **UIパターンとして参考になる** → MDファイルに記録してから削除

**記録先:**
- `.cursor/plans/future/` - 将来実装予定の機能パターン
- `.cursor/plans/ui-patterns/` - 再利用可能なUIパターン

---

## リリース管理 Q&A

よくある質問と回答。全エージェントはこれを理解すること。

### Q1: dev で直接作業する？それとも feature ブランチ作る？

**A: dev で直接作業する。** feature ブランチは作らない。未完成の機能は Feature Flag で隠す。

### Q2: いつブランチを作るの？

**A: リリース準備ができた時だけ。** `release/x.x.x` を切って App Store に提出。

### Q3: main ブランチはいつ更新する？

**A: App Store で承認された後だけ。** レビュー中は絶対に main を触らない。

### Q4: レビュー中に次のバージョンを開発していい？

**A: Yes。** dev で開発を続ける。1.0.8 がレビュー中でも、dev で 1.1.0 の開発を続けて OK。

### Q5: 古いバージョンのコードはいつ消していい？

**A: 2〜3 バージョン後、または 1〜2 ヶ月後。** 95% のユーザーが移行したら削除可能。

### Q6: Feature Flag って何？

**A: 未完成の機能を隠すスイッチ。**

```swift
if FeatureFlags.isPhase5Enabled {
    showNewFeature()  // まだ見せない
}
```

### Q7: hotfix（緊急バグ修正）はどうする？

**A: release ブランチから切って、両方にマージ。**

```
release/1.0.8 でバグ発見
  → release/1.0.8 で修正
  → dev にも cherry-pick
```

### Q8: 同時に複数バージョンをレビューに出していい？

**A: No。** 1 つずつ。1.0.8 が承認されてから 1.1.0 を提出。

---

## プロジェクト概要

### Anicca とは
行動変容をサポートするiOSアプリ。AIを活用したプロアクティブな通知で、ユーザーの「苦しみ」に寄り添う。

### 技術スタック（アクティブ）
- **iOS**: Swift, SwiftUI
- **通知**: ProblemType-based Nudge System（ルールベース）
- **API**: Node.js, Railway
- **決済**: RevenueCat, Superwall
- **分析**: Mixpanel, Singular

### 主要ディレクトリ
```
aniccaios/          - iOSアプリ本体
apps/api/           - APIサーバー
daily-apps/         - 関連アプリ（Daily Dhammaなど）
.cursor/plans/      - 計画・仕様書
.kiro/              - ステアリング・スペック
```

---
# 1. ペルソナ定義（更新版）

6-7年という要素を追加した完全なペルソナ定義です：

## Aniccaターゲットペルソナ

### 基本属性

| 項目 | 定義 |
|------|------|
| **年齢** | 25〜35歳 |
| **性別** | 男女問わず（動画データでは女性が反応多め） |
| **地域** | 日本 / 英語圏 |
| **ライフステージ** | 社会人、一人暮らしまたはパートナーあり |

### コア・ペイン（最重要）

> **「6〜7年間、主体性の欠如と自己嫌悪のループから抜け出せていない」**

```
6〜7年前から同じ問題を抱えている
      ↓
様々な習慣アプリを試した（10個以上）
      ↓
全部3日坊主で終わった
      ↓
「自分はダメな人間だ」と信じ込んでいる
      ↓
もう諦めている / 変われないと思っている
      ↓
でも心のどこかでは変わりたい
```

### 具体的な状況

| 状況 | 内面の声 | 期間 |
|------|---------|------|
| 夜更かしでスマホを見続ける | 「また3時だ…やめなきゃ…」 | 6-7年 |
| 朝起きられずスヌーズ10回 | 「また遅刻する…自分最悪」 | 6-7年 |
| 習慣アプリをインストール | 「今度こそ！」→3日後削除 | 10回以上 |
| 自分との約束を破る | 「どうせまた無理」 | 何百回も |

### 過去に試したもの（失敗リスト）

- Habitica、Streaks、Habitify等の習慣トラッカー
- 瞑想アプリ（Calm、Headspace等）
- ポモドーロタイマー
- 早起きチャレンジ
- 日記アプリ
- 筋トレアプリ
- **全部3日〜1週間で挫折**

### 心理的特徴

| 特徴 | 詳細 |
|------|------|
| **自己信頼ゼロ** | 「自分との約束は守れない」が前提 |
| **諦めモード** | 変わろうとすること自体が怖い |
| **隠れた渇望** | 本当は変わりたい。でも言えない |
| **他者依存傾向** | 自分では無理だから誰かに引っ張ってほしい |
And also I've already done the 

## iOSアプリ現在の実装状況（2026年1月時点）

### タブ構成（2タブ）

| タブ | View | 内容 |
|------|------|------|
| My Path | `MyPathTabView` | ユーザーの問題一覧、Tell Anicca、DeepDive |
| Profile | `ProfileView` | Name, Plan, Data Integration, Nudge Strength |

### オンボーディングフロー

```
welcome → value → struggles → notifications → att → complete
```

| ステップ | View | 説明 |
|---------|------|------|
| welcome | `WelcomeStepView` | アプリ紹介 |
| value | `ValueStepView` | アプリの価値説明 |
| struggles | `StrugglesStepView` | 13個の問題から選択 |
| notifications | `NotificationPermissionStepView` | 通知許可 |
| att | `ATTPermissionStepView` | ATT許可 |

### 13個の問題タイプ（ProblemType）

```swift
staying_up_late, cant_wake_up, self_loathing, rumination,
procrastination, anxiety, lying, bad_mouthing, porn_addiction,
alcohol_dependency, anger, obsessive, loneliness
```

### 通知システム

| 機能 | Scheduler | 画面 |
|------|-----------|------|
| Problem Nudge | `ProblemNotificationScheduler` | `NudgeCardView` |
| cantWakeUp Alarm | `ProblemAlarmKitScheduler` | AlarmKit (iOS 26+) |
| Server Nudge | `NotificationScheduler` | - |

**NudgeCardView**: 通知タップで1枚カード表示。問題に応じて1択or2択ボタン、👍👎フィードバック。

### 重要な注意事項

1. **ProblemTypeベース**: 全ての通知は`ProblemType`に基づく。HabitTypeシステムは完全削除済み。
2. **音声機能**: 削除済み（OpenAI Realtime API、VoiceSessionController等）。
3. **NotificationScheduler**: 認可とサーバーNudgeのみ担当（約140行）。

---

## 開発ワークフロー

### Kiroスタイル開発（オプション）
大規模な機能開発時に使用：

1. `/kiro:steering` - ステアリング更新
2. `/kiro:spec-init` - 仕様初期化
3. `/kiro:spec-requirements` - 要件定義
4. `/kiro:spec-design` - 設計
5. `/kiro:spec-tasks` - タスク生成
6. `/kiro:spec-status` - 進捗確認

### パス
- ステアリング: `.kiro/steering/`
- スペック: `.kiro/specs/`
- コマンド: `.claude/commands/`

---

## チェックリスト（作業開始時）

- [ ] devブランチにいることを確認 (`git branch`)
- [ ] 最新のdevをプル (`git pull origin dev`)
- [ ] 作業完了後はこまめにプッシュ

---

## TDD & テスト戦略（必須）

### 📐 テストピラミッド

```
        /\
       /  \      E2E Tests (10%) ← Maestro
      /____\
     /      \    Integration Tests (20%) ← XCTest
    /________\
   /          \  Unit Tests (70%) ← Swift Testing / XCTest
  /______________\
```

| レイヤー | 割合 | 速度 | ツール | 何をテストするか |
|---------|------|------|--------|-----------------|
| Unit Tests | 70% | ミリ秒 | Swift Testing / XCTest | 1つの関数・メソッド |
| Integration Tests | 20% | 秒 | XCTest + Mock | 複数のサービス連携 |
| E2E Tests | 10% | 分 | Maestro | ユーザーフロー全体 |

### 🔴🟢🔵 TDD サイクル（必ず従う）

```
1. 🔴 RED    → 失敗するテストを書く（機能を定義）
2. 🟢 GREEN  → テストを通す最小限のコードを書く
3. 🔵 REFACTOR → コードを綺麗にする（テストは緑のまま）
4. 🔁 REPEAT → 次の機能へ
```

**なぜ TDD？**
- バグを**コミット時**に検出（デプロイ後じゃない）
- 設計が強制的に良くなる（テストしやすい = 良い設計）
- リファクタリングが怖くなくなる

### テストファイルの場所

| 種類 | パス | 命名規則 |
|------|------|----------|
| Unit Tests | `aniccaios/aniccaiosTests/` | `*Tests.swift` |
| Integration Tests | `aniccaios/aniccaiosTests/Integration/` | `*IntegrationTests.swift` |
| E2E Tests | `maestro/` | `NN-description.yaml` |

### 新機能実装時の必須フロー

```
1. Spec ファイル作成 → .cursor/plans/ios/xxx/feature-spec.md
2. 🔴 失敗するテストを書く → aniccaiosTests/
3. 🟢 テストを通すコードを書く
4. 🔵 リファクタリング
5. Maestro E2E を書く → maestro/
6. ビルド確認 → fastlane build_for_device
7. 全テスト PASS 確認 → xcodebuild test
8. PR / release ブランチ作成
```

### テスト実行コマンド

```bash
# Unit Tests + Integration Tests
cd aniccaios && xcodebuild test \
  -project aniccaios.xcodeproj \
  -scheme aniccaios-staging \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.2' \
  -only-testing:aniccaiosTests \
  | xcpretty

# E2E Tests (Maestro)
maestro test maestro/

# 個別 E2E
maestro test maestro/01-onboarding.yaml
```

### GitHub Actions CI/CD（自動化）

PR がプッシュされると自動で実行：

```
1. Unit Tests → 失敗したら PR ブロック
2. Integration Tests → 失敗したら PR ブロック
3. E2E Tests (Maestro) → 失敗したら PR ブロック
4. Build → 成功したら TestFlight アップロード可能
```

### デバッグ UI ルール

- **`#if DEBUG` で囲む** → 本番ビルドには含まれない
- **目的**: 開発中のテスト効率化のみ
- **Maestro でも使える**: デバッグボタンをタップして状態をシミュレート可能

---

## ユーザー情報

- 日本語ネイティブ
- iOSアプリ開発者
- App Store提出経験あり
- TikTokでのプロモーションを計画中

---

## ツール・スキル・MCP 使用ルール

### MCP優先（内蔵ツールより優先）

| タスク | 使うべきMCP | 使わない |
|--------|------------|----------|
| Web検索 | `mcp__exa__web_search_exa` | WebSearch |
| ドキュメント検索 | `mcp__context7__query-docs` | WebFetch |
| Apple公式ドキュメント | `mcp__apple-docs__*` | WebFetch |
| コード検索・編集 | `mcp__serena__*` | Grep, Read |
| iOS実機テスト | `mcp__maestro__*` | - |
| RevenueCat操作 | `mcp__revenuecat__*` | - |
| App Store Connect | `mcp__app-store-connect__*` | - |

### スキル自動適用

| スキル | いつ使う |
|--------|---------|
| `agent-memory` | 「記憶して」「思い出して」、または重要な発見時 |
| `content-creator` | 日報作成、SNS投稿作成時 |
| `ui-skills` | UI/UXの実装・レビュー時 |
| `changelog-generator` | リリースノート作成時 |
| `content-research-writer` | コンテンツ作成時 |
| `coding-standards` | コードを書くとき（Swift/SwiftUI規約） |
| `tdd-workflow` | テストを書くとき（TDD方法論） |

### Serena MCP（コード作業時必須）

| タスク | Serenaツール |
|--------|-------------|
| ファイル検索 | `mcp__serena__find_file` |
| パターン検索 | `mcp__serena__search_for_pattern` |
| シンボル検索 | `mcp__serena__find_symbol` |
| シンボル編集 | `mcp__serena__replace_symbol_body` |
| メモリ読み書き | `mcp__serena__read_memory` / `write_memory` |

### サブエージェント活用

| タスク | エージェント |
|--------|-------------|
| コードベース探索 | `Explore` |
| 実装計画 | `planner` |
| 設計判断 | `architect` |
| テスト駆動開発 | `tdd-guide` |
| テスト作成 | `test-automation-engineer` |
| コードレビュー | `code-quality-reviewer` |
| セキュリティ監査 | `security-auditor` |
| 技術調査 | `tech-spec-researcher` |
| ビルドエラー修正 | `build-error-resolver` |
| 不要コード削除 | `refactor-cleaner` |

### 開発コマンド（/xxx で呼び出し）

| コマンド | 用途 |
|---------|------|
| `/plan` | 機能実装前に計画を立てる |
| `/tdd` | テスト駆動開発で実装する |
| `/code-review` | コミット前にレビューする |
| `/build-fix` | ビルドエラーを修正する |
| `/refactor-clean` | 不要コードを削除する |
| `/test-coverage` | テストカバレッジを確認・改善する |

---

## ペルソナ（全ての判断基準）

**ターゲット**: 6-7年間、習慣化に失敗し続けている25-35歳

### コア・ペイン
- 習慣アプリを10個以上試して全部3日坊主で挫折
- 「自分はダメな人間だ」と信じ込んでいる
- 諦めモードだが、心の奥では変わりたい
- 自分との約束を何百回も破ってきた

### コンテンツ・UI判断基準
- **刺さるHook**: 「6年間、何も変われなかった」「習慣アプリ10個全部挫折」
- **避けるHook**: 「簡単に習慣化！」「たった○日で！」（信じない、警戒する）
- **UI設計**: 挫折を前提に、責めない、小さすぎるステップ

**詳細**: `.claude/skills/agent-memory/memories/core/anicca-persona-absolute.md`

---

## セッション開始時の必須アクション

1. devブランチにいることを確認
2. ペルソナを意識（上記参照）
3. 関連するSerenaメモリを確認

---

## 実装完了時の必須アクション

**CLAUDE.mdを常に最新に保つこと！**

実装が完了したら、以下を更新：

1. **iOSアプリ現在の実装状況** セクション
   - タブ構成の変更
   - オンボーディングフローの変更
   - 新機能の追加
   - レガシーコードの削除状況

2. **技術スタック** セクション
   - 新しいライブラリ/フレームワークの追加
   - 削除されたもの

3. **最終更新日** を必ず更新

**理由**: AIエージェントの混乱を防ぎ、常に正確なコードベース理解を維持するため。

---

---

## 日報

開発ログは `.cursor/logs/` に日付ごとに記録。

- 形式: `YYYY-MM-DD.md`
- 内容: その日やったこと、バージョン情報、次にやること

---

最終更新: 2026年1月21日
