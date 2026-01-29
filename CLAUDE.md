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

### 0.1 自律的ベストプラクティス検索（絶対ルール）

**技術判断する前に、必ずベストプラクティスを検索する。ユーザーに言われなくても。**

#### 対象（以下のいずれかに該当する場合）

| 判断カテゴリ | 例 |
|-------------|-----|
| アーキテクチャ変更（3ファイル以上） | 新しいサービス層追加、データフロー変更 |
| API設計・データモデル変更 | エンドポイント追加、スキーマ変更 |
| 外部依存ライブラリの選定・更新 | SDK選定、バージョンアップ |
| パフォーマンス・セキュリティ判断 | キャッシュ戦略、認証方式 |
| 新しいパターンやフレームワーク導入 | 状態管理、テストフレームワーク |

#### 検索手段（優先順）

| 優先度 | 手段 | 用途 |
|--------|------|------|
| 1 | `mcp__exa__web_search_exa` | 最新Web情報・ベストプラクティス |
| 2 | `mcp__context7__query-docs` | ライブラリ公式ドキュメント |
| 3 | `mcp__apple-docs__*` | Apple公式ドキュメント |
| 4 | `.claude/rules/`, `.cursor/plans/` | プロジェクト内の既存ルール・決定 |

#### ワークフロー

```
技術判断が必要な場面を検出
    ↓
自動的にベストプラクティスを検索（ユーザーの指示不要）
    ↓
1つに決める（選択肢を出さない）
    ↓
理由を述べる（ソースリンク付き）
```

### 0.5 出力形式ルール

**説明・チェックリスト・比較は常にテーブル形式で出力する。**

### 0.6 テスト範囲ルール

**テストは実装した部分だけ。変更していないものはテストしない。**

手動テストチェックリストを作る時：
- 今回の実装で変更・追加したものだけをリストに入れる
- 変更していない既存機能（リグレッションテスト）は含めない
- 「念のため」で無関係な項目を追加しない

長文の箇条書きは読みにくい。以下の場合は必ずテーブルを使う：
- チェックリスト
- 手順説明
- 比較
- ステータス報告

❌ ダメな例：
```
- [ ] アプリが起動する
- [ ] クラッシュしない
- [ ] オンボーディング完了後、Paywall が表示される
```

✅ 良い例：
| # | カテゴリ | テスト項目 | 確認 |
|---|---------|-----------|------|
| 1 | 基本動作 | アプリが起動する | [ ] |
| 2 | 基本動作 | クラッシュしない | [ ] |
| 3 | オンボーディング | Paywall 表示 | [ ] |

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
6. **release ブランチから App Store に提出（Fastlane で全自動）**

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
fastlane set_version version:x.x.x（バージョン自動更新）
    ↓
fastlane full_release（Archive → Upload → 処理待ち → 審査提出 全自動）
    ↓
承認 → 自動配布（Production は既に動いている）
    ↓
release を dev にマージ（同期）
```

#### エージェント向けリリース手順（完全自動化）

ユーザーが「X.Y.Z をリリースして」と言ったら、エージェントが以下を実行:

```bash
# 1. main を最新にして release ブランチ作成
git checkout main && git pull origin main
git checkout -b release/X.Y.Z

# 2. バージョン更新（必須: 忘れると Apple Validation エラー）
cd aniccaios && FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_OPT_OUT_CRASH_REPORTING=1 fastlane set_version version:X.Y.Z

# 3. コミット & プッシュ
cd .. && git add -A && git commit -m "chore: bump version to X.Y.Z

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
git push -u origin release/X.Y.Z

# 4. 全自動リリース（Archive → Upload → 処理待ち → 審査提出）
cd aniccaios && FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_OPT_OUT_CRASH_REPORTING=1 fastlane full_release

# 5. 結果報告
# 「Build #XX (vX.Y.Z) が審査に提出されました。Waiting for Review です。」

# 6. release → dev にマージ（バージョン更新を同期）
cd .. && git checkout dev && git merge release/X.Y.Z && git push origin dev
```

#### リリースエラー時のリカバリ

| エラー | 原因 | 対処 |
|--------|------|------|
| `Invalid Pre-Release Train` | バージョンが古い/閉じている | `fastlane set_version version:正しいバージョン` で修正 |
| `CFBundleShortVersionString must be higher` | バージョンが前回以下 | バージョン番号を上げて再実行 |
| build 失敗 | コンパイルエラー | Fastlane CLI 出力を読んで修正 → `fastlane full_release` 再実行 |
| upload 失敗 | ネットワーク/認証 | `cd aniccaios && fastlane upload` を再実行 |
| processing タイムアウト | Apple 側の遅延 | ASC で確認 → `fastlane submit_review` を個別実行 |
| submit 失敗 | コンプライアンス問題 | ASC で確認 → Fastfile の `submission_information` 修正 |

#### ロールバック手順

```bash
git checkout dev
git branch -D release/X.Y.Z
git push origin --delete release/X.Y.Z
```

**なぜこの順序か：**
- Backend を先にデプロイしないと、審査中に API が動かずリジェクトされる可能性がある
- 参照: [Christian Findlay](https://www.christianfindlay.com/blog/app-store-deployment-back-end-first)
- 参照: [Appcircle](https://appcircle.io/guides/ios/ios-releases)

#### Railway サービス名（重要: 環境ごとに名前が違う）

| 環境 | API サービス | Cron サービス |
|------|-------------|--------------|
| **Staging** | `API` | `nudge-cron` |
| **Production** | `API` | `nudge-cronp` |

**⚠️ Production の Cron は `nudge-cronp`（末尾に `p`）。`nudge-cron` は Staging 用。**

#### Railway 環境変数（各サービス）

| 変数 | API (Staging/Prod) | nudge-cron (Staging) | nudge-cronp (Prod) |
|------|-------------------|---------------------|-------------------|
| `CRON_MODE` | なし | `nudges` | `nudges` |
| `PROXY_BASE_URL` | あり | なし（不要） | なし（不要） |
| `DATABASE_URL` | あり | あり（internal） | あり（internal） |
| `OPENAI_API_KEY` | あり | あり | あり |
| `ANTHROPIC_API_KEY` | あり | なし | なし |

**⚠️ `CRON_MODE` は truthy チェック（`!!process.env.CRON_MODE`）。値は `nudges` 等何でもOK。**

環境変数設定時の例:
```bash
# Staging
railway variables --set "KEY=value" --service "nudge-cron"

# Production
railway variables --set "KEY=value" --service "nudge-cronp"
```

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

### 5. 3ゲート開発ワークフロー（Spec → TDD → Review）

**品質はSpecだけで担保しない。3つのゲートが各自の責任を持つ。**

> **原則: Specは設計（What/Why）、TDDは正しさ（テスト）、codex-reviewは品質（レビュー）を担保する。**
> Specにパッチレベルの詳細を書く必要はない。各ゲートが責任を分担する。

```
┌─────────────────────────────────────────┐
│ GATE 1: SPEC（設計ゲート）               │
│ - コア6セクションを書く（下記参照）       │
│ - codex-review → ok: true               │
│ 担保: 設計の漏れ・矛盾                   │
├─────────────────────────────────────────┤
│ GATE 2: IMPLEMENT（TDDゲート）           │
│ - Specを読んで RED → GREEN → REFACTOR   │
│ - AIが実装コードを生成                    │
│ 担保: テストが正しさを証明               │
├─────────────────────────────────────────┤
│ GATE 3: REVIEW（コードゲート）           │
│ - codex-review → ok: true               │
│ - ユーザー実機確認                       │
│ 担保: 品質・セキュリティ・整合性         │
├─────────────────────────────────────────┤
│ COMMIT                                   │
└─────────────────────────────────────────┘
```

#### codex-review ルール

1. **blocking issue が 1件でもあれば次のゲートに進まない**
2. **最大5回まで反復**（ok: true または max_iters 到達まで）
3. **advisory は参考情報**（ok: true でもレポートに記載）

#### codex-review 実行タイミング

| ゲート | タイミング | 何をレビュー |
|--------|-----------|-------------|
| GATE 1 | Spec作成・更新後 | 設計の漏れ・矛盾・受け入れ条件の抜け |
| GATE 3 | 大きな実装完了後（5ファイル以上 / 公開API / infra変更） | コード品質・セキュリティ |
| GATE 3 | コミット/PR/リリース前 | 最終チェック |

#### なぜSpecをライトに保てるか

| 懸念 | 担保するゲート |
|------|---------------|
| 「設計が間違ってたらどうする？」 | GATE 1: codex-reviewがSpecをレビュー |
| 「実装が正しいか分からない」 | GATE 2: TDDのテストが証明 |
| 「コード品質は？セキュリティは？」 | GATE 3: codex-reviewが実装をレビュー |
| 「全体として動くか？」 | GATE 3: ユーザー実機確認 |

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
| **Specに開発環境セクションを必ず記載** | 他エージェントがどこで作業しているか把握するため |

**開発環境セクション（Spec冒頭に必須）:**
```markdown
## 開発環境

| 項目 | 値 |
|------|-----|
| **ワークツリーパス** | `/Users/cbns03/Downloads/anicca-<task>` |
| **ブランチ** | `feature/<task>` |
| **ベースブランチ** | `dev` |
| **作業状態** | 実装中 / レビュー待ち / 完了 |
```

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

### 9. API 後方互換性ルール（超重要）

**古いバージョンのユーザーを壊さない。モバイルアプリは即座にアップデートされない。**

参照: [Endgrate](https://endgrate.com/blog/api-versioning-best-practices-for-backward-compatibility), [ITNEXT](https://itnext.io/that-simple-backend-change-just-broke-our-mobile-app-76676c0dfbe8)

#### 禁止（Destructive Changes）

| 変更 | 結果 |
|------|------|
| エンドポイント削除 | 古いアプリが 404 エラー |
| レスポンスフィールド削除 | 古いアプリがパースエラー |
| レスポンス型変更 | 古いアプリがパースエラー |
| 必須パラメータ追加 | 古いアプリが 400 エラー |
| 認証方式変更 | 古いアプリが 401 エラー |

#### 許可（Additive Changes）

| 変更 | 理由 |
|------|------|
| 新規エンドポイント追加 | 古いアプリは呼ばない |
| オプショナルフィールド追加 | 古いアプリは無視する |
| 新規テーブル追加 | 既存クエリに影響なし |

#### 削除したい場合のルール

1. **6ヶ月前に deprecated 通知**
2. **移行ガイド提供**
3. **95% 以上が新バージョンに移行したら削除可能**

#### 例：Nudge API 削除の教訓

```
❌ やってはいけないこと:
- /api/mobile/nudge/trigger を削除
- 古いアプリが壊れる

✅ やるべきこと:
- 新しいエンドポイントを追加
- 古いエンドポイントは 6ヶ月維持
- 95% 移行後に削除
```

### 10. Landing Page (Netlify) デプロイルール

**確認前に dev にマージ/push するのは禁止。**

#### 重要: dev push = 自動デプロイ

**dev ブランチに push すれば Netlify は自動でビルド・デプロイする。**

| やること | 結果 |
|---------|------|
| dev に push | ✅ 自動でビルド・デプロイ |
| `netlify status` で確認 | ❌ 無駄（push すれば動く） |
| API で deploy 状態確認 | ❌ 無駄（push すれば動く） |

**エージェントがやるべきこと:**
1. `apps/landing/` 内のファイルを変更
2. commit & push to dev
3. 完了。それだけ。

#### ワークツリーでの作業フロー

```
1. ワークツリー作成: git worktree add ../anicca-landing -b feature/landing-xxx
2. 変更完了 → cd apps/landing && npx netlify deploy --build（プレビュー）
3. プレビュー URL で確認
4. OK → ユーザー確認 → dev にマージ
5. dev push → 本番自動デプロイ
```

#### Netlify CLI 必須

| コマンド | 用途 |
|---------|------|
| `npx netlify deploy --build` | プレビューデプロイ（確認用） |
| `npx netlify deploy --build --prod` | 本番デプロイ |

**理由:** CLI を使わないとビルドエラーが見えない。push だけだとユーザーがログを確認する手間がかかる。

#### Netlify ビルドエラー時

| エラー | 原因 | 解決策 |
|--------|------|--------|
| `No url found for submodule` | 壊れた submodule 参照 | `git rm --cached <path>` + `.gitignore` 追加 |
| `Canceled: no content change` | landing 内容が変わってない | 正常。ファイル変更して再 push |

### 11. コンテンツ変更ルール

**変更を実装する前に、必ずパッチをチャットで示す。**

| パターン | 判定 |
|---------|------|
| 「修正します」→ 実装 | ❌ |
| Before/After をチャットで示す → 承認 → 実装 | ✅ |

**特に重要な場面:**
- i18n.ts のテキスト変更
- Spec ファイルの変更
- 複数ファイルにまたがる変更

### 12. Git トラブルシューティング

#### 壊れた submodule の削除

**症状:** `fatal: No url found for submodule path 'xxx'`

**原因:** `.gitmodules` に URL がないのに git index に submodule 参照が残っている

**解決方法:**
```bash
# 1. git index から削除
git rm --cached <path>

# 2. .gitignore に追加（再追加防止）
echo "<path>/" >> .gitignore

# 3. コミット & プッシュ
git add .gitignore && git commit -m "fix: remove broken submodule" && git push
```

**例:**
```bash
git rm --cached .claude/skills/supabase-agent-skills
echo ".claude/skills/supabase-agent-skills/" >> .gitignore
git add .gitignore && git commit -m "fix: remove broken submodule" && git push
```

### 13. App Store リンクルール

**直接 URL ではなくリダイレクト URL を使う。**

| パターン | 判定 |
|---------|------|
| `https://apps.apple.com/us/app/xxx/id123` | ❌ |
| `https://aniccaai.com/app` | ✅ |

**理由:** アプリ名が変わっても URL が壊れない。`/app` ルートがリダイレクトを担当。

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

### Specセクション（コア6 + オプション）

**コア6セクションは必須。オプションは該当する場合のみ。**

#### コア（必須）

| # | セクション | 内容 |
|---|-----------|------|
| 1 | **概要（What & Why）** | 何を解決するか、なぜ必要か |
| 2 | **受け入れ条件** | テスト可能な形式の成功基準 |
| 3 | **As-Is / To-Be** | 現状→変更後の設計（シグネチャ、データモデル） |
| 4 | **テストマトリックス** | To-Be ごとのテスト名と対応（漏れ防止を兼ねる） |
| 5 | **境界** | やらないこと、触らないファイル |
| 6 | **実行手順** | ビルド、テストコマンド |

#### オプション（該当時のみ）

| セクション | いつ必要か |
|-----------|-----------|
| E2E シナリオ | UI変更がある場合 |
| ローカライズ | テキスト追加・変更がある場合 |
| ユーザーGUI作業 | 外部サービス連携・手動セットアップがある場合 |
| Skills / Sub-agents | 複雑なタスクで明示が必要な場合 |

**レビューチェックリストは不要。** codex-review（GATE 1）が自動でSpecの漏れを検出する。
**To-Beチェックリストは不要。** テストマトリックスが To-Be の漏れ防止を兼ねる。

### テストマトリックス例

| # | To-Be | テスト名 | カバー |
|---|-------|----------|--------|
| 1 | Thompson Sampling でバリアント選択 | `test_selectByThompsonSampling()` | ✅ |
| 2 | 時刻固定バリアント | `test_time_specific_variant()` | ✅ |
| 3 | 2日連続無視 → 30分シフト | `test_consecutive_ignored_triggers_shift()` | ❌ |

**全ての To-Be にテストが必要。** ❌ があれば Spec は不完全。

### ユーザー GUI タスクの明記（オプション：外部サービス連携時）

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

---

## プロジェクト概要

### Anicca とは
行動変容をサポートするiOSアプリ。AIを活用したプロアクティブな通知で、ユーザーの「苦しみ」に寄り添う。

### 技術スタック（アクティブ）
- **iOS**: Swift, SwiftUI
- **通知**: ProblemType-based Nudge System（ルールベース）
- **API**: Node.js, Railway
- **DB**: Railway PostgreSQL + Prisma（メインDB）。Supabaseは補助サービス（Slackトークン保存、Worker Memory、一部OAuth）として残存しているが、メインDBではない
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


### サブスクリプション & Paywall

| 項目 | 内容 |
|------|------|
| 価格 | $9.99/月 |
| プラン | 月額のみ（年額なし） |
| Paywall種別 | ハード（無料利用不可） |
| トライアル | 1週間無料 |
| 決済基盤 | RevenueCat + Superwall |

### 1週間トライアルの戦略

7日間 = Aniccaの全力を見せるウィンドウ。

| 日 | 体験 | 狙い |
|----|------|------|
| Day 1 | ルールベースNudge（5回/日/問題） | 即座に価値体感。研究ベースの最適タイミング |
| Day 2-6 | LLM Nudge（学習・改善・パーソナライズ） | 行動科学グラウンディング + ユーザー履歴で最適化 |
| Day 7 | 解約判断日 | 「これなしでは無理」状態を目指す |

Nudgeの質×頻度 = 継続率。ここが生命線。

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

## iOSアプリ現在の実装状況（2026年1月26日時点）

### リリース状況
| 項目 | 内容 |
|------|------|
| App Store承認 | 1.3.0（Phase 6） |
| 次回提出 | 1.4.0 |

### メイン画面（シングルスクリーン）

| 画面 | View | 内容 |
|------|------|------|
| My Path | `MyPathTabView` | 問題一覧、Tell Anicca、DeepDive、課金/アカウント |

### オンボーディングフロー

```
welcome → value → struggles → notifications（完了処理）
```

| ステップ | View | 説明 |
|---------|------|------|
| welcome | `WelcomeStepView` | アプリ紹介 + 既存ユーザー復元 |
| value | `ValueStepView` | アプリの価値説明 |
| struggles | `StrugglesStepView` | 13個の問題から選択 |
| notifications | `NotificationPermissionStepView` | 通知許可 |

※ ATT許可: オンボーディング後（初回NudgeCardの価値体験後）に表示（`ATTPermissionStepView`）。

### 13個の問題タイプ（ProblemType）

```swift
staying_up_late, cant_wake_up, self_loathing, rumination,
procrastination, anxiety, lying, bad_mouthing, porn_addiction,
alcohol_dependency, anger, obsessive, loneliness
```

### 通知 / Nudge システム

| 機能 | 担当 | 画面 |
|------|------|------|
| Problem Nudge | `ProblemNotificationScheduler` | `NudgeCardView` |
| Server-driven Nudge | `NotificationScheduler` | `NudgeCardView` |
| LLM生成Nudge（Phase 6） | `LLMNudgeService` / `LLMNudgeCache` | `NudgeCardView` |

**NudgeCardView**: 通知タップで1枚カード表示。問題に応じて1択/2択ボタン、👍👎フィードバック。

### 重要な注意事項

1. **ProblemTypeベース**: 全ての通知は`ProblemType`に基づく。HabitTypeシステムは完全削除済み。
2. **音声機能**: 削除済み（関連コンポーネントは廃止）。
3. **LLM生成Nudge**: `/api/mobile/nudge/today` を日次取得し `LLMNudgeCache` に保存。
4. **NotificationScheduler**: 認可とサーバーNudgeのみ担当（約140行）。

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

## ワークツリールール（絶対厳守）

### devブランチでの直接作業は禁止

**単独作業でも、全ての実装はワークツリーで行う。**

| 状況 | やること |
|------|---------|
| 新しいタスク開始 | `git worktree add ../anicca-<task> -b feature/<task>` |
| 既存タスク継続 | 該当ワークツリーに移動してから作業 |
| レビュー依頼された | **まずワークツリーを確認**（下記参照） |
| devで直接コミット | ❌ **絶対禁止** |

### レビュー・作業依頼時の必須フロー

```
1. ユーザーからレビュー/作業依頼を受ける
2. 「どのワークツリーですか？」と確認（または git worktree list で確認）
3. 該当ワークツリーに cd する
4. Specファイルを読んで状況把握
5. 作業開始
```

**絶対にやってはいけないこと:**
- ワークツリーを確認せずにdevで作業開始
- 勝手にdevにコミット
- ワークツリー外でコード変更

### ワークツリー一覧確認コマンド

```bash
git worktree list
```

---

## チェックリスト（作業開始時）

- [ ] **ワークツリーを確認** (`git worktree list`)
- [ ] 該当ワークツリーに移動 (`cd /path/to/worktree`)
- [ ] Specファイルを読む
- [ ] 最新をプル (`git pull`)
- [ ] 作業完了後はこまめにコミット＆プッシュ
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

### 新機能実装時の必須フロー（3ゲート）

**セクション5「3ゲート開発ワークフロー」に従う。**

```
GATE 1: Spec作成（コア6セクション）→ codex-review → ok: true
    ↓
GATE 2: TDD実装（RED → GREEN → REFACTOR）
    ↓
GATE 3: codex-review → ok: true → UI変更あれば Maestro E2E
    ↓
ユーザー実機確認 →「OK」→ dev にマージ
```

### テスト実行コマンド

**⚠️ xcodebuild 直接実行は絶対禁止。必ず Fastlane を使え。**

```bash
# Unit Tests + Integration Tests（必須: Fastlane経由）
cd aniccaios && fastlane test

# E2E Tests (Maestro)
maestro test maestro/

# 個別 E2E
maestro test maestro/01-onboarding.yaml
```

**禁止事項（絶対にやるな）:**
- `xcodebuild test` の直接実行
- `xcodebuild build` の直接実行
- Fastlane を使わずに Xcode CLI を叩くこと

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

#### 日本語テキストの注意点

**View Hierarchy で実際のテキストを確認せよ。想定と違うことが多い。**

| 想定 | 実際（View Hierarchy で確認） |
|------|------------------------------|
| `利用規約` | `利用規約 (EULA)` |
| `プライバシーポリシー` | `プライバシーポリシー` |
| `はじめる` | `はじめる` or `Get Started` |

**必須フロー:**
1. `mcp__maestro__inspect_view_hierarchy` で実際のテキストを確認
2. 確認したテキストをそのまま YAML に記載
3. パイプ `|` で日英両対応: `text: "利用規約 (EULA)|Terms of Use"`

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

### Maestro MCP（絶対ルール）

**⚠️ エージェントは Maestro CLI を直接叩くな。必ず MCP を使え。**

| シーン | 使うもの | CLI使用 |
|--------|---------|---------|
| テスト作成・デバッグ | MCP (`mcp__maestro__*`) | ❌ 禁止 |
| View Hierarchy確認 | `mcp__maestro__inspect_view_hierarchy` | ❌ 禁止 |
| コマンド実行 | `mcp__maestro__run_flow` | ❌ 禁止 |
| CI/CD（GitHub Actions） | CLI (`maestro test`) | ✅ CI/CDのみ許可 |

**違反した場合**: やり直し。MCP経由で通すまで完了とは認めない。

**エージェント作業時の必須フロー**:

1. **MCP を絶対に使う（CLI禁止）**
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
| `aso-growth` | ASO/ASA作業、キーワード最適化、Product Page改善、マーケティングメトリクス分析 |

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

**⚠️ 絶対ルール: Fastlane 以外は使うな。xcodebuild 直接実行は禁止。**

| 操作 | 正しいコマンド | 禁止 |
|------|---------------|------|
| テスト | `fastlane test` | ❌ `xcodebuild test` |
| ビルド | `fastlane build` | ❌ `xcodebuild build` |
| 実機 | `fastlane build_for_device` | ❌ 手動ビルド |

**xcodebuild を直接使った場合、即座にやり直せ。Fastlane で通るまで完了とは認めない。**

#### 利用可能な Lane 一覧

| Lane | 用途 | コマンド |
|------|------|---------|
| `set_version` | MARKETING_VERSION 一括更新 | `fastlane set_version version:X.Y.Z` |
| `build_for_device` | 実機にインストール | `fastlane build_for_device` |
| `build_for_simulator` | シミュレータで起動 | `fastlane build_for_simulator` |
| `test` | Unit/Integration テスト | `fastlane test` |
| `build` | App Store 用 IPA 作成 | `fastlane build` |
| `upload` | App Store Connect にアップロード | `fastlane upload` |
| `release` | build + upload | `fastlane release` |
| `full_release` | build + upload + 審査提出 | `fastlane full_release` |
| `submit_review` | 審査に提出 | `fastlane submit_review` |

#### 非インタラクティブモード対応（重要）

Fastlane を Claude Code から実行する場合、環境変数が必須:

```bash
# 正しい実行方法
cd aniccaios && FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_OPT_OUT_CRASH_REPORTING=1 fastlane build_for_device
```

| 環境変数 | 理由 |
|---------|------|
| `FASTLANE_SKIP_UPDATE_CHECK=1` | アップデート確認をスキップ |
| `FASTLANE_OPT_OUT_CRASH_REPORTING=1` | クラッシュレポート送信をスキップ |

**これらがないと「non-interactive mode」エラーで失敗する。**

#### 実機ビルド前の事前チェック

```bash
# 1. 実機が接続されているか確認
ios-deploy --detect

# 2. 接続されていれば build_for_device
cd aniccaios && FASTLANE_SKIP_UPDATE_CHECK=1 fastlane build_for_device

# 3. 未接続ならシミュレータにフォールバック
cd aniccaios && FASTLANE_SKIP_UPDATE_CHECK=1 fastlane build_for_simulator
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
4. **重要な MCP サーバーの接続確認**（最初のツール使用前に）:
   - Playwright が必要なタスク → `MCPSearch("select:mcp__playwright__browser_snapshot")` で ping
   - Maestro が必要なタスク → `MCPSearch("select:mcp__maestro__list_devices")` で ping
   - 接続エラーが出たら「`/mcp` → Reconnect」をユーザーに促す

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

## API Key & Secret 管理（絶対ルール）

### 原則: ユーザーにGUI操作を頼むな。エージェントが全部やれ。

| ルール | 詳細 |
|--------|------|
| **GitHub Secrets 登録** | `gh secret set NAME --repo Daisuke134/anicca.ai` で CLI から登録。GUI は使わない |
| **Railway 環境変数** | Railway Dashboard で確認（CLI 未導入のため）。値が必要な場合は下記リストを参照 |
| **API Key をユーザーに聞くな** | 下記リストに全て記録済み。新しいキーが必要な場合のみユーザーに取得を依頼 |
| **セキュリティ** | API Key は CLAUDE.md に**名前と用途のみ**記載。値は GitHub Secrets / Railway に保存済み |

### GitHub Actions Secrets（Daisuke134/anicca.ai）

| Secret Name | 用途 | 登録済み |
|-------------|------|---------|
| `OPENAI_API_KEY` | LLM（Nudge生成、TikTokエージェント、Vision） | ✅ |
| `BLOTATO_API_KEY` | TikTok投稿（Blotato API） | ✅ |
| `FAL_API_KEY` | 画像生成（Fal.ai） | ✅ |
| `EXA_API_KEY` | トレンド検索（Exa） | ✅ |
| `APIFY_API_TOKEN` | TikTokメトリクス取得（Apify） | ✅ |
| `API_AUTH_TOKEN` | Railway API 認証（= Railway の INTERNAL_API_TOKEN） | ✅ |
| `API_BASE_URL` | Railway Production URL | ✅ |
| `APPLE_APP_SPECIFIC_PASSWORD` | App Store提出 | ✅ |
| `APPLE_ID` | App Store提出 | ✅ |
| `APPLE_TEAM_ID` | App Store提出 | ✅ |
| `ASC_KEY_ID` | ASC API Key ID（`D637C7RGFN`） | ✅ |
| `ASC_ISSUER_ID` | ASC API Issuer ID | ✅ |
| `ASC_PRIVATE_KEY` | ASC API .p8 秘密鍵（`AuthKey_D637C7RGFN.p8` の中身） | ✅ |
| `ASC_VENDOR_NUMBER` | ASC Sales Reports 用ベンダー番号（`93486075`） | ✅ |
| `REVENUECAT_V2_SECRET_KEY` | RevenueCat API v2 シークレットキー | ✅ |
| `SLACK_METRICS_WEBHOOK_URL` | Slack #agents チャンネル Webhook URL | ✅ |

### Railway 環境変数（主要なもの）

| 変数名 | 用途 |
|--------|------|
| `DATABASE_URL` | PostgreSQL接続 |
| `OPENAI_API_KEY` | Nudge生成 |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 補助サービス |
| `REVENUECAT_*` | 決済連携 |
| `APNS_*` | プッシュ通知 |

**注意**: `INTERNAL_API_TOKEN` は Railway に設定済み。TikTok エージェント（GitHub Actions）が Railway API を叩く際の認証に使用。GitHub Secrets の `API_AUTH_TOKEN` と同じ値。

### Railway URL

| 環境 | URL |
|------|-----|
| Staging | `anicca-proxy-staging.up.railway.app` |
| Production | `anicca-proxy-production.up.railway.app` |

**注意**: `anicca-api-production` ではない。`anicca-proxy-production` が正しいURL。

### Railway DB Proxy URL

ローカルからRailway DBに接続する場合（Prismaマイグレーション等）:

```
# Production
postgresql://postgres:***@tramway.proxy.rlwy.net:32477/railway

# Staging
postgresql://postgres:***@ballast.proxy.rlwy.net:51992/railway
```

**詳細**: `apps/api/.env.proxy` に保存済み（gitignored）

### Railway トラブルシューティング

| 問題 | 原因 | 解決 |
|------|------|------|
| **P3005: database schema not empty** | 既存DBにPrismaベースラインがない | `DATABASE_URL="..." npx prisma migrate resolve --applied <migration>` |
| **pushしたのにRailwayが古いまま** | キャッシュまたはデプロイ未トリガー | `git commit --allow-empty -m "trigger redeploy" && git push` |
| **502 Bad Gateway** | デプロイ中 or サーバークラッシュ | Railway Dashboard でログ確認 |
| **railway run が internal hostに接続** | 内部URLはRailway内からのみアクセス可 | Proxy URL（上記）を使う |

### 本番デプロイ前チェックリスト

mainマージ前に必ず確認:

| # | 項目 | コマンド |
|---|------|---------|
| 1 | GHA secrets確認 | `gh secret list -R Daisuke134/anicca.ai` |
| 2 | API_BASE_URL確認 | `anicca-proxy-production` になっているか |
| 3 | Prismaマイグレーション | 既存DBなら `migrate resolve --applied` |
| 4 | 3並列サブエージェントレビュー | Python Agent, Backend API, DB Schema |

### Blotato アカウント

| プラットフォーム | アカウント | Blotato Account ID |
|-----------------|-----------|-------------------|
| TikTok EN | @anicca.self | 28152 |

### 新しい Secret の登録方法（エージェント向け）

```bash
# 1つずつ登録
echo "VALUE" | gh secret set SECRET_NAME --repo Daisuke134/anicca.ai

# 確認
gh secret list --repo Daisuke134/anicca.ai
```

---

## Cron ジョブ アーキテクチャ

### 現在の構成

| ジョブ | 実行環境 | スケジュール | 仕組み |
|--------|---------|-------------|--------|
| Nudge生成 | Railway Cron | `0 20 * * *` (5:00 JST) | `CRON_MODE=nudges` → `generateNudges.js` 直接実行 |
| Type Stats集計 | Railway Cron | `0 21 * * *` (6:00 JST) | `CRON_MODE=aggregate_type_stats` → 直接実行 |
| TikTok投稿 | GitHub Actions | `0 0 * * *` (9:00 JST) | Python エージェント |
| TikTokメトリクス | GitHub Actions | `0 1 * * *` (10:00 JST) | Python スクリプト |
| **Daily Metrics Report** | GitHub Actions | `15 20 * * *` (5:15 JST) | Python: ASC + RevenueCat → Slack #agents |

### なぜ分離されているか

| 比較 | Railway Cron | GitHub Actions |
|------|-------------|----------------|
| 言語 | Node.js | Python |
| DB | 直接接続 | API経由 |
| コスト | Railwayプランに含む | 無料 |
| 用途 | ユーザー向け機能 | マーケティング自動化 |

**ベストプラクティス**: 言語・依存関係・責務が異なるものは分離する（Separation of Concerns）。

### スケーラビリティ

| ユーザー数 | Nudge生成時間 | 対応 |
|-----------|-------------|------|
| 10-50 | 2-12分 | 現状のfor-loopで十分 |
| 100+ | 25分+ | BullMQ + Redis に移行 |
| 500+ | 要改善 | On-Demand生成 + キャッシュ |

---

## 1.5.0 で学んだ教訓（全エージェント必読）

### FK制約エラー（P2003）の防止

**Prisma upsert で FK 先のレコードが存在しない場合、P2003 エラーでクラッシュする。**

| ルール | 詳細 |
|--------|------|
| FK依存 upsert の前に存在チェック | `findUnique({ where: { id }, select: { id: true } })` |
| 存在しない場合 | warn ログを出して早期 return（throw しない） |
| 該当箇所 | `userTypeService.js:classifyAndSave()`, `profileService` 等 |

```javascript
// 必須パターン: FK依存 upsert の前
const exists = await prisma.targetTable.findUnique({ where: { id }, select: { id: true } });
if (!exists) {
  logger.warn(`Record not found, skipping FK-dependent operation`);
  return;
}
await prisma.dependentTable.upsert({ ... });
```

### 環境変数のフォールバック

**Railway 環境変数が未設定でコンテナがクラッシュするのを防ぐ。**

| ルール | 詳細 |
|--------|------|
| `PROXY_BASE_URL` | `RAILWAY_PUBLIC_DOMAIN` から自動生成可能 |
| throw 前にフォールバック | 自動復旧できるものは throw しない |
| 新しい必須変数追加時 | Railway Dashboard で設定 + コードにフォールバック |

### GitHub Actions デバッグ手順

| # | 手順 | コマンド |
|---|------|---------|
| 1 | Secret 一覧確認 | `gh secret list -R Daisuke134/anicca.ai` |
| 2 | **URL が正しいか確認** | `anicca-proxy-production`（`anicca-api-production` ではない） |
| 3 | 手動実行 | `gh workflow run "Name" --ref dev`（**mainにマージ不要。`--ref dev`で実行可能**） |
| 4 | 結果確認 | `gh run list --workflow "Name" -L 3` |

### Prisma マイグレーション（既存DB）

| ステップ | コマンド |
|---------|---------|
| 1. baseline 適用 | `DATABASE_URL="..." npx prisma migrate resolve --applied <migration_name>` |
| 2. 残りを deploy | `DATABASE_URL="..." npx prisma migrate deploy` |
| 3. **main に push** | Railway は push で自動デプロイ。DB変更だけでは再デプロイされない |

### Railway 運用ルール

| ルール | 理由 |
|--------|------|
| main push = 自動デプロイ | DB変更後も push が必要 |
| env var 変更 = 自動再起動 | `railway variables --set` で即反映 |
| 内部URL vs Proxy URL | 内部は Railway 内のみ。外部アクセスは Proxy URL |
| DB資格情報は `.env.proxy` に保存 | 毎回ユーザーに聞かない |

### GHA + Railway 並行テストのフロー

```
1. dev でコード修正
2. dev → main マージ & push（Railway 自動デプロイ）
3. Railway デプロイ完了待ち（2-3分）
4. GHA workflow 手動実行で検証
5. 両方 SUCCESS で完了
```

---

## Daily Metrics Report（自動化済み）

### 概要

ASC + RevenueCat のメトリクスを毎日自動取得し、Slack #agents に投稿する。

| 項目 | 値 |
|------|-----|
| **ワークフロー** | `.github/workflows/daily-metrics.yml` |
| **スクリプト** | `scripts/daily-metrics/` |
| **スケジュール** | 毎日 5:15 JST（`15 20 * * *` UTC） |
| **送信先** | Slack #agents チャンネル |
| **GitHub Secrets** | 全て設定済み（上記テーブル参照） |
| **手動実行** | `gh workflow run "Daily Metrics Report" --ref dev --repo Daisuke134/anicca.ai` |

### 取得メトリクス

| ソース | メトリクス | 注意事項 |
|--------|-----------|---------|
| ASC Sales Reports | 新規DL数（7日間）、国別内訳 | **type 1のみ**（更新/IAPは除外）、**2日前データ**使用 |
| ASC Analytics Reports | Impressions, Page Views | ONGOINGレポート作成済み。初回は1-2日後からデータ取得可能 |
| RevenueCat v2 | MRR, Active Subs, Active Trials, Trial→Paid, Churn | `id`フィールドで取得（`name`ではない）、値はドル（セントではない） |

### ASC API Key 情報

| 項目 | 値 |
|------|-----|
| **使用するキー** | `D637C7RGFN`（Fastlane と同じキー） |
| **p8ファイル** | `~/Downloads/AuthKey_D637C7RGFN.p8` |
| **Issuer ID** | GitHub Secret `ASC_ISSUER_ID` に設定済み |
| **Vendor Number** | `93486075` |
| **バンドルID** | `ai.anicca.app.ios`（`com.anicca.ios` ではない） |
| **App ID** | `6755129214` |

### 重要な注意（過去のバグから学んだ教訓）

| 教訓 | 詳細 |
|------|------|
| **Sales Reports は gzip 圧縮** | `gzip.decompress(resp.content)` が必要 |
| **Product Type フィルター必須** | type `1` = 新規DL、`7` = アップデート、`3` = IAP。フィルターなしだとDL数が過大 |
| **ASCデータは2日遅れ** | `today - 2` を使う。昨日のデータは不完全 |
| **RevenueCat は `id` フィールド** | `name` ではない（例: `id: "mrr"`, `name: "MRR"`） |
| **RevenueCat MRR はドル単位** | 100で割らない |
| **p8キーは`D637C7RGFN`** | `646Y27MJ8C` は古い/無効なキー |
| **テスト時は `gh workflow run`** | ローカルにRC/Slack秘密鍵がないため、GitHub Actions経由で実行 |

### 目標KPI

| KPI | 目標 | 現状（2026/1/27時点） |
|-----|------|---------------------|
| **日次DL** | 10/日 | 1.7/日 |
| **CVR (Page View → DL)** | 3% | 0.3% |
| **MRR** | - | $17 |
| **Active Subs** | - | 2 |

---

## 日報

開発ログは `.cursor/logs/` に日付ごとに記録。

- 形式: `YYYY-MM-DD.md`
- 内容: その日やったこと、バージョン情報、次にやること

---

最終更新: 2026年1月29日（Daily Metrics Report セクション追加、ASC API Key情報・教訓・KPI目標記録、GitHub Secrets テーブル更新）
