# コードスタイル規約

## 全般的な規則

### 重要な原則
- **日本語で応答** - ユーザーとのコミュニケーションは必ず日本語
- **フルパスのハードコーディング禁止**
  - ❌ NG: `/Users/username/project/...`
  - ✅ OK: `Path.cwd()`, `Path(__file__).parent`, 相対パス
- **優柔不断の禁止** - きちんと考えた上で最善の決定を行う
- **マジックナンバー禁止** - 定数として定義
- **設定値の外部化** - 環境変数や設定ファイルから取得

### 意思決定規約（TDD追加）
- **選択肢提示の禁止** - 「どれがいいですか？」は絶対NG
- **最適解の決定** - 拡張性・可読性を考慮し明確に決定
- **根拠の明示** - なぜその実装が最適かを説明

## TDD開発規約

### 基本ワークフロー
```
1. Red（テスト失敗）→ 2. Green（最小実装）→ 3. Refactor（リファクタリング）→ 4. Review（品質確認）
```

### テスト作成規約
- **入出力ペア明確化** - 期待値を具体的に定義
- **エッジケース包含** - 境界値・異常値のテスト
- **モック実装禁止** - 実際に動作するテストのみ
- **test-automation-engineer** - テスト作成後に自動起動

### 実装前チェック項目
1. **Context7でドキュメント調査** - 最新仕様確認
2. **Serenaでコード確認** - 既存パターン把握
3. **全疑問点クリア** - 「可能性がある」禁止
4. **完全コード提示** - 実装前に完成形を提示

### プロンプト作成規約（AIエージェント用）
- **❌ ゴミロジック禁止**: `if (task.includes('起床'))` 等の条件分岐
- **✅ 自然言語指示**: 「起床タスクなら起こして、就寝タスクなら寝かせて」
- **理由**: AIは自然言語を理解できるため条件分岐は不要

## TypeScript規約

### コンパイラ設定
- **target**: ES2020
- **strict**: true（厳格モード有効）
- **noImplicitAny**: false（暗黙的any許可）
- **noImplicitReturns**: true
- **esModuleInterop**: true
- **モジュール**: CommonJS（デスクトップアプリ）、ESModules（プロキシサーバー）

### 命名規則
- **クラス名**: PascalCase（例: `VoiceServer`, `SessionManager`）
- **インターフェース**: PascalCase（例: `IAuthService`）
- **関数・メソッド**: camelCase（例: `handleVoiceInput`, `getUserData`）
- **定数**: UPPER_SNAKE_CASE（例: `MAX_RETRY_COUNT`）
- **ファイル名**: camelCase（例: `voiceServer.ts`, `simpleEncryption.ts`）

## ESLint設定

### 有効なルール
- ESLint推奨ルール
- TypeScript推奨ルール
- `@typescript-eslint/no-explicit-any`: off（any型許可）
- `@typescript-eslint/no-unused-vars`: warn（未使用変数は警告、`_`プレフィックスは無視）

## ディレクトリ構造

### デスクトップアプリ
```
src/
  ├── main-voice-simple.ts    # エントリーポイント
  ├── config.ts               # 設定
  ├── agents/                 # エージェント層（TDD重要）
  │   ├── __tests__/          # テストディレクトリ
  │   ├── mainAgent.ts
  │   └── sessionManager.ts
  └── services/               # サービス層
      ├── interfaces.ts       # インターフェース定義
      └── *.ts                # 各種サービス
```

### プロキシサーバー
```
anicca-proxy-slack/src/
  ├── server.js              # エントリーポイント
  ├── config/                # 設定
  ├── api/                   # APIエンドポイント
  ├── services/              # ビジネスロジック
  └── utils/                 # ユーティリティ
```

## コミット規約
- 機能追加: `feat: 説明`
- バグ修正: `fix: 説明`
- リファクタリング: `refactor: 説明`
- ドキュメント: `docs: 説明`
- テスト追加: `test: 説明`

## セキュリティ規約
- APIキーは環境変数またはOS暗号化（Electron safeStorage）で管理
- シークレットをコードにハードコーディングしない
- シークレットをログ出力しない
- プライバシー優先設計（データはローカル保存）
- **Railway環境変数** - anicca-proxy-slackで一元管理

## エラーハンドリング
- try-catchで適切にエラーをキャッチ
- エラーログは`console.error`または専用ロガーで出力
- ユーザーには分かりやすいエラーメッセージを表示

## 実装規約（TDD追加）
- **モック実装禁止** - 動作しない仮実装は絶対NG
- **方向転換禁止** - 計画通りに実装、問題があれば相談
- **完全性優先** - 不明点がある場合は実装を開始しない

## ツール使用規約
- **Serena必須** - コード読み書きは必ずSerena使用
- **Context7活用** - ドキュメント調査で最新情報取得
- **Memory管理** - 重要な決定事項を記録

## 非推奨事項
- UIバージョンは非推奨（音声バージョンが主力）
- グローバル変数の使用は避ける
- 同期的なファイルI/Oは避ける（非同期を使用）
- 条件分岐によるプロンプト制御（自然言語で解決）