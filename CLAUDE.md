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

| ブランチ | 役割 | Railway 環境 |
|---------|------|-------------|
| `main` | Production にデプロイ済みのコード | Production（自動デプロイ） |
| `release/x.x.x` | App Store に提出するスナップショット | - |
| `dev` | 開発中のコード（= trunk） | Staging（自動デプロイ） |

#### ルール

1. **単独作業時は dev で直接開発する**（feature ブランチは作らない）
2. **並列作業時は Git Worktrees を使う**（セクション6参照）
3. **未完成の機能は Feature Flag で隠す**
4. **リリース準備ができたら dev → main にマージ**（Backend を先にデプロイ）
5. **main から `release/x.x.x` を作成**（Production と同じコード）
6. **release ブランチから App Store に提出**

#### フロー

```
dev で開発
    ↓
テスト完了 → dev を main にマージ（Production デプロイ）
    ↓
Production で動作確認
    ↓
release/x.x.x を main から作成
    ↓
release ブランチでビルド → TestFlight → App Store 提出
    ↓
承認 → 自動配布（Production は既に動いている）
    ↓
release を dev にマージ（同期）
```

**なぜこの順序か：**
- Backend を先にデプロイしないと、審査中に API が動かずリジェクトされる可能性がある
- 参照: [Christian Findlay](https://www.christianfindlay.com/blog/app-store-deployment-back-end-first)
- 参照: [Appcircle](https://appcircle.io/guides/ios/ios-releases)

#### 注意
- main ブランチに push → Production Railway に自動デプロイ
- dev ブランチに push → Staging Railway に自動デプロイ
- 同時に複数バージョンをレビューに出さない（1.2.0 承認後に 1.3.0 を提出）

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
- **ユーザーは英語または日本語で話す**（音声入力で英語が速いため）
- **回答は常に日本語で行う**（ユーザーが英語で話しても日本語で返す）
- 思考プロセスは英語でOK
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

### 5. Review Gate（codex-review）

**重要なマイルストーンで必ず codex-review SKILL を実行し、ok: true になるまで修正→再レビューを繰り返す。**

#### いつ実行するか

| タイミング | 例 |
|-----------|-----|
| Spec/Plans 更新後 | `*-spec.md` 作成・編集後 |
| 大きな実装完了後 | 5ファイル以上 / 公開API変更 / infra・config変更 |
| コミット/PR/リリース前 | `git commit` の直前 |

#### ワークフロー

```
Spec作成 → codex-review → ok: true まで修正
    ↓
実装 → codex-review → ok: true まで修正
    ↓
コミット前 → codex-review → ok: true まで修正
    ↓
コミット
```

#### ルール

1. **blocking issue が 1件でもあれば進まない**
2. **最大5回まで反復**（ok: true または max_iters 到達まで）
3. **advisory は参考情報**（ok: true でもレポートに記載）

### 6. 並列開発ルール（Git Worktrees）

**複数エージェントが同時に作業する場合の必須ルール。**

#### なぜ Worktrees か

| 他の選択肢 | 問題点 |
|-----------|--------|
| 全員 dev で作業 | コンフリクト地獄、お互いのコードが干渉 |
| feature ブランチ切り替え | stash 忘れ、コンテキスト切り替えのオーバーヘッド |
| 複数 clone | ディスク容量浪費、git history が分断 |
| **Worktrees** | ✅ 完全隔離 + 共有履歴 + 軽量 |

#### ディレクトリ構成

```
~/Downloads/
├── anicca-project/              ← メインリポジトリ（dev ブランチ）
├── anicca-feature-auth/         ← Worktree 1（feature/auth）
├── anicca-feature-nudge/        ← Worktree 2（feature/nudge）
├── anicca-fix-bug-123/          ← Worktree 3（fix/bug-123）
└── ...
```

#### 絶対禁止

- 同じブランチで複数エージェントが作業
- Worktree なしで複数タスクを並行実行

#### 必須フロー

```bash
# 1. タスク開始時に Worktree を作成
git worktree add ../anicca-<task-name> -b feature/<task-name>

# 2. Worktree ディレクトリで作業（完全隔離）
cd ../anicca-<task-name>

# 3. テスト完了後、dev にマージ
cd /path/to/anicca-project  # メインリポジトリに戻る
git checkout dev
git merge feature/<task-name>

# 4. Worktree をクリーンアップ
git worktree remove ../anicca-<task-name>
git branch -d feature/<task-name>
```

#### エージェントへの指示

- **作業開始時**: 必ず Worktree を作成してから作業を開始
- **作業終了時**: テスト完了後、ユーザーにマージ許可を求める（勝手にマージしない）

#### 並列開発時の Spec ルール

**Spec は「契約」として機能する。** 他のエージェントがその Spec を読めば、何をやっているか理解できる。

| ルール | 理由 |
|--------|------|
| **各 Worktree に独自の Spec を作成** | 干渉を避けるため |
| **触るファイルを Spec の境界に明記** | 同じファイルを複数エージェントが触らないように |
| **依存関係があれば Spec に書く** | 他タスクへの依存を可視化 |
| **共通の CLAUDE.md は全 Worktree で共有** | 一貫したルール適用 |

**Spec ファイルの配置例:**
```
anicca-feature-auth/
└── .cursor/plans/auth-spec.md       ← このタスク専用の Spec

anicca-feature-nudge/
└── .cursor/plans/nudge-spec.md      ← 別タスクの Spec
```

**Spec に書く境界の例:**
```markdown
## 境界（Boundaries）

### 触るファイル
- `Services/AuthService.swift`（新規作成）
- `Views/LoginView.swift`（修正）

### 触らないファイル
- `Views/NudgeCardView.swift`（他タスクで作業中）
- `Services/NudgeService.swift`（他タスクで作業中）
```

#### ワークツリーでのバックエンド開発

**ワークツリーからpushしてもRailwayに自動デプロイされない。**

| 状況 | Railway デプロイ |
|------|-----------------|
| dev ブランチに push | ✅ 自動デプロイ |
| ワークツリーから push | ❌ 自動デプロイされない |
| Railway CLI で手動デプロイ | ✅ 任意のブランチから可能 |

**ルール**:

1. **バックエンド変更がある場合** → Railway CLIで手動デプロイが必要
   ```bash
   cd apps/api && railway up --environment staging
   ```

2. **デプロイ完了を待ってから** バックエンド連携テストを実行（2-3分）

3. **テスト完了後** → devにマージ → Railway自動デプロイで本番反映

**フロー**:

```
ワークツリーでAPI実装
    ↓
railway up --environment staging（手動デプロイ）
    ↓
デプロイ完了待ち（2-3分）
    ↓
iOS連携テスト
    ↓
テストPASS → devにマージ
    ↓
push → Railway自動デプロイ
```

**注意**:
- 複数エージェントが同時にバックエンドをデプロイすると上書きされる
- バックエンド変更がある作業は**順番に**デプロイ＆テストする

### 7. 実機デプロイ自動化

**テスト完了後、Xcode を開かずに実機にデプロイする。**

#### 前提条件

```bash
# ios-deploy インストール（初回のみ）
brew install ios-deploy

# 動作確認
ios-deploy --detect  # 接続中の iPhone を検出
```

#### 自動デプロイコマンド

```bash
# ステージングスキームで実機にインストール
cd aniccaios && fastlane build_for_device

# 実機未接続でエラーの場合 → シミュレータで確認
cd aniccaios && fastlane build_for_simulator
# シミュレータで起動後、ユーザーに確認依頼
```

#### ワークフロー

```
Unit Tests PASS
    ↓
Integration Tests PASS
    ↓
Maestro E2E Tests PASS（シミュレータ）
    ↓
🤖「全テスト PASS しました。実機/シミュレータにインストールしますか？」
    ↓
【ユーザーが選択】
  - 実機にインストール
  - シミュレータで確認
  - 今はスキップ
    ↓
【実機選択 & 未接続の場合】→ シミュレータにフォールバック提案
    ↓
ビルド & インストール実行
    ↓
ユーザーに報告 + チェックリスト提示
    ↓
ユーザーが確認 →「OK」
    ↓
dev にマージ
```

#### デプロイ前の確認（必須）

**エージェントはテスト完了後、必ずユーザーに確認を取ってからデプロイする。**

なぜ確認が必要か:
- 他のブランチ/Worktree で作業中の可能性
- ビルドに 2-3 分かかる（待ち時間の無駄を避ける）
- デバイスが接続されていない可能性

確認メッセージの例:
```
全テスト PASS しました。

実機にインストールしますか？
- 実機にインストール（接続済み: iPhone 15 Pro）
- シミュレータで確認
- 今はスキップ（後で /deploy で実行可能）
```

**重要**:
- エージェントが自分でコマンドを実行する（ユーザーに実行させない）
- **デプロイ前に必ず確認を取る**（勝手にビルド開始しない）
- 実機未接続 → シミュレータにフォールバック提案
- 実機必須の機能（通知タップ、センサー等）の場合のみ実機を強く推奨
- TestFlightは最終確認・配布用。開発中は build_for_device または build_for_simulator

### 8. マージ前の最終確認（必須）

**エージェントは勝手にマージしない。必ずユーザーの確認を得る。**

#### エージェントが提示すべきチェックリスト

実機テスト準備完了時、以下の形式でユーザーに報告：

```markdown
## 実機テスト チェックリスト

### 基本動作
- [ ] アプリが起動する
- [ ] クラッシュしない

### 今回の変更（feature/xxx）
- [ ] [変更内容1] が正しく動作する
- [ ] [変更内容2] が正しく動作する

### リグレッション（壊れていないか）
- [ ] オンボーディングが動作する
- [ ] 通知が届く
- [ ] 既存機能が動作する

確認完了したら「OK」と言ってください。dev にマージします。
```

#### 禁止事項

- ユーザーの確認なしに dev へマージ
- チェックリストなしで「完了しました」と報告
- 実機テストをスキップして「シミュレータで確認済み」で済ませる

---

## リリース管理 Q&A

よくある質問と回答。全エージェントはこれを理解すること。

### Q1: dev で直接作業する？それとも feature ブランチ作る？

**A: 単独作業なら dev で直接。並列作業なら Worktree。**

- **単独エージェント**: dev で直接作業。Feature Flag で未完成機能を隠す。
- **複数エージェント**: 各自 Worktree を作成して隔離。完了後 dev にマージ。

### Q2: いつブランチを作るの？

**A: dev → main マージ後。** main から `release/x.x.x` を切って App Store に提出。

### Q3: main ブランチはいつ更新する？

**A: App Store 提出の前。** Backend を先に Production にデプロイするため。

```
dev → main マージ（Production デプロイ）
    ↓
main から release/x.x.x 作成
    ↓
App Store 提出
```

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

### Q9: 複数エージェントで同時に開発するときは？

**A: Git Worktrees を使う。** 各エージェントは専用の Worktree で作業する。

```bash
# エージェント1: 認証機能
git worktree add ../anicca-feature-auth -b feature/auth

# エージェント2: Nudge改善
git worktree add ../anicca-feature-nudge -b feature/nudge

# 完了後、順番に dev へマージ
```

### Q10: エージェントが勝手にマージしていい？

**A: No。絶対禁止。** 必ずユーザーが実機で確認してから。チェックリストを提示して許可を待つ。

---

## Spec ファイルの書き方（必読）

### 目的

Spec ファイルは「設計の意図が明確で、AI が読んで実装できる」レベルの詳細を含む。

> **原則: Spec は What と Why を定義する。How（実装コード）は AI に任せる。**
> — Spec-Driven Development (SDD) ベストプラクティス 2025

### Spec に書くもの / 書かないもの

| 書くもの | 書かないもの |
|---------|-------------|
| 何を解決するか（What） | 関数のボディ（実装コード） |
| なぜ必要か（Why） | テストコードの全文 |
| 受け入れ条件（テスト可能な形式） | Maestro YAML の全文 |
| データモデル / API コントラクト | 詳細なアルゴリズム |
| 主要な関数シグネチャ | コピペで動くパッチ |
| テストマトリックス（名前と対象） | - |
| 境界（やらないこと） | - |

**なぜフルパッチを書かないのか:**
- Spec が長くなりすぎてメンテ不可
- 実装とSpec両方を更新する二重作業
- レビューの意味が薄れる（既に書いてあるなら何をレビュー？）
- AI の最適化余地がゼロになる

### 必須セクション

| セクション | 内容 | 必須 |
|-----------|------|------|
| **概要** | 何を解決するか、なぜ必要か | ✅ |
| **受け入れ条件** | テスト可能な形式の成功基準 | ✅ |
| **As-Is** | 現状のコード構造/問題（概要レベル） | ✅ |
| **To-Be** | 変更後の設計（シグネチャ、データモデル） | ✅ |
| **To-Be チェックリスト** | 全 To-Be を列挙（漏れ防止） | ✅ |
| **テストマトリックス** | テスト名と対象の対応 | ✅ |
| **E2E シナリオ** | Maestro フロー名と検証項目 | ✅ |
| **Skills / Sub-agents** | 各ステージで使用するもの | ✅ |
| **境界（Boundaries）** | やらないこと、触らないファイル | ✅ |
| **ローカライズ** | 日本語/英語の追加文字列 | ✅ |
| **実行手順** | ビルド、テストコマンド | ✅ |
| **レビューチェックリスト** | レビュアー用 | ✅ |

### Skills / Sub-agents 使用マップ

Specファイルには以下を必ず記載：

| ステージ | 使用するもの | 用途 |
|---------|-------------|------|
| Spec作成 | `/plan` | 実装計画の作成 |
| テスト実装 | `/tdd-workflow` | TDDでテスト先行開発 |
| コードレビュー | `/code-review` | 実装後のレビュー |
| E2Eテスト | Maestro MCP | UIテスト自動化 |
| リリースノート | `/changelog-generator` | リリース時のchangelog作成 |
| ビルドエラー | `/build-fix` | エラー発生時の修正 |
| Spec/コードレビュー | `/codex-review` | 自動レビューゲート |

### テストマトリックス例

| # | To-Be | テスト名 | カバー |
|---|-------|----------|--------|
| 1 | Thompson Sampling でバリアント選択 | `test_selectByThompsonSampling()` | ✅ |
| 2 | 時刻固定バリアント | `test_time_specific_variant()` | ✅ |
| 3 | 2日連続無視 → 30分シフト | `test_consecutive_ignored_triggers_shift()` | ❌ |

**全ての To-Be にテストが必要。** ❌ があれば Spec は不完全。

### レビューチェックリスト

Spec レビュー時に確認すること:

- [ ] 全 To-Be がテストマトリックスに含まれているか
- [ ] 受け入れ条件がテスト可能な形式か
- [ ] 設計（シグネチャ、データモデル）が明確か
- [ ] 境界（やらないこと）が定義されているか
- [ ] ローカライズ（日英）は正しいか
- [ ] 後方互換性は保たれているか
- [ ] As-Is の問題が To-Be で解決されるか

### ユーザー GUI タスクの明記（必須）

**Spec ファイルには、ユーザーが GUI で行う作業を必ず明記する。**

#### ルール

1. **コード実装前にできるセットアップは、先にユーザーにやらせる**
   - Webhook URL 取得、API Key 取得、環境変数設定など
   - 「後でやる」は禁止。依存関係がある場合は先にやる

2. **具体的な手順を書く**（「〇〇を設定」だけはNG）
   - URL、ボタン名、画面名を明記
   - スクリーンショットがあればなお良い

3. **実装途中でユーザー確認が必要な場合は明記**
   - Maestro でテストできない項目
   - 実機でしか確認できない項目
   - 外部サービスとの連携確認

4. **Spec ファイルに専用セクションを設ける**

```markdown
## ユーザー作業（実装前）

| # | タスク | 手順 | 取得するもの |
|---|--------|------|-------------|
| 1 | Slack App 作成 | [手順へのリンク] | Webhook URL |

## ユーザー作業（実装中）

| # | タイミング | タスク | 理由 |
|---|-----------|--------|------|
| 1 | Slack 投稿テスト後 | Slack で確認 | 自動テスト不可 |

## ユーザー作業（実装後）

| # | タスク | 確認項目 |
|---|--------|---------|
| 1 | 翌日6:00確認 | 自動投稿が届くか |
```

### スキル活用

- **Spec 作成時**: `/plan` で計画
- **テスト実装時**: `/tdd-workflow` で TDD ワークフロー
- **コードレビュー時**: `/code-review` でコードレビュー
- **自動レビューゲート**: `/codex-review` でSpec/コード自動レビュー
- **リリースノート作成時**: `/changelog-generator` でchangelog生成

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
- [ ] 並列作業の場合は Worktree を作成 (`git worktree add ../anicca-<task> -b feature/<task>`)
- [ ] 作業完了後はこまめにプッシュ
- [ ] マージ前にユーザーの実機確認を待つ

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

### テストコードのベストプラクティス（2025年版）

#### AAA パターン（必須）

全てのテストは **Arrange-Act-Assert** パターンで構造化する。

```swift
func testUserLogin() {
    // Arrange: テストデータと依存関係を準備
    let mockAuth = MockAuthService()
    let viewModel = LoginViewModel(auth: mockAuth)

    // Act: テスト対象のアクションを実行
    viewModel.login(email: "test@example.com", password: "pass123")

    // Assert: 期待する結果を検証
    #expect(viewModel.isLoggedIn == true)
}
```

#### Swift Testing（Xcode 16+、推奨）

新しいテストは Swift Testing フレームワークを使う。

```swift
// XCTest（旧）
XCTAssertEqual(result, expected)
XCTAssertTrue(condition)

// Swift Testing（推奨）
#expect(result == expected)
#expect(condition)

// パラメータ化テスト（Swift Testing の強み）
@Test(arguments: ["staying_up_late", "cant_wake_up", "anxiety"])
func testProblemTypeContent(type: String) {
    let content = NudgeContent.forProblemType(type)
    #expect(content != nil)
}
```

#### FIRST 原則

| 原則 | 説明 |
|------|------|
| **F**ast | ミリ秒で完了（遅いテストは実行されない） |
| **I**solated | 他のテストに依存しない |
| **R**epeatable | 何度実行しても同じ結果 |
| **S**elf-validating | Pass/Fail が自動判定 |
| **T**horough | エッジケースもカバー |

#### テストの長さ

**目標: 10行以下。** 長いテストは複雑すぎるサイン。

### テストファイルの場所

| 種類 | パス | 命名規則 |
|------|------|----------|
| Unit Tests | `aniccaios/aniccaiosTests/` | `*Tests.swift` |
| Integration Tests | `aniccaios/aniccaiosTests/Integration/` | `*IntegrationTests.swift` |
| E2E Tests | `maestro/` | `NN-description.yaml` |

### 新機能実装時の必須フロー

```
1. Spec ファイル作成 → .cursor/plans/ios/xxx/feature-spec.md
2. /codex-review → Spec 承認
3. 🔴 失敗するテストを書く → aniccaiosTests/
4. 🟢 テストを通すコードを書く
5. 🔵 リファクタリング
6. /codex-review → 実装レビュー
7. ❓ UI変更あり？ → Yes: Maestro E2E / No: スキップ
8. ユーザーに確認 →「実機にインストールしますか？」
9. ビルド & ユーザー確認
10. 「OK」→ dev にマージ
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

### TDD vs Maestro E2E（使い分け）

**全く違う目的のテスト。Maestro は UI 変更がある時だけ。**

| 項目 | TDD (Unit/Integration) | Maestro E2E |
|------|------------------------|-------------|
| **何をテスト** | ロジック、計算、データ変換 | UI操作、画面遷移 |
| **速度** | ミリ秒〜秒 | 分 |
| **割合** | 70-90% | 10% |
| **いつ書く** | 常に（TDD サイクル） | UI 変更がある時だけ |

#### TDD でテストするもの（Unit/Integration）

```
✅ アルゴリズム（NudgeContentSelector, Thompson Sampling 等）
✅ データ変換・パース
✅ UserDefaults への保存/読み込み
✅ API レスポンスのハンドリング
✅ 日付計算、バリデーション
✅ サービス間の連携
```

#### Maestro でテストするもの（E2E）

```
✅ 画面遷移（オンボーディング、タブ切り替え）
✅ ボタンタップ → 次の画面に行くか
✅ UI 要素の表示/非表示
✅ ユーザーフロー全体
```

#### Maestro をスキップしていいケース

| 変更内容 | Maestro | 理由 |
|---------|---------|------|
| 通知ロジック修正 | ❌ スキップ | Unit Test で十分 |
| API 追加/修正 | ❌ スキップ | Integration Test で十分 |
| データモデル変更 | ❌ スキップ | Unit Test で十分 |
| 内部リファクタリング | ❌ スキップ | 既存テストが通れば OK |
| **新しいボタン追加** | ✅ 必要 | タップ動作を確認 |
| **新しい画面追加** | ✅ 必要 | 遷移を確認 |
| **オンボーディング変更** | ✅ 必要 | フロー全体を確認 |

#### 判断フロー

```
❓ UI の変更あり？
    │
    ├─→ Yes → Maestro E2E 作成
    │         （新しい画面、ボタン、遷移がある場合）
    │
    └─→ No → Maestro スキップ
              TDD + ユーザー実機確認で十分
```

### Maestro E2E テスト ベストプラクティス

#### 核心ルール

| ルール | 説明 |
|--------|------|
| **エージェントは MCP を使う** | CLI より MCP ツール優先（上記「Maestro MCP vs CLI」参照） |
| **1 Flow = 1 シナリオ** | 1つの YAML に全部詰め込まない |
| **ディレクトリで整理** | 機能ごとにサブディレクトリ |
| **タグで実行分け** | smokeTest, regression, nightly |
| **Accessibility ID 必須** | Debug ボタンではなく `.accessibilityIdentifier()` |

#### ディレクトリ構成（推奨）

```
maestro/
├── auth/
│   ├── 01-login.yaml
│   └── 02-logout.yaml
├── onboarding/
│   └── 01-full-flow.yaml
├── nudge/
│   ├── 01-nudge-display.yaml
│   └── 02-nudge-feedback.yaml
└── config.yaml  ← 共通設定
```

#### タグの使い方

```yaml
# maestro/nudge/01-nudge-display.yaml
appId: com.anicca.ios
tags:
  - smokeTest
  - nudge
---
- launchApp
```

```bash
# CI/CD での実行（GitHub Actions、fastlane等）
maestro test maestro/ --include-tags=smokeTest  # Smoke テストのみ
maestro test maestro/                            # 全テスト

# エージェント作業時は MCP を使う（上記参照）
```

#### Accessibility Identifier（Debug ボタン禁止）

| NG | OK |
|----|-----|
| `#if DEBUG` でボタンを追加 | `accessibilityIdentifier` を設定 |
| ボタンが増えてUIが汚れる | 本番UIに影響なし |
| 管理が複雑になる | シンプル・安定 |

**実装例：**
```swift
// NG: Debugボタンを追加
#if DEBUG
Button("Test LLM Generated") { ... }
#endif

// OK: Accessibility Identifierを設定
Text(nudge.content)
    .accessibilityIdentifier("nudge_content_\(nudge.isAIGenerated ? "llm" : "rule")")
```

**Maestro YAML例：**
```yaml
- assertVisible:
    id: "nudge_content_llm"
```

#### 制限事項

| 項目 | 状況 |
|------|------|
| iOS シミュレータ | ✅ 完全対応 |
| iOS 実機 | ⚠️ 直接サポートなし（BrowserStack or Maestro Cloud 経由） |

**つまり**: Maestro はシミュレータでのテスト。実機テストは `fastlane build_for_device` で別途実施。

### 実機テスト（TestFlight不要）

**ワークフロー:**
1. Unit Tests + E2E (Maestro) 完了後、`fastlane build_for_device` を実行
2. 実機未接続でエラーの場合 → シミュレータで起動して確認依頼
3. 実機でしか確認できない機能（通知タップ、センサー等）の場合のみ → 「実機にインストールしてよいですか？」と許可を取る

```bash
# ステージングスキームで実機にインストール
cd aniccaios && fastlane build_for_device

# 実機未接続でエラーの場合 → シミュレータで確認
cd aniccaios && fastlane build_for_simulator
# シミュレータで起動後、ユーザーに確認依頼
```

**重要:**
- エージェントが自分でコマンドを実行する（ユーザーに実行させない）
- 実機未接続 → シミュレータにフォールバック → ユーザーに確認依頼
- 実機必須の機能の場合のみ許可を取ってインストール
- TestFlightは最終確認・配布用。開発中は `build_for_device` または `build_for_simulator`
- Accessibility Identifierはrelease buildでも有効

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
| iOS E2Eテスト | `mcp__maestro__*` | `maestro test`（CLI） |
| RevenueCat操作 | `mcp__revenuecat__*` | - |
| App Store Connect | `mcp__app-store-connect__*` | - |

### Maestro MCP vs CLI 使い分け

| シーン | 使うもの | 理由 |
|--------|---------|------|
| テスト作成・デバッグ | MCP (`mcp__maestro__*`) | View Hierarchy 確認、1コマンドずつ実行可能 |
| CI/CD、一括実行 | CLI (`maestro test`) | スクリプト向き、GitHub Actions対応 |

**エージェント作業時のルール**:

1. **MCP を優先して使う**
   ```
   mcp__maestro__list_devices       → デバイス一覧
   mcp__maestro__inspect_view_hierarchy → 要素確認（セレクタ決定）
   mcp__maestro__run_flow           → コマンド1つずつ実行
   mcp__maestro__take_screenshot    → 結果確認
   mcp__maestro__run_flow_files     → 既存YAMLファイル実行
   ```

2. **CLI は CI/CD でのみ使う**
   ```bash
   # GitHub Actions や fastlane から実行
   maestro test maestro/
   maestro test maestro/01-onboarding.yaml --include-tags=smokeTest
   ```

3. **新しいテスト作成時のフロー**
   ```
   inspect_view_hierarchy → セレクタ確認
        ↓
   run_flow でコマンドを1つずつ試す
        ↓
   take_screenshot で確認
        ↓
   動作確認後、YAML ファイルに保存
        ↓
   run_flow_files で最終確認
   ```

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
| `codex-review` | Spec更新後、major step完了後（≥5files/公開API/infra変更）、コミット/PR/リリース前 |

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
| `/codex-review` | Codexでスペック/コードを自動レビュー |

### Fastlane（ビルド・テスト・提出）

**Fastlane を優先して使う。** xcodebuild 直接実行より簡潔で確実。

```bash
# ビルド（シミュレータ用）
cd aniccaios && fastlane build_for_simulator

# ビルド（実機用）
cd aniccaios && fastlane build_for_device

# テスト実行
cd aniccaios && fastlane test

# TestFlight へアップロード
cd aniccaios && fastlane beta

# App Store へ提出
cd aniccaios && fastlane release
```

**Fastfile**: `aniccaios/fastlane/Fastfile`

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

最終更新: 2026年1月24日（SDD ベストプラクティス、TDD vs Maestro 使い分けルール、デプロイ前確認フロー追加）
