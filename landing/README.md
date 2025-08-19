## Anicca Landing (Next.js + Tailwind)

禅・仏教的な静けさをトーンにしたモダンなランディングページです。Shadcn互換のテーマ設計（CSS変数）と`lucide-react`のアイコンを用いて、最小依存で構成しています。

### 開発

```bash
npm install
npm run dev
# http://localhost:3000
```

### 主要技術

- Next.js App Router (14)
- Tailwind CSS + tailwindcss-animate
- lucide-react（アイコン）

### 情報設計

- ヒーロー: 「静けさの中で動くAIアシスタント」
- 特徴: ローカル優先 / 画面文脈 / リアルタイム音声
- プライバシー: 最小通信・暗号化・透明性
- 使い方: 3ステップで簡潔
- CTA: ダウンロード / Webで試す

### 翻訳対応

現在は日本語中心のコピー。英語化は`app/page.tsx`の文言を切替できるように実装予定。

### デプロイ

静的ホスティング（Vercel推奨）。
