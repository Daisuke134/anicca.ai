# 並列開発ルール（Git Worktrees）

> **原則ワークツリーを使う。ただしCLAUDE.md更新・ドキュメント変更などコード以外の変更はdev直接コミット可。**

**複数エージェントが同時に作業する場合の必須ルール。**

## なぜ Worktrees か

| 他の選択肢 | 問題点 |
|-----------|--------|
| 全員 dev で作業 | コンフリクト地獄、お互いのコードが干渉 |
| feature ブランチ切り替え | stash 忘れ、コンテキスト切り替えのオーバーヘッド |
| 複数 clone | ディスク容量浪費、git history が分断 |
| **Worktrees** | 完全隔離 + 共有履歴 + 軽量 |

## ディレクトリ構成

```
~/Downloads/
├── anicca-project/              ← メインリポジトリ（dev ブランチ）
├── anicca-feature-auth/         ← Worktree 1（feature/auth）
├── anicca-feature-nudge/        ← Worktree 2（feature/nudge）
├── anicca-fix-bug-123/          ← Worktree 3（fix/bug-123）
└── ...
```

## 絶対禁止

- 同じブランチで複数エージェントが作業
- Worktree なしで複数タスクを並行実行

## 必須フロー

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

## エージェントへの指示

- **作業開始時**: 必ず Worktree を作成してから作業を開始
- **作業終了時**: テスト完了後、ユーザーにマージ許可を求める（勝手にマージしない）

## 並列開発時の Spec ルール

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

## ワークツリーでのバックエンド開発

**ワークツリーからpushしてもRailwayに自動デプロイされない。**

| 状況 | Railway デプロイ |
|------|-----------------|
| dev ブランチに push | 自動デプロイ |
| ワークツリーから push | 自動デプロイされない |
| Railway CLI で手動デプロイ | 任意のブランチから可能 |

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
