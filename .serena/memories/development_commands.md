# 開発コマンド一覧

## デスクトップアプリ開発

### 基本的な開発コマンド
```bash
# 開発モード（推奨）
npm run voice:simple     # シンプル音声版を実行

# ビルド
npm run build:voice      # TypeScriptコンパイル
npm run clean-build      # クリーンビルド

# 配布用DMGビルド
npm run dist:voice       # DMGファイル作成
npm run dist:staging     # ステージング環境用ビルド
npm run dist:production  # 本番環境用ビルド
```

### コード品質チェック（重要！）
```bash
npm run lint            # ESLintチェック
npm run format          # Prettier自動フォーマット
npm test                # Jestテスト実行
```

### DMGビルド前の確認（必須）
```bash
# マウントされているDMGを確認
ls /Volumes/

# Aniccaがマウントされていたら強制アンマウント
hdiutil detach "/Volumes/Anicca*" -force

# エラー時のリカバリ
rm -rf /private/var/folders/*/T/t-*
```

## プロキシサーバー開発

### 開発・デプロイ
```bash
cd anicca-proxy-slack

# ローカル開発
npm run dev              # Vercel Dev Server
npm run dev:railway      # Nodemonでの開発

# デプロイ
npm run deploy           # Vercel本番デプロイ
```

## Webアプリ開発

### 開発・ビルド
```bash
cd anicca-web

# 開発
npm run dev              # Next.js開発サーバー（Turbopack）

# ビルド・本番
npm run build            # 本番ビルド
npm run start            # 本番サーバー起動
npm run lint             # Next.js lint
```

## Git関連コマンド

### 基本操作
```bash
git status               # 状態確認
git add .                # 変更をステージ
git commit -m "feat: 機能説明"  # コミット
git push                 # プッシュ
```

### ブランチ操作
```bash
git checkout -b feature/branch-name  # 新規ブランチ作成
git checkout main        # mainブランチに切り替え
git merge feature/branch-name  # マージ
```

## システムコマンド（macOS）

### ファイル操作
```bash
ls -la                   # ファイル一覧（隠しファイル含む）
find . -name "*.ts"      # TypeScriptファイル検索
grep -r "pattern" .      # パターン検索
```

### プロセス管理
```bash
ps aux | grep node       # Node.jsプロセス確認
kill -9 [PID]           # プロセス強制終了
lsof -i :3838           # ポート使用確認
```

## タスク完了時の実行コマンド

### 必須チェック項目
1. **コード品質チェック**
   ```bash
   npm run lint
   npm run format
   ```

2. **テスト実行**（存在する場合）
   ```bash
   npm test
   ```

3. **ビルド確認**
   ```bash
   npm run build:voice  # デスクトップアプリ
   cd anicca-web && npm run build  # Webアプリ
   ```

4. **動作確認**
   ```bash
   npm run voice:simple  # 実際に動作確認
   ```

## 環境変数設定

### デスクトップアプリ
```bash
NODE_ENV=development     # 開発環境
DESKTOP_MODE=true        # デスクトップモード有効
```

### プロキシサーバー
`.env`ファイルを作成（`.env.example`を参考）

## デプロイコマンド

### ランディングページ（Netlify）
```bash
netlify deploy --prod --dir=landing
```

### プロキシサーバー（Railway）
mainブランチへのプッシュで自動デプロイ

### Webアプリ（Vercel）
GitHubプッシュで自動デプロイ