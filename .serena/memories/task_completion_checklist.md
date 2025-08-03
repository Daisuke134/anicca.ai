# タスク完了時のチェックリスト

## 必須実行項目

### 1. コード品質チェック（最重要）
```bash
# ESLintでコードスタイルチェック
npm run lint

# Prettierで自動フォーマット
npm run format
```

### 2. TypeScriptコンパイル確認
```bash
# デスクトップアプリの場合
npm run build:voice

# プロキシサーバーの場合（TypeScript使用時）
cd anicca-proxy-slack
tsc --noEmit  # 型チェックのみ

# Webアプリの場合
cd anicca-web
npm run build
```

### 3. テスト実行（存在する場合）
```bash
# Jestテスト（デスクトップアプリ）
npm test

# その他のテストコマンドがあれば実行
```

### 4. 動作確認
```bash
# デスクトップアプリ
npm run voice:simple  # 実際に起動して動作確認

# プロキシサーバー
cd anicca-proxy-slack
npm run dev  # ローカルで動作確認

# Webアプリ
cd anicca-web
npm run dev  # ブラウザで動作確認
```

## コミット前のチェック項目

### セキュリティチェック
- [ ] APIキーやシークレットがハードコーディングされていない
- [ ] 環境変数や暗号化ストレージを使用している
- [ ] センシティブな情報がログ出力されていない

### コード規約チェック
- [ ] フルパスのハードコーディングがない
- [ ] マジックナンバーが定数化されている
- [ ] 適切なエラーハンドリングが実装されている
- [ ] TypeScriptの型が適切に定義されている

### ファイル整理
- [ ] 不要なコメントアウトコードを削除
- [ ] console.logデバッグ文を削除（必要なログは残す）
- [ ] 一時ファイルを削除

## DMGビルド前の特別チェック

```bash
# 1. マウント済みDMGの確認と解除
ls /Volumes/
hdiutil detach "/Volumes/Anicca*" -force

# 2. ビルドキャッシュのクリア（必要時）
rm -rf dist/
npm run clean-build

# 3. 本番ビルド実行
npm run dist:voice
```

## トラブルシューティング

### ビルドエラー時
1. `node_modules`削除と再インストール
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. TypeScriptキャッシュクリア
   ```bash
   rm -rf dist/
   tsc --build --clean
   ```

### ポート競合時
```bash
# 使用中のポート確認
lsof -i :3838  # デスクトップアプリ
lsof -i :3000  # Webアプリ

# プロセス終了
kill -9 [PID]
```

## 最終確認
- [ ] すべてのlintエラーが解決済み
- [ ] ビルドが成功する
- [ ] 基本機能が正常に動作する
- [ ] 新機能・修正が意図通りに動作する
- [ ] CLAUDE.mdの更新が必要か確認

## 注意事項
- **音声版が主力製品** - UI版の変更は慎重に
- **プライバシー優先** - データはローカル保存が原則
- **後方互換性** - 既存機能を壊さない
- **テスト重視** - 本番環境に影響する変更は特に慎重に