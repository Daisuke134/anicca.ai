# デスクトップアプリリリースワークフロー

## コマンド構成

### 開発・テスト用
```bash
# 高速開発ビルド（DMGでの動作確認用）
npm run dist:dev
# → NODE_ENV=development, ノータリゼーションスキップ, 自動アンマウント
# → betaチャンネルで自動更新（テスト用）

# ローカル開発
npm run voice:simple  
# → 直接Electron実行、DMG化なし
```

### ステージング環境
```bash
# ステージング完全ビルド
npm run dist:staging
# → NODE_ENV=development
# → beta-mac.yml生成（自動更新用）
# → 署名・ノータリゼーション実行
# → プロキシ: anicca-proxy-staging.up.railway.app
```

### 本番環境
```bash
# 本番リリースビルド
npm run dist:production  
# → NODE_ENV=production
# → latest-mac.yml生成（自動更新用）
# → フル署名・ノータリゼーション実行
# → プロキシ: anicca-proxy-production.up.railway.app
```

## 自動更新テストワークフロー

### 1. ベータテスト用プレリリース作成
```bash
# ステージングビルド実行
npm run dist:staging

# ベータプレリリース作成
gh release create v0.6.3-beta \
  release/anicca-arm64.dmg \
  release/beta-mac.yml \
  --title "v0.6.3 Beta - 自動更新テスト" \
  --notes "自動更新機能のテスト版" \
  --prerelease

# テスト実行
npm run dist:dev  
open release/anicca-arm64.dmg
# → アプリで自動更新エラー解消確認
```

### 2. 本番リリース
```bash
# 本番ビルド実行
npm run dist:production

# 正式リリース作成
gh release create v0.6.3 \
  release/anicca-arm64.dmg \
  release/latest-mac.yml \
  --title "Anicca v0.6.3" \
  --notes "新機能とバグ修正" \
  --latest

# → ユーザーのアプリが自動更新される
```

## 環境変数とプロキシ接続

### プロキシURL自動切り替え
```typescript
// src/config.ts
NODE_ENV === 'production' 
  → anicca-proxy-production.up.railway.app
それ以外 
  → anicca-proxy-staging.up.railway.app
```

### 自動更新チャンネル
```typescript
// src/config.ts  
NODE_ENV === 'production' 
  → 'stable' (latest-mac.yml)
それ以外 
  → 'beta' (beta-mac.yml)
```

## ログファイル確認

### 自動更新エラー確認
```bash
tail -100 ~/Library/Logs/anicca-agi/main.log | grep -i "error\|updater"
```

### Developer Tools（DMGアプリ内）
```
View > Developer > Developer Tools
Console タブでエラー確認
```

## 重要な設定

### electron-builder-voice.yml
- `generateUpdatesFilesForAllChannels: true` - beta/stableの両yml生成
- GitHub private repository設定
- コード署名・ノータリゼーション設定

### package.json
- `dist:dev`: 開発用高速ビルド（NODE_ENV=development）
- `dist:staging`: ステージング完全版（NODE_ENV=development）  
- `dist:production`: 本番完全版（NODE_ENV=production）

## トラブルシューティング

### 自動更新エラー
- プレリリースでbeta-mac.ymlが生成されているか確認
- GitHubプライベートリポジトリのアクセス権限確認
- ログファイルで404エラーの詳細確認

### DMGビルドエラー  
- 古いDMGのマウント確認: `hdiutil detach /Volumes/Anicca* -force`
- 必要ファイルの存在確認: `dist/agents/**/*`