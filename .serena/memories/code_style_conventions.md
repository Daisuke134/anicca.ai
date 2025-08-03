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

## セキュリティ規約
- APIキーは環境変数またはOS暗号化（Electron safeStorage）で管理
- シークレットをコードにハードコーディングしない
- シークレットをログ出力しない
- プライバシー優先設計（データはローカル保存）

## エラーハンドリング
- try-catchで適切にエラーをキャッチ
- エラーログは`console.error`または専用ロガーで出力
- ユーザーには分かりやすいエラーメッセージを表示

## 非推奨事項
- UIバージョンは非推奨（音声バージョンが主力）
- グローバル変数の使用は避ける
- 同期的なファイルI/Oは避ける（非同期を使用）