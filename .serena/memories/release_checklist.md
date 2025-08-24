# ANICCAリリースチェックリスト

## 1. 開発環境でのテスト
- [ ] `npm run voice:simple` でローカル動作確認
- [ ] 全機能の動作確認
  - [ ] 音声認識（Hey Anicca）
  - [ ] Slack連携
  - [ ] MCP機能（Exa検索、Playwright等）
  - [ ] カレンダー連携
  - [ ] 起床・就寝タスク
  - [ ] 瞑想タスク

## 2. DMGビルド前の準備
- [ ] マウント済みDMGの確認と強制アンマウント
  ```bash
  ls /Volumes/
  hdiutil detach "/Volumes/Anicca*" -force
  ```
- [ ] 一時ファイルのクリーンアップ
  ```bash
  rm -rf /private/var/folders/*/T/t-*
  ```
- [ ] ビルド設定の確認（electron-builder-voice.yml）

## 3. DMGビルド
- [ ] TypeScriptビルド: `npm run build:voice`
- [ ] DMG作成: `npm run dist:voice`
- [ ] ビルド成功確認（release/anicca-arm64.dmg）

## 4. DMGでの動作確認
- [ ] DMGインストール
- [ ] 初回起動確認
- [ ] マイク権限要求確認
- [ ] システムトレイアイコン表示確認
- [ ] 音声認識動作確認
- [ ] APIエンドポイント接続確認（anicca-proxy-staging.up.railway.app）

## 5. セキュリティ関連
- [ ] APIキーの暗号化確認（Electron safeStorage）
- [ ] OAuth認証フロー確認
- [ ] ローカルデータ保存先確認（~/.anicca/）
- [ ] コード署名確認（macOS）
- [ ] Notarization確認（macOS）

## 6. 自動更新機能確認
- [ ] electron-updaterの設定確認
- [ ] GitHub Releasesへの接続確認
- [ ] アップデートチャンネル設定（stable/beta）
- [ ] 更新ダイアログ表示確認

## 7. 既知の課題対応
- [ ] Exaツール動作確認と修正
- [ ] ログインセッション持続性改善
- [ ] トレイアイコンサイズ調整
- [ ] デスクトップアイコンサイズ調整

## 8. リリース準備
- [ ] バージョン番号更新（package.json）
- [ ] リリースノート作成
- [ ] GitHub Releaseドラフト作成
- [ ] DMGファイルアップロード

## 9. 配布設定
- [ ] プロキシサーバー（/api/download）設定確認
- [ ] ダウンロードリンク確認
- [ ] ランディングページ更新

## 10. 最終確認
- [ ] 新規ユーザーとしての完全インストールテスト
- [ ] アップグレードテスト（既存バージョンからの更新）
- [ ] アンインストール・再インストールテスト

## 今後の改善項目
- [ ] SlackのMCP化（より高機能なmcpツール導入）
- [ ] Exaツールの完全修復
- [ ] ElevenLabsのMCP化
- [ ] 課金機能実装
- [ ] ロゴ・アイコンデザイン改善
- [ ] セキュリティ強化

## デプロイ環境
- **Desktop App**: GitHub Releases (Private)
- **Proxy Server**: Railway (anicca-proxy-staging.up.railway.app)
- **Web App**: Vercel (app.aniccaai.com)
- **Landing Page**: Netlify (aniccaai.com)