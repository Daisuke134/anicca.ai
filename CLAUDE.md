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
- **絶対にmainブランチで作業しない**
- **必ずdevブランチで開発する**
- devブランチはプッシュすると自動でRailway（API）にデプロイされる
- mainへのマージはリリース時のみ

### 2. コミット・プッシュルール
- **フェーズごとにこまめにプッシュする**
- 大きな機能は小さなコミットに分割
- コミットメッセージは日本語でもOK

### 3. 言語ルール
- 思考は英語、回答の生成は日本語で行う
- CLAUDE.mdやドキュメントは日本語で記述

---

## プロジェクト概要

### Anicca とは
行動変容をサポートするiOSアプリ。AIを活用したプロアクティブな通知で、ユーザーの「苦しみ」に寄り添う。

### 技術スタック
- **iOS**: Swift, SwiftUI, AlarmKit (iOS 26+)
- **API**: Node.js, Railway
- **AI**: OpenAI Realtime API
- **決済**: RevenueCat
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

## 現在の開発状況

### Proactive Agent（2025年1月実装中）
アプリを「Proactive Behavior Change Agent」に進化させる機能。

**Phase 1-3**: 完了（mainで作業してしまった→devに移行中）
- 13個の問題タイプ
- 問題ベースの通知システム
- My Pathタブ

**Phase 4**: 未着手
- 保存ボタン
- Exploreタブ
- マルチモーダルコンテンツ

仕様書: `.cursor/plans/ios/proactive/proactive-agent-spec.md`

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
| 実装計画 | `Plan` |
| テスト作成 | `test-automation-engineer` |
| コードレビュー | `code-quality-reviewer` |
| セキュリティ監査 | `security-auditor` |
| 技術調査 | `tech-spec-researcher` |

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

最終更新: 2025年1月17日
