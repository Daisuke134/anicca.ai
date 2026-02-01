# Build in Public 自動投稿 — Spec

**作成日**: 2026-02-02
**ステータス**: Draft → Review v2

---

## 開発環境

| 項目 | 値 |
|------|-----|
| **ワークツリーパス** | `/Users/cbns03/Downloads/anicca-build-in-public` |
| **ブランチ** | `feature/build-in-public` |
| **ベースブランチ** | `dev` |
| **作業状態** | Spec レビュー中 |

---

## 1. 概要（What & Why）

### What
リリース完了時（or 日次）に、開発ログから「Day X of building Anicca」形式のX投稿を自動生成・投稿する。

### Why
- 現状: 毎回ユーザーが手動で「これ投稿して」と指示している
- 目標: リリースや大きな開発完了時に、自動でX投稿される
- Build in Public は継続が命。自動化しないと途切れる

### スコープ
- **Phase 1**: X投稿のみ（@aniccaxxx JP, @aniccaen EN）
- **Phase 2**: 他プラットフォーム（IG, Threads等）は後で拡張

---

## 2. 受け入れ条件

| # | 条件 | テスト可能 |
|---|------|-----------|
| AC1 | `/post-update` を実行すると、git diff + 日次ログからX投稿文が自動生成される | ✅ |
| AC2 | 生成された投稿文がプレビュー表示され、確認後に Blotato API 経由で X に投稿される | ✅ |
| AC3 | 投稿内容が `.cursor/plans/ios/version-logs/YYYY-MM-DD.md` に自動保存される | ✅ |
| AC4 | Day X カウンターが正しく算出される（開始日: 2026-01-02、最小値: 1） | ✅ |
| AC5 | JP/EN 両方の投稿が生成される（@aniccaxxx, @aniccaen） | ✅ |
| AC6 | SessionEnd Hook で日次ログが自動蓄積される（既存hookを拡張） | ✅ |
| AC7 | 投稿文は280文字以内に収まる（超える場合はスレッド分割） | ✅ |
| AC8 | Blotato API エラー時にエラー内容が表示され、リトライ可能 | ✅ |

---

## 3. As-Is / To-Be

### As-Is（現状）

```
ユーザーが手動で「これ投稿して」と指示
    ↓
エージェントが blotato.py で投稿
    ↓
ログなし、履歴なし
```

**既存の SessionEnd Hook:**
- ファイル: `.claude/hooks/session-end-daily-log.sh`
- 保存先: `.claude/skills/agent-memory/memories/daily-logs/YYYY-MM-DD.md`
- 内容: セッション終了時刻のみ記録（transcript サマリーは未抽出）

**既存の blotato.py の問題:**
- アカウントキーが古い（`x_xg2grb` → 現在は `x_aniccaxxx`）
- `config.py` の ACCOUNTS dict と不整合

### To-Be（変更後）

```
[自動] SessionEnd Hook → transcript サマリー抽出 → 日次ログに追記
    ↓
[手動] /post-update Skill 発火
    ↓
[自動] git diff + 日次ログ読み込み → 投稿文生成（280文字以内）
    ↓
[自動] プレビュー表示 → ユーザー確認
    ↓
[自動] Blotato API → X に投稿（JP + EN）
    ↓
[自動] version-logs/ にログ保存
```

### コンポーネント設計

| コンポーネント | ファイル | 役割 |
|--------------|---------|------|
| **SessionEnd Hook（拡張）** | `.claude/hooks/session-end-daily-log.sh` | 既存hookを拡張: transcript サマリー抽出 → 日次ログに追記 |
| **post-update Skill** | `.claude/skills/build-in-public/SKILL.md` | ログ + git diff → 投稿文生成 → プレビュー → Blotato 投稿 |
| **Blotato投稿（修正）** | `.cursor/plans/ios/sns-poster/blotato.py` | アカウントキーを `config.py` と整合させる |

### Skill 仕様（`/post-update`）

Skill が実行時にやること:

1. `.claude/skills/agent-memory/memories/daily-logs/YYYY-MM-DD.md` を読む（今日の開発ログ）
2. `git log --oneline -20` で直近の変更を取得
3. `git diff HEAD~10..HEAD --stat` で変更ファイルを把握
4. 上記から「Day X of building Anicca」形式の投稿文を生成
   - JP版（@aniccaxxx ID:11820）: 日本語、280文字以内
   - EN版（@aniccaen ID:11852）: 英語、280文字以内
5. **プレビュー表示** → ユーザー確認待ち
6. Blotato API で X に即時投稿（エラー時はリトライ提案）
7. `mkdir -p .cursor/plans/ios/version-logs/` → `YYYY-MM-DD.md` に投稿内容を保存

### Day X カウンター

```python
day_count = max(1, (datetime.now() - datetime(2026, 1, 2)).days)
```

### 投稿フォーマット（EN例、280文字以内）

```
Day {X} of building Anicca.

{今日のハイライト 2-3行}

{dev/distribution の主要変更 1-2行}
```

280文字超える場合: スレッド（2投稿）に分割。1投稿目がメイン、2投稿目が詳細。

### SessionEnd Hook 拡張仕様

既存の `.claude/hooks/session-end-daily-log.sh` を拡張する（新規スクリプト作成しない）。

**変更内容:**
- stdin JSON から `transcript_path` を読み取る（既存の grep パターンを使用）
- transcript JSONL の1行目から `summary` フィールドを抽出
- 既存の日次ログ（`.claude/skills/agent-memory/memories/daily-logs/YYYY-MM-DD.md`）にサマリーを追記

**入力形式（stdin JSON）:**
```json
{"session_id": "abc123", "transcript_path": "/path/to/transcript.jsonl", "cwd": "/path/to/project"}
```

---

## 4. テストマトリックス

| # | To-Be | テスト方法 | カバー |
|---|-------|-----------|--------|
| 1 | SessionEnd Hook でログ蓄積 | セッション終了後に daily-logs/ を確認 | ✅ |
| 2 | `/post-update` で投稿文生成 | Skill 実行 → プレビュー確認 | ✅ |
| 3 | 280文字制限 | 生成文の文字数カウント | ✅ |
| 4 | Blotato API で X 投稿 | テスト投稿 → X で確認 | ✅ |
| 5 | Day X カウンター | `max(1, (today - 2026-01-02).days)` を検証 | ✅ |
| 6 | JP/EN 両方生成 | 2つの投稿文が異なる言語で生成されること | ✅ |
| 7 | version-logs に保存 | 投稿後にファイル存在・内容確認 | ✅ |
| 8 | API エラーハンドリング | 意図的にエラーを発生させてリトライ確認 | ✅ |

---

## 5. 境界

### やること
- X 投稿の自動化（JP + EN）
- 既存 SessionEnd Hook の拡張（transcript サマリー抽出）
- `blotato.py` のアカウントキー修正（`config.py` と整合）
- version-logs への保存

### やらないこと
- IG/TikTok/YouTube/Threads への投稿（Phase 2）
- 画像生成（テキストのみ）
- スケジュール投稿（即時のみ）
- 既存の TikTok エージェント（`anicca_tiktok_agent.py`）の変更
- 既存の cross-poster の変更

### 触るファイル
- `.claude/hooks/session-end-daily-log.sh`（拡張: transcript サマリー抽出追加）
- `.claude/skills/build-in-public/SKILL.md`（新規）
- `.cursor/plans/ios/sns-poster/blotato.py`（アカウントキー修正: `x_xg2grb` → `x_aniccaxxx`）
- `.cursor/plans/ios/version-logs/*.md`（自動生成）

### 触らないファイル
- `.claude/settings.local.json`（既に SessionEnd Hook 登録済み。変更不要）
- `scripts/anicca-agent/*`（既存 TikTok エージェント）
- `scripts/cross-poster/*`（既存 IG cross-poster）
- `.github/workflows/*`（既存ワークフロー）
- `.cursor/plans/ios/sns-poster/config.py`（参照のみ）

---

## 6. 実行手順

| # | ステップ | 内容 |
|---|---------|------|
| 1 | ワークツリー作成 | `git worktree add ../anicca-build-in-public -b feature/build-in-public` |
| 2 | `blotato.py` アカウントキー修正 | `x_xg2grb` → `x_aniccaxxx`, docstring 更新 |
| 3 | SessionEnd Hook 拡張 | transcript サマリー抽出を追加 |
| 4 | Skill ファイル作成 | `.claude/skills/build-in-public/SKILL.md` |
| 5 | `version-logs/` ディレクトリ作成 | `mkdir -p .cursor/plans/ios/version-logs/` |
| 6 | テスト投稿 | `/post-update` 実行 → プレビュー確認 → X で確認 |
| 7 | version-logs 保存確認 | ファイル生成を確認 |

### テストコマンド

```bash
# SessionEnd Hook テスト（手動、stdin でJSON渡し）
echo '{"session_id":"test","transcript_path":"","cwd":"/Users/cbns03/Downloads/anicca-project"}' | bash .claude/hooks/session-end-daily-log.sh

# 日次ログ確認
cat .claude/skills/agent-memory/memories/daily-logs/$(date +%Y-%m-%d).md

# Blotato API 接続テスト
cd .cursor/plans/ios/sns-poster && python3 -c "from blotato import BlotatoClient; c = BlotatoClient(); print(c.get_user())"

# version-logs ディレクトリ確認
ls .cursor/plans/ios/version-logs/
```

---

## エラーハンドリング

| エラー | 対処 |
|--------|------|
| Blotato API 401 | APIキー期限切れ → ユーザーに再設定を促す |
| Blotato API 429 | レート制限 → 30秒待ってリトライ |
| Blotato API 5xx | サーバーダウン → 投稿文をローカルに保存、後で手動投稿 |
| 日次ログが空/存在しない | git log のみから投稿文を生成（フォールバック） |
| transcript_path が空 | サマリー抽出をスキップ（既存動作を維持） |

---

## 参考リソース

| リソース | 用途 |
|---------|------|
| Claude Code Hooks Guide (code.claude.com/docs/en/hooks-guide) | SessionEnd Hook の仕様 |
| GitButler Hooks 事例 (blog.gitbutler.com) | transcript パースの実装例 |
| Blotato API Docs (help.blotato.com/api/start) | 投稿API仕様 |
| `.cursor/plans/ios/sns-poster/config.py` | アカウントID一覧 |
| `.cursor/plans/ios/sns-poster/blotato.py` | Blotato API クライアント |
| `.claude/hooks/session-end-daily-log.sh` | 既存 SessionEnd Hook |

---

## X アカウント（Build in Public 用）

| アカウント | Blotato ID | 言語 | 用途 |
|-----------|-----------|------|------|
| @aniccaxxx | 11820 | JP | Build in Public メイン |
| @aniccaen | 11852 | EN | Build in Public EN |
