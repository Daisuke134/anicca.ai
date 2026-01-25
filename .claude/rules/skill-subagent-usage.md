# Skill と Subagent を積極活用する

通常タスクで該当 Skill/Subagent を積極的に探して使う。

## 使い分け

- **Skill**: 専門知識が必要なタスク → 作業開始前に `SKILL.md` を読み、手順/制約をそのまま適用する。宣言だけで終わらせない。
- **Subagent**: 独立コンテキストが有効なタスク（リファクタリング・レビュー・広範囲探索など）、または並列実行したい場合に委任する。

※ 両者は併用可。Skill の知識を Subagent に渡して実行することもある。
※ 小さいタスクで該当する Skill/Subagent がない場合は、通常フローで進める。

## 利用時は明示

使用する Skill/Subagent と理由は1行で明記してから進める。

例:
```
Skill: /tdd - 新機能実装のため TDD ワークフローを適用
Subagent: code-quality-reviewer - 実装完了後のコードレビュー
```

## Available Skills (参考)

| スキル | 用途 |
|--------|------|
| `/decisive-agent` | **技術判断時に必須** - 検索→決定→理由の強制ワークフロー |
| `/plan` | 機能実装前に計画を立てる |
| `/tdd` | テスト駆動開発で実装する |
| `/code-review` | コミット前にレビューする |
| `/build-fix` | ビルドエラーを修正する |
| `/refactor-clean` | 不要コードを削除する |
| `/test-coverage` | テストカバレッジを確認・改善する |
| `/codex-review` | Codexレビューゲート（Spec更新後、major step後、コミット前に必須実行） |

## Available Subagents (参考)

| エージェント | 用途 |
|-------------|------|
| `Explore` | コードベース探索 |
| `planner` | 実装計画 |
| `architect` | 設計判断 |
| `tdd-guide` | テスト駆動開発 |
| `test-automation-engineer` | テスト作成 |
| `code-quality-reviewer` | コードレビュー |
| `security-auditor` | セキュリティ監査 |
| `tech-spec-researcher` | 技術調査 |
| `build-error-resolver` | ビルドエラー修正 |
| `refactor-cleaner` | 不要コード削除 |
