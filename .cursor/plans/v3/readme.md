## Anicca v0.3（v3）Plans README

### 目的
このフォルダ（`.cursor/plans/v3/`）は、Anicca v0.3 を「迷いゼロで」実装するための **ソース・オブ・トゥルース**です。  
実装・レビュー・別エージェントへの指示は、必ずここを起点に行います。

### 最重要ルール（v0.3固定）
- **UI/UX変更禁止**: レイアウト/色/フォント/余白/画面構造は変更しない。  
  参照: `v3-ui.md`, `v3-ux.md`, `screens/*.html`
- **妄想禁止**: 不明点は必ず「コード現物」か「公式Doc」で確定する。
- **apps/apiは ESM .js を維持**: v3仕様に `.ts` が出てきても実装は `.js` に読み替える（TypeScript導入しない）。
- **通知チャネル（v0.3）**: 原則ローカル通知（UNUserNotificationCenter）。APNs/VoIP導入は仕様で必須と明記された場合のみ。
- **権限UX**:
  - Onboarding: マイク/通知のみ
  - ScreenTime/HealthKit/Motion: Profile > Data Integration のトグルON時のみ

### 実装タスクの入口
- **全タスク（38件）**: `todolist.md`
  - `## フェーズ N:` の範囲がフェーズ
  - `### N.x` がタスク

### 仕様ドキュメント（役割別）
- **全体アーキテクチャ**: `v3-stack.md`
- **データ仕様/集計**: `v3-data.md`
- **DB/Prisma設計**: `tech-db-schema-v3.md`
- **既存コードへの変更点まとめ**: `migration-patch-v3.md`
- **iOS センサー/権限/審査注意**: `ios-sensors-spec-v3.md`
- **Nudge頻度・上限・競合制御**: `tech-nudge-scheduling-v3.md`
- **stateBuilder（特徴量/正規化/順序固定）**: `tech-state-builder-v3.md`
- **bandit（LinTS等）**: `tech-bandit-v3.md`
- **EMA仕様**: `tech-ema-v3.md`
- **プロンプト管理**: `prompts-v3.md`
- **UI仕様**: `v3-ui.md`
- **UX文章仕様**: `v3-ux.md`
- **Quote固定ストック**: `quotes-v3.md`
- **ファイル配置ルール**: `file-structure-v3.md`

### UIの参照元（HTML）
`v3-ui.md` は UI の文章仕様、`screens/*.html` は "見た目の確定版" の参照です。  
SwiftUI 実装は **HTMLの構造を崩さず**に写経する（要素順/文言/コンポーネント粒度を合わせる）。

- `screens/welcome.html` など（オンボーディング）
- `screens/talk.html`, `screens/session.html`
- `screens/behavior.html`
- `screens/profile.html`, `screens/traits-detail.html`

### 擬似パッチ出力（フェーズ別）
擬似パッチを作る場合の出力先は固定:
- `.cursor/plans/v3/patches/phase-<n>/patch.md`

（注意）
- Prisma migration は生成ディレクトリ名が不定なので、patch.md では "生成後に適用" の形に分ける。

### 実装前に必ず確認すること（チェックリスト）
- 仕様とコードの矛盾がないか（特に通知/権限/monetization）
- 依存追加がある場合、package.json 差分が含まれるか
- 既存パターンを壊していないか（重複実装していないか）
- v0.3 の範囲で完結しているか（v0.4以降に逃げない）

### 参考
- App Store rejection 対応メモ: `docs/app-store-rejection-fix-2025-11.md`（リポジトリ外ではなく docs 配下を参照）

