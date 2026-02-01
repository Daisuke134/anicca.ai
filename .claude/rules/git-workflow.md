# Git Workflow

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

## Feature Implementation Workflow

1. **Plan First**
   - Use **planner** agent to create implementation plan
   - Identify dependencies and risks
   - Break down into phases

2. **TDD Approach**
   - Use **tdd-guide** agent
   - Write tests first (RED)
   - Implement to pass tests (GREEN)
   - Refactor (IMPROVE)
   - Verify 80%+ coverage

3. **Code Review**
   - Use **code-quality-reviewer** agent immediately after writing code
   - Address CRITICAL and HIGH issues
   - Fix MEDIUM issues when possible

4. **Commit & Push**
   - Detailed commit messages
   - Follow conventional commits format

## Semantic Versioning

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

## Git Troubleshooting

### 壊れた submodule の削除

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

## GitHub Actions Debug

| # | 手順 | コマンド |
|---|------|---------|
| 1 | Secret 一覧確認 | `gh secret list -R Daisuke134/anicca.ai` |
| 2 | **URL が正しいか確認** | `anicca-proxy-production`（`anicca-api-production` ではない） |
| 3 | 手動実行 | `gh workflow run "Name" --ref dev` |
| 4 | 結果確認 | `gh run list --workflow "Name" -L 3` |

## Prisma Migration (Existing DB)

| ステップ | コマンド |
|---------|---------|
| 1. baseline 適用 | `DATABASE_URL="..." npx prisma migrate resolve --applied <migration_name>` |
| 2. 残りを deploy | `DATABASE_URL="..." npx prisma migrate deploy` |
| 3. **main に push** | Railway は push で自動デプロイ。DB変更だけでは再デプロイされない |

## Hotfix Flow

**hotfix（緊急バグ修正）: release ブランチから切って、両方にマージ。**

```
release/1.0.8 でバグ発見
  → release/1.0.8 で修正
  → dev にも cherry-pick
```

## リリース管理 Q&A

| Q | 質問 | 回答 |
|---|------|------|
| Q1 | devで直接作業？feature ブランチ作る？ | 原則ワークツリー。ドキュメント変更のみdev直接可（worktree.md参照） |
| Q2 | いつブランチを作る？ | dev→mainマージ後。mainからrelease/x.x.xを切ってApp Store提出 |
| Q3 | mainはいつ更新？ | App Store提出の前。Backend先にProdデプロイ |
| Q4 | レビュー中に次バージョン開発OK？ | Yes。devで開発続行 |
| Q5 | 古いコードはいつ消す？ | 2-3バージョン後 or 1-2ヶ月後。95%移行で削除可 |
| Q8 | 同時に複数バージョンをレビューに出す？ | No。1つずつ |
| Q9 | 複数エージェントで同時開発？ | Git Worktrees（worktree.md参照） |
| Q10 | エージェントが勝手にマージ？ | 絶対禁止。チェックリスト提示→ユーザーOK待ち |
