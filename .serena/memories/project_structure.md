# プロジェクト構造詳細（2026-01-29 更新）

## ルートディレクトリ構造
```
anicca-project/
├── aniccaios/                  # iOSアプリ本体（Swift/SwiftUI）
│   ├── aniccaios/              # ソースコード
│   ├── aniccaiosTests/         # ユニット・インテグレーションテスト
│   ├── AniccaWidget/           # ウィジェットExtension
│   ├── AniccaNotificationService/ # 通知Service Extension
│   ├── Configs/                # xcconfig（Staging/Production）
│   ├── fastlane/               # ビルド・デプロイ自動化
│   ├── maestro/                # E2Eテスト（Maestro）
│   │   ├── onboarding/         # オンボーディング・Paywallテスト
│   │   ├── nudge/              # Nudge系テスト（phase5, phase6）
│   │   ├── single-screen/      # シングルスクリーンレイアウトテスト
│   │   ├── flows/              # 再利用フロー（skip-onboarding等）
│   │   └── results/            # テスト結果XML
│   └── scripts/                # iOS用スクリプト
│
├── apps/
│   ├── api/                    # バックエンドAPI（Node.js, Prisma, Railway）
│   └── landing/                # ランディングページ（Next.js, Netlify）
│
├── assets/                     # メディアファイル
│   ├── icon/                   # アプリアイコン
│   ├── screenshots/            # App Storeスクリーンショット
│   └── videos/                 # プロモーション動画
│
├── data/                       # データファイル
│   ├── apple-ads/              # Apple Search Ads CSV
│   └── audits/                 # Lighthouse監査JSON
│
├── daily-apps/                 # Daily Dhamma関連アプリ
├── research/                   # 学術研究（NAIST、旧naistQmd/）
├── scripts/                    # 自動化スクリプト
│   ├── anicca-agent/           # エージェント関連
│   └── daily-metrics/          # メトリクス収集
│
├── docs/                       # ドキュメント
│   ├── notes/                  # 技術メモ
│   ├── reports/                # PDF報告書
│   └── naistHomework /         # NAIST宿題
│
├── .claude/                    # Claude Code設定（rules, skills, hooks）
├── .cursor/plans/              # 計画・仕様書
├── .github/workflows/          # GitHub Actions CI/CD
├── .serena/memories/           # Serena MCPメモリ
│
├── CLAUDE.md                   # プロジェクトルール（全エージェント共有）
├── netlify.toml                # Netlifyデプロイ設定
├── .railwayignore              # Railwayデプロイ除外設定
└── .gitignore                  # Git追跡除外（dpo/含む）
```

## 主要なエントリーポイント

### iOSアプリ
- `aniccaios/aniccaios/` - SwiftUIソースコード

### バックエンドAPI
- `apps/api/src/server.js` - Expressサーバー
- `apps/api/prisma/schema.prisma` - Prismaスキーマ

### ランディングページ
- `apps/landing/` - Next.js App Router

## DB構成
- **Railway PostgreSQL** = メインDB（Prisma ORM）
- **Supabase SDK** = 補助サービス（Slackトークン、Worker Memory、Storage、OAuth）

## テスト
- Unit/Integration: `cd aniccaios && fastlane test`
- API: `cd apps/api && npm test`
- E2E: `maestro test aniccaios/maestro/`

## Git管理
- メインブランチ: `main`（Production）
- 開発ブランチ: `dev`（Staging）
- ワークツリー: 並列作業時に使用
