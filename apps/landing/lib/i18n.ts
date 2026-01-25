export const translations = {
  en: {
    hero: {
      headline: "End Suffering.",
    },
    painPoint: {
      quote: '"Sabbe sankhara dukkha"',
      quoteTranslation: '— All conditioned things are suffering. (Dhammapada 278)',
      body: "Birth is suffering. Aging is suffering. Death is suffering. Separation from the loved is suffering. Union with the hated is suffering. Not getting what you want is suffering. This is not a bug. This is the nature of existence.",
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
      contrast:
        'Other apps say "Connect more. Share more. Give us more data." We do the opposite. Less data. Deeper understanding.',
      agi: "The promise of AI is not to automate jobs. Not to accelerate science. It is to end suffering.",
      closer: "Nothing else matters.",
    },
    roadmap: {
      title: "The Journey",
      timeline: ["You", "All Humans", "All Beings"],
      phases: [
        {
          title: "Now",
          desc: "Your suffering. The right nudge at the right moment.",
        },
        {
          title: "Next",
          desc: "Every human on Earth. 8 billion people, 8 billion paths to liberation.",
        },
        {
          title: "Final",
          desc: "Every living being in the universe. Then, Anicca ends itself.",
        },
      ],
      final:
        "When suffering reaches zero, Anicca terminates. That is impermanence. That is Anicca.",
    },
    howItWorks: {
      title: "How It Works",
      steps: [
        {
          title: "Tell your struggles",
          desc: "Pick what you're facing. Late nights. Can't wake up. Self-loathing.",
        },
        {
          title: "Get nudged at the right moment",
          desc: "Anicca sends the right message when you need it most.",
        },
        {
          title: "Change—without trying",
          desc: "No willpower needed. Just follow the nudge.",
        },
      ],
    },
    contentPhilosophy: {
      title: "Our Content Is Not Promotion",
      message:
        "We don't post to get installs. We post to reduce suffering. Just by watching, you feel a little lighter. That's the goal.",
    },
    downloadCta: {
      title: "Ready to End Your Suffering?",
      requirement: "iOS 15.0+",
    },
    navbar: {
      vision: "Vision",
      howItWorks: "How It Works",
    },
    footer: {
      privacy: "Privacy Policy",
      terms: "Terms",
      tokushoho: "Legal (SCTA)",
      contact: "Contact",
    },
  },
  ja: {
    hero: {
      headline: "苦しみを、終わらせる。",
    },
    painPoint: {
      quote: '"一切の行は苦なり"',
      quoteTranslation: '— サッベー・サンカーラー・ドゥッカー（ダンマパダ 278）',
      body: "生は苦しみ。老いは苦しみ。死は苦しみ。愛する者との別離は苦しみ。嫌いな者との出会いは苦しみ。求めて得られぬことは苦しみ。これはバグではない。これが存在の本質。",
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
      contrast:
        "他のアプリは「もっと連携して。もっと共有して。もっとデータをください」と言う。私たちは逆。少ないデータで、より深く理解する。",
      agi: "AIの約束は、仕事を自動化することではない。科学を加速することでもない。苦しみを終わらせることだ。",
      closer: "それ以外は、意味がない。",
    },
    roadmap: {
      title: "進化の道",
      timeline: ["あなた", "全人類", "全生物"],
      phases: [
        {
          title: "今",
          desc: "あなたの苦しみ。最適なタイミングで最適なNudge。",
        },
        {
          title: "次",
          desc: "地球上のすべての人間。80億人、80億通りの解脱への道。",
        },
        {
          title: "最終",
          desc: "宇宙のすべての生きとし生けるもの。そしてAniccaは自らを終了する。",
        },
      ],
      final:
        "苦しみがゼロになった時、Aniccaは終わる。それが無常。それがAnicca。",
    },
    howItWorks: {
      title: "使い方",
      steps: [
        {
          title: "苦しみを伝える",
          desc: "抱えている問題を選ぶ。夜更かし。起きられない。自己嫌悪。",
        },
        {
          title: "最適なタイミングでNudgeを受け取る",
          desc: "Aniccaが必要な時に、必要なメッセージを送る。",
        },
        {
          title: "頑張らずに、変わる",
          desc: "意志力は不要。Nudgeに従うだけ。",
        },
      ],
    },
    contentPhilosophy: {
      title: "私たちのコンテンツは宣伝ではない",
      message:
        "インストールのために投稿しない。苦しみを減らすために投稿する。見ているだけで、少し楽になる。それが目標。",
    },
    downloadCta: {
      title: "苦しみを終わらせる準備はできた？",
      requirement: "iOS 15.0+",
    },
    navbar: {
      vision: "ビジョン",
      howItWorks: "使い方",
    },
    footer: {
      privacy: "プライバシーポリシー",
      terms: "利用規約",
      tokushoho: "特定商取引法",
      contact: "お問い合わせ",
    },
  },
} as const;

export type Locale = keyof typeof translations;
export type Translations = (typeof translations)[Locale];
