# ANICCA セキュアデプロイメントガイド

このガイドでは、ANICCAをプロキシサーバー経由でセキュアにデプロイする方法を説明します。

## 🔐 なぜプロキシサーバーが必要か？

現在の実装では、Gemini APIキーがアプリに埋め込まれており、解析されると露出する可能性があります。プロキシサーバーを使用することで：

- APIキーをサーバー側で安全に保管
- 使用量制限を確実に実装
- 将来的な課金システムの導入が可能

## 📋 デプロイ手順

### 1. Vercelアカウントの準備

1. [Vercel](https://vercel.com)でアカウントを作成
2. Vercel CLIをインストール：
   ```bash
   npm i -g vercel
   ```

### 2. プロキシサーバーのデプロイ

```bash
# サーバーディレクトリに移動
cd server

# 依存関係をインストール
npm install

# Vercelにデプロイ
vercel

# 初回は以下の質問に答えます：
# - Set up and deploy? → Y
# - Which scope? → あなたのアカウントを選択
# - Link to existing project? → N
# - Project name? → anicca-proxy（任意の名前）
# - In which directory? → ./
# - Override settings? → N
```

### 3. 環境変数の設定

Vercelダッシュボードで環境変数を設定：

1. [Vercel Dashboard](https://vercel.com/dashboard)にアクセス
2. デプロイしたプロジェクトを選択
3. Settings → Environment Variables
4. 以下を追加：

```
GOOGLE_API_KEY = あなたのGemini APIキー
CLIENT_SECRET_KEY = ランダムな文字列（例：anicca-secret-key-2024-xyz123）
```

### 4. デスクトップアプリの設定

プロジェクトルートに`.env`ファイルを作成：

```env
# プロキシモードを有効化
USE_PROXY=true

# VercelのデプロイURL
ANICCA_SERVER_URL=https://anicca-proxy.vercel.app

# サーバーで設定したCLIENT_SECRET_KEYと同じ値
ANICCA_CLIENT_KEY=anicca-secret-key-2024-xyz123

# データベースモード
USE_SQLITE=true
```

### 5. アプリのビルドと配布

```bash
# プロジェクトルートで
npm run clean-build
npm run dist:mac
```

これで`release/`ディレクトリにDMGファイルが生成されます。

## 🚀 動作確認

1. 生成されたDMGをインストール
2. ANICCAを起動
3. コンソールログで「Using proxy mode」が表示されることを確認
4. 画面キャプチャを開始し、正常に動作することを確認

## ⚠️ 重要な注意事項

### セキュリティ
- `CLIENT_SECRET_KEY`は推測困難な値にする
- 本番環境では、より強固な認証（JWT等）の実装を検討
- Vercelの環境変数は安全に保管される

### 使用量制限
- 現在の実装では1日50回の制限
- 制限はクライアントIDごとに管理
- 本番環境ではRedis等を使用してより確実な制限を実装

### 課金対応
将来的に課金を実装する場合：
1. ユーザー認証システムの追加
2. Stripe等の決済システムとの連携
3. 使用量に応じた課金ロジックの実装

## 🔧 トラブルシューティング

### "Unauthorized"エラー
- `.env`の`ANICCA_CLIENT_KEY`がサーバーの`CLIENT_SECRET_KEY`と一致しているか確認

### "Daily limit reached"エラー
- 1日の使用量上限（50回）に達しています
- 翌日まで待つか、開発時は制限を調整

### ネットワークエラー
- `ANICCA_SERVER_URL`が正しいか確認
- Vercelのデプロイが成功しているか確認

## 📚 参考リンク

- [Vercel Documentation](https://vercel.com/docs)
- [ANICCA GitHub Repository](https://github.com/Daisuke134/anicca.ai)
- [Google AI Studio](https://aistudio.google.com/)