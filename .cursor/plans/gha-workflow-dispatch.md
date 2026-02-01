# GHA workflow_dispatch: dev ブランチでのテスト方法

## 制約

`workflow_dispatch` は **YAML が main（デフォルトブランチ）に存在する場合のみ** 発火可能。

## 新規ワークフローを dev でテストする手順

```bash
# 1. main に YAML だけコピー（コード変更なし）
git checkout main && git pull origin main
git checkout dev -- .github/workflows/<new-workflow>.yml
git add .github/workflows/<new-workflow>.yml
git commit -m "ci: add <new-workflow> for dispatch support"
git push origin main
git checkout dev

# 2. --ref dev で実行（dev のコードが checkout される）
gh workflow run <new-workflow>.yml --ref dev
```

## 動作の仕組み

| 段階 | 使われるもの |
|------|-------------|
| YAML の発見・トリガー | **main の YAML** |
| `actions/checkout` | `GITHUB_REF=refs/heads/dev` → **dev のコード** |
| Python スクリプト実行 | **dev のコード** |

## Railway ビルドの注意点

### `.npmrc` が必要

`@openai/agents@0.4.4` が `zod@^4` を要求、プロジェクトは `zod@^3`。
`apps/api/.npmrc` に `legacy-peer-deps=true` を設定済み。

### Prisma バージョン

`npx prisma generate` は最新版を引っ張る。Prisma 7.x は破壊的変更あり。
`package.json` の devDependencies で `prisma: "^6.0.0"` にピン済みだが、
Docker ビルド中の `npx prisma generate` はグローバルの最新を取得する場合がある。
問題が再発したら `npx prisma@6 generate` に変更すること。

### composio パッケージ

`@composio/openai` と `@composio/core` は使用されていない。削除済み。
再追加禁止。
