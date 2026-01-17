# Anicca プロジェクト - 開発ガイドライン

## 絶対ルール

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

最終更新: 2025年1月17日
