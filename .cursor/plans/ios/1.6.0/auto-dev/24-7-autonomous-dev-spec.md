# 24/7 自律開発パイプライン Spec

## 開発環境

| 項目 | 値 |
|------|-----|
| **ワークツリーパス** | `/Users/cbns03/Downloads/anicca-auto-dev` |
| **ブランチ** | `feature/auto-dev-pipeline` |
| **ベースブランチ** | `dev` |
| **作業状態** | Spec作成中 |

---

## 1. 概要（What & Why）

### What

Ralph（https://github.com/frankbria/ralph-claude-code）を導入し、Claude Code CLI を自律ループ実行させる24/7開発パイプラインを構築する。

### Why

| 現状の問題 | 解決策 |
|-----------|--------|
| Claude Code は1回の実行で止まる | Ralph がループで自動継続 |
| 人間がトリガーしないと動かない | Ralph + cron で夜間自動実行 |
| エラーで止まったら手動介入が必要 | Ralph の circuit breaker + Auto-Fix で自動復旧 |
| コードレビューが手動 | CodeRabbit で自動レビュー |

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                    24/7 自律開発パイプライン                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │   Ralph     │     │  GitHub     │     │  CodeRabbit │   │
│  │  (ローカル)  │────▶│  Actions    │────▶│  (レビュー)  │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│        │                   │                               │
│        │                   ▼                               │
│        │            ┌─────────────┐                        │
│        │            │  Auto-Fix   │                        │
│        │            │ (CI失敗時)   │                        │
│        │            └─────────────┘                        │
│        │                                                   │
│        ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Claude Code CLI                     │   │
│  │  - コード生成                                         │   │
│  │  - テスト実行                                         │   │
│  │  - Git 操作                                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Ralph の役割

| 機能 | 説明 |
|------|------|
| **自律ループ** | Claude Code を完了まで繰り返し実行 |
| **セッション継続** | 24時間コンテキストを維持 |
| **Circuit Breaker** | 3回進捗なし or 5回同じエラーで停止 |
| **レート制限** | 100 API calls/hour を超えない |
| **Dual-Condition Exit** | 完了指標 + EXIT_SIGNAL: true で終了 |

### GitHub Actions の役割（補助インフラ）

| Workflow | 役割 |
|----------|------|
| `ios-ci.yml` | PR push → Fastlane テスト |
| `claude.yml` | `@claude` メンション → Claude 応答 |
| `claude-autofix.yml` | CI 失敗 → 自動修正 |

---

## 2. 受け入れ条件

| # | 条件 | テスト方法 |
|---|------|-----------|
| 1 | `ralph` コマンドが実行できる | `ralph --version` |
| 2 | `.ralph/` ディレクトリが正しく構成されている | ディレクトリ確認 |
| 3 | `.ralphrc` が正しい形式 | Ralph が読み込めるか |
| 4 | `ralph` を実行すると Claude Code がループ実行される | テスト実行 |
| 5 | circuit breaker が機能する（無限ループ防止） | 意図的にエラーを起こして確認 |
| 6 | CI が Fastlane 経由で動く | PR push → CI 実行 |
| 7 | CodeRabbit が dev 宛 PR をレビューする | PR 作成 → レビュー確認 |
| 8 | Auto-Fix が CI 失敗時に動く | CI 失敗 → 自動修正確認 |

---

## 3. As-Is / To-Be

### 3.1 Ralph（新規導入）

**As-Is**: 存在しない

**To-Be**:

```
/Users/cbns03/Downloads/anicca-auto-dev/
├── .ralph/
│   ├── PROMPT.md          # 開発指示書
│   ├── fix_plan.md        # タスクチェックリスト
│   ├── AGENT.md           # ビルド/テストコマンド
│   ├── specs/             # 技術仕様
│   └── logs/              # 実行ログ
├── .ralphrc               # Ralph 設定
└── ...
```

### 3.2 `.ralphrc`（修正）

**As-Is** (間違った形式):
```
MAX_ITERATIONS=20
TIMEOUT_MINUTES=60
CIRCUIT_BREAKER_MAX_REPEATED=3
COOLDOWN_SECONDS=30
LOG_LEVEL=info
```

**To-Be** (正しい形式):
```bash
PROJECT_NAME="anicca"
PROJECT_TYPE="swift"
MAX_CALLS_PER_HOUR=100
CLAUDE_TIMEOUT_MINUTES=15
CLAUDE_OUTPUT_FORMAT="json"
ALLOWED_TOOLS="Write,Read,Edit,Bash(git *),Bash(cd *),Bash(fastlane *),Bash(xcodebuild *),Bash(swift *)"
SESSION_CONTINUITY=true
SESSION_EXPIRY_HOURS=24
CB_NO_PROGRESS_THRESHOLD=3
CB_SAME_ERROR_THRESHOLD=5
```

### 3.3 `.ralph/PROMPT.md`（新規）

**To-Be**:
```markdown
# Anicca 開発指示

## プロジェクト概要
iOS 行動変容アプリ。SwiftUI + Node.js API。

## 開発ルール
1. TDD: テストを先に書く
2. 破壊的変更禁止
3. Fastlane 経由でビルド/テスト
4. コミットメッセージは日本語OK

## 現在のタスク
fix_plan.md を参照

## 完了条件
- 全テスト PASS
- コードレビュー指摘対応
- EXIT_SIGNAL: true を出力
```

### 3.4 `.ralph/AGENT.md`（新規）

**To-Be**:
```markdown
# ビルド/テストコマンド

## iOS
cd aniccaios && FASTLANE_SKIP_UPDATE_CHECK=1 fastlane test

## API
cd apps/api && npm test
```

### 3.5 GitHub Actions（実装済み）

| ファイル | As-Is | To-Be |
|---------|-------|-------|
| `.github/workflows/ios-ci.yml` | xcodebuild 直接 | ✅ Fastlane 経由 |
| `.github/workflows/claude.yml` | セキュリティ弱い | ✅ author_association チェック |
| `.github/workflows/claude-autofix.yml` | 存在しない | ✅ 実装済み |
| `.coderabbit.yml` | dev 未対応 | ✅ base_branches 追加済み |

---

## 4. テストマトリックス

| # | To-Be | テスト名 | カバー |
|---|-------|----------|--------|
| 1 | Ralph インストール | `test_ralph_installed` | ❌ |
| 2 | .ralph/ ディレクトリ構成 | `test_ralph_directory_structure` | ❌ |
| 3 | .ralphrc 読み込み | `test_ralphrc_valid` | ❌ |
| 4 | Ralph ループ実行 | `test_ralph_loop_execution` | ❌ |
| 5 | Circuit Breaker | `test_circuit_breaker` | ❌ |
| 6 | iOS CI (Fastlane) | `test_ios_ci_fastlane` | ✅ |
| 7 | CodeRabbit dev レビュー | `test_coderabbit_dev_branch` | ✅ |
| 8 | Auto-Fix 実行 | `test_autofix_on_ci_failure` | ❌ (未テスト) |

---

## 5. 境界

### やること

- Ralph のインストール（グローバル）
- Ralph のプロジェクトセットアップ
- `.ralphrc` の正しい形式への修正
- `.ralph/` ディレクトリの作成と設定
- 動作確認テスト

### やらないこと

- cron での自動実行（Phase 2）
- Slack/Discord 通知連携（Phase 2）
- 複数プロジェクト対応（スコープ外）
- launchd/systemd でのデーモン化（スコープ外）

### 触るファイル

| ファイル | 操作 |
|---------|------|
| `.ralphrc` | 修正 |
| `.ralph/PROMPT.md` | 新規 |
| `.ralph/AGENT.md` | 新規 |
| `.ralph/fix_plan.md` | 新規 |

### 触らないファイル

- iOS ソースコード（今回は Ralph セットアップのみ）
- API ソースコード
- 既存の GitHub Actions（既に実装済み）

---

## 6. 実行手順

### Phase 1: Ralph インストール（グローバル）

```bash
# 1. Ralph をクローン
git clone https://github.com/frankbria/ralph-claude-code.git ~/ralph-claude-code

# 2. インストール
cd ~/ralph-claude-code && ./install.sh

# 3. 確認
ralph --version
```

### Phase 2: プロジェクトセットアップ

```bash
# ワークツリーに移動
cd /Users/cbns03/Downloads/anicca-auto-dev

# Ralph セットアップ（既存プロジェクト用）
ralph-enable
```

### Phase 3: 設定ファイル修正

1. `.ralphrc` を正しい形式に修正
2. `.ralph/PROMPT.md` を作成
3. `.ralph/AGENT.md` を作成
4. `.ralph/fix_plan.md` を作成（初期タスク）

### Phase 4: 動作確認

```bash
# Ralph を実行（短いテストタスク）
ralph --timeout 5 --verbose

# ログ確認
cat .ralph/logs/latest.log
```

### Phase 5: コミット & マージ

```bash
git add -A
git commit -m "feat: Ralph セットアップ完了"
git push origin feature/auto-dev-pipeline
# PR レビュー後マージ
```

---

## 7. コスト見積もり

| 項目 | 見積もり |
|------|---------|
| Ralph API 呼び出し | 100 calls/hour × $0.01 = $1/hour |
| 月間（8時間/日 × 20日） | $160/month |
| GitHub Actions | 無料枠内 |
| CodeRabbit | 無料（OSS） |

---

## 8. リスクと対策

| リスク | 対策 |
|--------|------|
| API コスト超過 | MAX_CALLS_PER_HOUR=100 で制限 |
| 無限ループ | Circuit Breaker (3回進捗なし/5回同エラー) |
| セキュリティ（悪意ある Issue） | author_association チェック |
| Claude が壊れたコードを生成 | TDD 強制 + テスト PASS 必須 |

---

## 9. ユーザー GUI 作業

| # | タスク | 状態 |
|---|--------|------|
| 1 | Supabase/Vercel/Netlify を anicca.ai から外す | ✅ 完了 |

※ 他の GUI 作業は不要。全て CLI で完結。

---

## 10. 削除予定（Night Shift）

以下は Spec に基づかず勝手に作ったもの。**削除を検討**:

| ファイル | 理由 |
|---------|------|
| `.github/workflows/claude-night-shift.yml` | Ralph があれば不要。GitHub Actions での Issue→PR 変換は Ralph の劣化版 |

**判断**: レビュー後に決定。Ralph で十分なら削除。補助として残すなら残す。
