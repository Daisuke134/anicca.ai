# Phase 6: Anicca Landing Page Spec

> 最終更新: 2026-01-24
>
> このSpecは「エージェントが読んだだけで実装できる」レベルの詳細を含む。

---

## 概要

### 何を解決するか

現在のランディングページ（aniccaai.com）には以下の問題がある：

1. **Mac版リンクのみ** — iOSアプリへのリンクがない
2. **ビジョンが伝わらない** — 「苦しみを終わらせる」というコアメッセージが弱い
3. **SNSリンクがない** — TikTok, Instagram, YouTubeへの導線がない
4. **日本語版がない** — 英語のみ
5. **デザインが仏教的でない** — Aniccaの哲学が視覚的に表現されていない

### なぜ必要か

- iOSアプリがメインプロダクトになった
- SNSでのプロモーション開始（TikTok）
- グローバル＋日本市場の両方をターゲット

### ゴール

1. aniccaai.com にアクセスすると新しいLPが表示される
2. 英語版（`/en`）と日本語版（`/ja`）が動作する
3. 全てのリンク（App Store, SNS）が機能する
4. Netlifyで自動デプロイが動作する

---

## As-Is（現状）

### 現在のファイル構成

```
apps/landing/
├── app/
│   ├── page.tsx          # メインページ（英語のみ）
│   ├── layout.tsx
│   ├── fonts.ts
│   └── globals.css
├── components/
│   ├── site/
│   │   ├── Hero.tsx       # Mac版ダウンロードリンク
│   │   ├── Demo.tsx
│   │   ├── PromiseStrip.tsx
│   │   ├── KeyFeatures.tsx
│   │   ├── Privacy.tsx
│   │   ├── HowItWorks.tsx
│   │   ├── Philosophy.tsx
│   │   ├── DownloadCta.tsx # Mac版ダウンロードリンク
│   │   └── Navbar.tsx
│   ├── base/
│   └── ui/
├── public/
│   └── favicon.png
├── package.json
└── tailwind.config.ts
```

### 現在の問題

| 問題 | 詳細 |
|------|------|
| Hero | Mac版ダウンロードリンクのみ |
| CTA | App Storeリンクなし |
| SNS | リンクなし |
| 言語 | 英語のみ |
| メッセージ | 「苦しみを終わらせる」が伝わらない |

---

## To-Be（変更後）

### 新しいファイル構成

```
apps/landing/
├── app/
│   ├── page.tsx              # ルート → /en にリダイレクト
│   ├── layout.tsx
│   ├── fonts.ts
│   ├── globals.css
│   ├── en/
│   │   └── page.tsx          # 英語版
│   └── ja/
│       └── page.tsx          # 日本語版
├── components/
│   ├── site/
│   │   ├── Navbar.tsx        # 言語トグル追加
│   │   ├── Hero.tsx          # 「End Suffering.」のみ
│   │   ├── PainPoint.tsx     # 新規
│   │   ├── Vision.tsx        # 新規（What if Buddha...）
│   │   ├── Philosophy.tsx    # 書き換え（The Big Don't）
│   │   ├── Roadmap.tsx       # 新規
│   │   ├── HowItWorks.tsx    # スクリーンショット追加
│   │   ├── ContentPhilosophy.tsx # 新規（SNS哲学）
│   │   ├── DownloadCta.tsx   # App Storeのみ
│   │   └── Footer.tsx        # SNSリンク追加
│   ├── base/
│   └── ui/
├── public/
│   ├── favicon.png
│   ├── screenshots/
│   │   ├── onboarding.png    # ユーザー提供
│   │   ├── nudge-card.png    # ユーザー提供
│   │   └── feedback.png      # ユーザー提供
│   └── app-store-badge.svg
├── lib/
│   └── i18n.ts               # 新規（翻訳データ）
├── package.json
└── tailwind.config.ts
```

---

## To-Be チェックリスト

| # | To-Be | 完了 |
|---|-------|------|
| 1 | ルート（`/`）が `/en` にリダイレクト | ❌ |
| 2 | 英語版（`/en`）が表示される | ❌ |
| 3 | 日本語版（`/ja`）が表示される | ❌ |
| 4 | 言語トグルで切り替え可能 | ❌ |
| 5 | Hero に「End Suffering.」のみ表示 | ❌ |
| 6 | Pain Point セクション表示 | ❌ |
| 7 | Vision セクション表示 | ❌ |
| 8 | Philosophy セクション表示 | ❌ |
| 9 | Roadmap セクション表示 | ❌ |
| 10 | How It Works にスクリーンショット3枚 | ❌ |
| 11 | Content Philosophy セクション表示 | ❌ |
| 12 | Download CTA に App Store バッジ | ❌ |
| 13 | Footer に SNS リンク | ❌ |
| 14 | App Store リンクが動作 | ❌ |
| 15 | TikTok リンクが動作（日英別） | ❌ |
| 16 | Instagram リンクが動作（日英別） | ❌ |
| 17 | YouTube リンクが動作（日英別） | ❌ |
| 18 | X リンクが動作（オプション） | ❌ |
| 19 | Netlify にデプロイ成功 | ❌ |
| 20 | aniccaai.com でアクセス可能 | ❌ |

---

## セクション詳細

### 1. Navbar

```
┌─────────────────────────────────────────────────────────┐
│  Anicca          Vision  How It Works  [EN/JA]         │
└─────────────────────────────────────────────────────────┘
```

| 要素 | English | 日本語 |
|------|---------|--------|
| Logo | Anicca（テキスト） | Anicca |
| Nav 1 | Vision | ビジョン |
| Nav 2 | How It Works | 使い方 |
| Toggle | EN / JA | EN / JA |

**実装詳細:**
- Logo: `<Link href="/">Anicca</Link>`
- Nav: アンカーリンク（`#vision`, `#how-it-works`）
- Toggle: `/en` ↔ `/ja` へのリンク

---

### 2. Hero

```tsx
<section className="h-dvh flex items-center justify-center">
  <h1 className="text-6xl md:text-8xl font-bold text-balance">
    End Suffering.
  </h1>
</section>
```

| 要素 | English | 日本語 |
|------|---------|--------|
| Headline | End Suffering. | 苦しみを、終わらせる。 |

**UI制約:**
- `h-dvh`（`h-screen`禁止）
- `text-balance`
- 画像なし、ボタンなし
- 余白たっぷり

---

### 3. Pain Point

```tsx
<section className="py-20">
  <blockquote className="text-2xl md:text-4xl font-bold text-center">
    "I haven't changed in 6 years."
  </blockquote>
  <p className="mt-8 text-lg text-muted-foreground text-center text-pretty max-w-2xl mx-auto">
    You've tried 10 apps. All abandoned in 3 days.
    You've broken promises to yourself—hundreds of times.
    You've given up. But somewhere inside, you still want to change.
  </p>
</section>
```

| 要素 | English | 日本語 |
|------|---------|--------|
| Quote | "I haven't changed in 6 years." | 「6年間、何も変われなかった。」 |
| Body | You've tried 10 apps. All abandoned in 3 days. You've broken promises to yourself—hundreds of times. You've given up. But somewhere inside, you still want to change. | 10個のアプリを試した。全部3日で挫折した。自分との約束を、何百回も破ってきた。諦めてる。でも心のどこかでは、まだ変わりたい。 |

---

### 4. Vision

```tsx
<section id="vision" className="py-20 bg-muted/30">
  <h2 className="text-3xl md:text-5xl font-bold text-center text-balance">
    What if Buddha were software?
  </h2>
  <p className="mt-8 text-lg text-muted-foreground text-center text-pretty max-w-2xl mx-auto">
    2,500 years ago, one man ended suffering—one person at a time.
  </p>
  <p className="mt-4 text-lg text-muted-foreground text-center text-pretty max-w-2xl mx-auto">
    What if he could reach billions?<br />
    What if he never slept?<br />
    What if he found you before you even asked?
  </p>
  <p className="mt-8 text-xl font-semibold text-center">
    That's what we're building.
  </p>
</section>
```

| 要素 | English | 日本語 |
|------|---------|--------|
| Title | What if Buddha were software? | もしブッダがソフトウェアだったら？ |
| Story | 2,500 years ago, one man ended suffering—one person at a time. | 2500年前、一人の人間が苦しみを終わらせた。一人ずつ。 |
| Questions | What if he could reach billions? What if he never slept? What if he found you before you even asked? | もし何十億人に届けられたら？もし眠らなかったら？もしあなたが求める前に来てくれたら？ |
| Closer | That's what we're building. | それが、私たちが作っているもの。 |

---

### 5. Philosophy

```tsx
<section className="py-20">
  <h2 className="text-3xl font-bold text-center">The Big Don't</h2>
  <div className="mt-8 max-w-xl mx-auto border-2 border-[#D4AF37] p-8 text-center">
    <p className="text-2xl font-bold">We will never add new features.</p>
  </div>
  <div className="mt-8 max-w-2xl mx-auto text-center">
    <p className="text-muted-foreground text-pretty">
      Other apps say "Connect more. Share more. Give us more data."
    </p>
    <p className="mt-4 font-semibold">
      We do the opposite. Less data. Deeper understanding.
    </p>
    <p className="mt-8 text-muted-foreground">
      Our definition of AGI:
    </p>
    <p className="mt-2 font-semibold">
      Not "automate jobs." "End suffering."
    </p>
    <p className="mt-4 text-lg font-bold">
      Nothing else matters.
    </p>
  </div>
</section>
```

| 要素 | English | 日本語 |
|------|---------|--------|
| Title | The Big Don't | 絶対にやらないこと |
| Statement | We will never add new features. | 新機能は追加しない。永遠に。 |
| Contrast | Other apps say "Connect more. Share more. Give us more data." We do the opposite. Less data. Deeper understanding. | 他のアプリは「もっと連携して。もっと共有して。もっとデータをください」と言う。私たちは逆。少ないデータで、より深く理解する。 |
| AGI | Our definition of AGI: Not "automate jobs." "End suffering." | 私たちのAGIの定義：「仕事を自動化する」ではない。「苦しみを終わらせる」。 |
| Closer | Nothing else matters. | それ以外は、意味がない。 |

**UI制約:**
- Statement box: 金色ボーダー `border-[#D4AF37]`

---

### 6. Roadmap

```tsx
<section className="py-20 bg-muted/30">
  <h2 className="text-3xl font-bold text-center">The Journey</h2>

  {/* Timeline */}
  <div className="mt-12 flex justify-center items-center gap-4">
    <div className="flex items-center">
      <div className="size-4 rounded-full bg-foreground" />
      <div className="w-16 h-0.5 bg-foreground" />
    </div>
    {/* ... repeat for each point */}
  </div>
  <div className="flex justify-center gap-8 mt-2 text-sm text-muted-foreground">
    <span>You</span>
    <span>Society</span>
    <span>Humanity</span>
    <span>All Beings</span>
  </div>

  {/* Phases */}
  <div className="mt-12 max-w-2xl mx-auto space-y-8">
    <div>
      <h3 className="font-bold">Phase 4-11</h3>
      <p className="text-muted-foreground">Your suffering. The right nudge at the right moment.</p>
    </div>
    <div>
      <h3 className="font-bold">Phase 12</h3>
      <p className="text-muted-foreground">Social systems. Change the structures that create suffering.</p>
    </div>
    <div>
      <h3 className="font-bold">Phase 13-14</h3>
      <p className="text-muted-foreground">All living beings. End suffering everywhere. Then, Anicca ends itself.</p>
    </div>
  </div>

  <p className="mt-12 text-center text-lg font-semibold">
    When suffering reaches zero, Anicca terminates.<br />
    That is impermanence. That is Anicca.
  </p>
</section>
```

| 要素 | English | 日本語 |
|------|---------|--------|
| Title | The Journey | 進化の道 |
| Timeline | You → Society → Humanity → All Beings | 個人 → 社会 → 人類 → 全生物 |
| Phase 4-11 | Your suffering. The right nudge at the right moment. | あなたの苦しみ。最適なタイミングで最適なNudge。 |
| Phase 12 | Social systems. Change the structures that create suffering. | 社会システム。苦しみを生む構造を変える。 |
| Phase 13-14 | All living beings. End suffering everywhere. Then, Anicca ends itself. | 全生物。あらゆる苦しみを終わらせる。そしてAniccaは自らを終了する。 |
| Final | When suffering reaches zero, Anicca terminates. That is impermanence. That is Anicca. | 苦しみがゼロになった時、Aniccaは終わる。それが無常。それがAnicca。 |

---

### 7. How It Works

```tsx
<section id="how-it-works" className="py-20">
  <h2 className="text-3xl font-bold text-center">How It Works</h2>

  <div className="mt-12 grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
    {/* Step 1 */}
    <div className="text-center">
      <div className="relative mx-auto w-48 h-96">
        <Image src="/screenshots/onboarding.png" alt="Onboarding" fill className="object-contain" />
      </div>
      <h3 className="mt-4 font-bold">Tell your struggles</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick what you're facing. Late nights. Can't wake up. Self-loathing.
      </p>
    </div>

    {/* Step 2 */}
    <div className="text-center">
      <div className="relative mx-auto w-48 h-96">
        <Image src="/screenshots/nudge-card.png" alt="Nudge Card" fill className="object-contain" />
      </div>
      <h3 className="mt-4 font-bold">Get nudged at the right moment</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Anicca sends the right message when you need it most.
      </p>
    </div>

    {/* Step 3 */}
    <div className="text-center">
      <div className="relative mx-auto w-48 h-96">
        <Image src="/screenshots/feedback.png" alt="Feedback" fill className="object-contain" />
      </div>
      <h3 className="mt-4 font-bold">Change—without trying</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        No willpower needed. Just follow the nudge.
      </p>
    </div>
  </div>
</section>
```

| 要素 | English | 日本語 |
|------|---------|--------|
| Title | How It Works | 使い方 |
| Step 1 Title | Tell your struggles | 苦しみを伝える |
| Step 1 Desc | Pick what you're facing. Late nights. Can't wake up. Self-loathing. | 抱えている問題を選ぶ。夜更かし。起きられない。自己嫌悪。 |
| Step 2 Title | Get nudged at the right moment | 最適なタイミングでNudgeを受け取る |
| Step 2 Desc | Anicca sends the right message when you need it most. | Aniccaが必要な時に、必要なメッセージを送る。 |
| Step 3 Title | Change—without trying | 頑張らずに、変わる |
| Step 3 Desc | No willpower needed. Just follow the nudge. | 意志力は不要。Nudgeに従うだけ。 |

**必要なアセット:**
- `/public/screenshots/onboarding.png`
- `/public/screenshots/nudge-card.png`
- `/public/screenshots/feedback.png`

---

### 8. Content Philosophy

```tsx
<section className="py-20 bg-muted/30">
  <h2 className="text-3xl font-bold text-center">Our Content Is Not Promotion</h2>
  <p className="mt-8 text-center text-muted-foreground text-pretty max-w-xl mx-auto">
    We don't post to get installs. We post to reduce suffering.
    Just by watching, you feel a little lighter. That's the goal.
  </p>

  <div className="mt-8 flex justify-center gap-6">
    <a href={LINKS.tiktok} target="_blank" rel="noopener noreferrer">
      <TikTokIcon className="size-8" />
    </a>
    <a href={LINKS.instagram} target="_blank" rel="noopener noreferrer">
      <InstagramIcon className="size-8" />
    </a>
    <a href={LINKS.youtube} target="_blank" rel="noopener noreferrer">
      <YoutubeIcon className="size-8" />
    </a>
    <a href={LINKS.x} target="_blank" rel="noopener noreferrer">
      <XIcon className="size-8" />
    </a>
  </div>
</section>
```

| 要素 | English | 日本語 |
|------|---------|--------|
| Title | Our Content Is Not Promotion | 私たちのコンテンツは宣伝ではない |
| Message | We don't post to get installs. We post to reduce suffering. Just by watching, you feel a little lighter. That's the goal. | インストールのために投稿しない。苦しみを減らすために投稿する。見ているだけで、少し楽になる。それが目標。 |

---

### 9. Download CTA

```tsx
<section className="py-20">
  <h2 className="text-3xl font-bold text-center">Ready?</h2>
  <div className="mt-8 flex justify-center">
    <a href={LINKS.appStore} target="_blank" rel="noopener noreferrer">
      <Image src="/app-store-badge.svg" alt="Download on the App Store" width={180} height={60} />
    </a>
  </div>
  <p className="mt-4 text-center text-sm text-muted-foreground">iOS 15.0+</p>
</section>
```

| 要素 | English | 日本語 |
|------|---------|--------|
| Title | Ready? | 準備はいい？ |

**必要なアセット:**
- `/public/app-store-badge.svg`（Apple公式）

---

### 10. Footer

```tsx
<footer className="py-8 border-t">
  <div className="text-center">
    <p className="font-bold">Anicca</p>

    <div className="mt-4 flex justify-center gap-6">
      {/* SNS Icons */}
    </div>

    <div className="mt-4 flex justify-center gap-4 text-sm text-muted-foreground">
      <a href="/privacy">Privacy Policy</a>
      <span>|</span>
      <a href="/terms">Terms</a>
      <span>|</span>
      <a href="/tokushoho">特定商取引法</a>
      <span>|</span>
      <a href="mailto:keiodaisuke@gmail.com">Contact</a>
    </div>

    <p className="mt-4 text-sm text-muted-foreground">
      © 2025 Anicca. All rights reserved.
    </p>
  </div>
</footer>
```

---

## 翻訳データ（i18n）

```ts
// lib/i18n.ts

export const translations = {
  en: {
    hero: {
      headline: "End Suffering.",
    },
    painPoint: {
      quote: '"I haven\'t changed in 6 years."',
      body: "You've tried 10 apps. All abandoned in 3 days. You've broken promises to yourself—hundreds of times. You've given up. But somewhere inside, you still want to change.",
    },
    vision: {
      title: "What if Buddha were software?",
      story: "2,500 years ago, one man ended suffering—one person at a time.",
      questions: [
        "What if he could reach billions?",
        "What if he never slept?",
        "What if he found you before you even asked?",
      ],
      closer: "That's what we're building.",
    },
    philosophy: {
      title: "The Big Don't",
      statement: "We will never add new features.",
      contrast: 'Other apps say "Connect more. Share more. Give us more data." We do the opposite. Less data. Deeper understanding.',
      agi: 'Our definition of AGI: Not "automate jobs." "End suffering."',
      closer: "Nothing else matters.",
    },
    roadmap: {
      title: "The Journey",
      timeline: ["You", "Society", "Humanity", "All Beings"],
      phases: [
        { title: "Phase 4-11", desc: "Your suffering. The right nudge at the right moment." },
        { title: "Phase 12", desc: "Social systems. Change the structures that create suffering." },
        { title: "Phase 13-14", desc: "All living beings. End suffering everywhere. Then, Anicca ends itself." },
      ],
      final: "When suffering reaches zero, Anicca terminates. That is impermanence. That is Anicca.",
    },
    howItWorks: {
      title: "How It Works",
      steps: [
        { title: "Tell your struggles", desc: "Pick what you're facing. Late nights. Can't wake up. Self-loathing." },
        { title: "Get nudged at the right moment", desc: "Anicca sends the right message when you need it most." },
        { title: "Change—without trying", desc: "No willpower needed. Just follow the nudge." },
      ],
    },
    contentPhilosophy: {
      title: "Our Content Is Not Promotion",
      message: "We don't post to get installs. We post to reduce suffering. Just by watching, you feel a little lighter. That's the goal.",
    },
    downloadCta: {
      title: "Ready?",
      requirement: "iOS 15.0+",
    },
    navbar: {
      vision: "Vision",
      howItWorks: "How It Works",
    },
  },
  ja: {
    hero: {
      headline: "苦しみを、終わらせる。",
    },
    painPoint: {
      quote: "「6年間、何も変われなかった。」",
      body: "10個のアプリを試した。全部3日で挫折した。自分との約束を、何百回も破ってきた。諦めてる。でも心のどこかでは、まだ変わりたい。",
    },
    vision: {
      title: "もしブッダがソフトウェアだったら？",
      story: "2500年前、一人の人間が苦しみを終わらせた。一人ずつ。",
      questions: [
        "もし何十億人に届けられたら？",
        "もし眠らなかったら？",
        "もしあなたが求める前に来てくれたら？",
      ],
      closer: "それが、私たちが作っているもの。",
    },
    philosophy: {
      title: "絶対にやらないこと",
      statement: "新機能は追加しない。永遠に。",
      contrast: "他のアプリは「もっと連携して。もっと共有して。もっとデータをください」と言う。私たちは逆。少ないデータで、より深く理解する。",
      agi: "私たちのAGIの定義：「仕事を自動化する」ではない。「苦しみを終わらせる」。",
      closer: "それ以外は、意味がない。",
    },
    roadmap: {
      title: "進化の道",
      timeline: ["個人", "社会", "人類", "全生物"],
      phases: [
        { title: "Phase 4-11", desc: "あなたの苦しみ。最適なタイミングで最適なNudge。" },
        { title: "Phase 12", desc: "社会システム。苦しみを生む構造を変える。" },
        { title: "Phase 13-14", desc: "全生物。あらゆる苦しみを終わらせる。そしてAniccaは自らを終了する。" },
      ],
      final: "苦しみがゼロになった時、Aniccaは終わる。それが無常。それがAnicca。",
    },
    howItWorks: {
      title: "使い方",
      steps: [
        { title: "苦しみを伝える", desc: "抱えている問題を選ぶ。夜更かし。起きられない。自己嫌悪。" },
        { title: "最適なタイミングでNudgeを受け取る", desc: "Aniccaが必要な時に、必要なメッセージを送る。" },
        { title: "頑張らずに、変わる", desc: "意志力は不要。Nudgeに従うだけ。" },
      ],
    },
    contentPhilosophy: {
      title: "私たちのコンテンツは宣伝ではない",
      message: "インストールのために投稿しない。苦しみを減らすために投稿する。見ているだけで、少し楽になる。それが目標。",
    },
    downloadCta: {
      title: "準備はいい？",
      requirement: "iOS 15.0+",
    },
    navbar: {
      vision: "ビジョン",
      howItWorks: "使い方",
    },
  },
};
```

---

## リンク設定

```ts
// lib/links.ts

export const links = {
  en: {
    appStore: "{{APP_STORE_URL}}", // ユーザー提供
    tiktok: "{{TIKTOK_EN_URL}}",   // ユーザー提供
    instagram: "{{INSTAGRAM_EN_URL}}", // ユーザー提供
    youtube: "{{YOUTUBE_EN_URL}}", // ユーザー提供
    x: "{{X_EN_URL}}", // オプション
  },
  ja: {
    appStore: "{{APP_STORE_URL}}", // 同じ（App Storeが自動ローカライズ）
    tiktok: "{{TIKTOK_JA_URL}}",   // ユーザー提供
    instagram: "{{INSTAGRAM_JA_URL}}", // ユーザー提供
    youtube: "{{YOUTUBE_JA_URL}}", // ユーザー提供
    x: "{{X_JA_URL}}", // オプション
  },
};
```

---

## ユーザー作業（実装前）

| # | タスク | 取得するもの |
|---|--------|-------------|
| 1 | iOSアプリのスクリーンショット3枚を撮影 | `onboarding.png`, `nudge-card.png`, `feedback.png` |
| 2 | App Store URL を確認 | `https://apps.apple.com/...` |
| 3 | TikTok URL（日英）を確認 | 2つのURL |
| 4 | Instagram URL（日英）を確認 | 2つのURL |
| 5 | YouTube URL（日英）を確認 | 2つのURL |
| 6 | X URL（オプション）を確認 | 2つのURL（あれば） |

---

## ユーザー作業（実装中）

| # | タイミング | タスク | 理由 |
|---|-----------|--------|------|
| 1 | スクリーンショット埋め込み後 | 画像を確認 | 自動テスト不可 |
| 2 | ローカルビルド後 | デザイン確認 | デザインの最終判断 |

---

## ユーザー作業（実装後）

| # | タスク | 確認項目 |
|---|--------|---------|
| 1 | Netlifyデプロイ後 | aniccaai.com でページが表示されるか |
| 2 | 全リンク確認 | App Store, SNS全てが正しく開くか |
| 3 | 言語切り替え確認 | EN/JA トグルが動作するか |

---

## デザイン制約（UI Skills）

| 制約 | 適用 |
|------|------|
| `h-screen` 禁止 | `h-dvh` を使用 |
| `text-balance` | 見出しに適用 |
| `text-pretty` | 本文に適用 |
| グラデーション禁止 | 使わない |
| アクセント1色のみ | 金色 `#D4AF37`（Philosophy のみ） |
| アニメーションなし | 明示的に要求されていない |
| Tailwind デフォルト shadow | カスタム禁止 |
| `cn()` ユーティリティ | クラス結合に使用 |

---

## 技術スタック

| 項目 | 技術 |
|------|------|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS 3.4 |
| UI Components | 既存の `components/ui/` |
| Font | Inter (英語), Noto Sans JP (日本語) |
| Icons | Lucide React |
| Deploy | Netlify |

---

## 実行手順

### 1. 開発サーバー起動

```bash
cd apps/landing && npm run dev
```

### 2. ビルド確認

```bash
cd apps/landing && npm run build
```

### 3. Netlify CLIでプレビュー

```bash
cd apps/landing && npx netlify-cli deploy --dir=.next
```

### 4. 本番デプロイ

```bash
cd apps/landing && npx netlify-cli deploy --prod --dir=.next
```

または、`dev` ブランチにプッシュすると自動デプロイ。

---

## Netlify設定

### 現在の設定確認

```bash
cd apps/landing && cat netlify.toml
```

なければ作成：

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

### 環境変数（必要に応じて）

Netlify ダッシュボードで設定：
- なし（現時点）

---

## テストマトリックス

| # | To-Be | テスト方法 | カバー |
|---|-------|-----------|--------|
| 1 | ルート → /en リダイレクト | 手動確認 | ❌ |
| 2 | 英語版表示 | 手動確認 | ❌ |
| 3 | 日本語版表示 | 手動確認 | ❌ |
| 4 | 言語トグル動作 | 手動確認 | ❌ |
| 5 | App Store リンク動作 | 手動確認 | ❌ |
| 6 | SNS リンク動作（日英別） | 手動確認 | ❌ |
| 7 | Netlify デプロイ成功 | CLI実行 | ❌ |
| 8 | aniccaai.com アクセス可能 | 手動確認 | ❌ |

**注意**: ランディングページは手動確認が中心。自動テストは不要。

---

## Skills / Sub-agents 使用マップ

| ステージ | 使用するもの | 用途 |
|---------|-------------|------|
| Spec作成 | - | 本ドキュメント |
| デザイン | Pencil MCP | ワイヤーフレーム作成 |
| 実装 | - | 手動コーディング |
| レビュー | `/code-review` | 実装後のレビュー |
| デプロイ | Netlify CLI | 本番デプロイ |

---

## レビューチェックリスト

実装完了後、以下を確認：

- [ ] 全 To-Be がチェックリストで完了しているか
- [ ] 英語版・日本語版の両方が正しく表示されるか
- [ ] 全リンク（App Store, SNS）が正しいURLに飛ぶか
- [ ] UI Skills の制約を満たしているか
- [ ] モバイルでのレスポンシブ表示が正しいか
- [ ] Netlify デプロイが成功しているか
- [ ] aniccaai.com でアクセス可能か

---

## まとめ

このSpecに従って実装すれば、以下が達成される：

1. **aniccaai.com** にアクセスすると新しいLPが表示される
2. **英語版**（`/en`）と**日本語版**（`/ja`）が動作する
3. **全てのリンク**（App Store, SNS）が機能する
4. **Netlify**で自動デプロイが動作する
5. **「End Suffering.」**というコアメッセージが伝わる
6. **Aniccaのビジョン**（Building Buddha）が表現される

---

**次のステップ**: ユーザーからスクリーンショット・リンク情報を受け取り、実装開始。
