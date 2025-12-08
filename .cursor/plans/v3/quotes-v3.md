# quotes-v3.md

Talk画面の「今日の一言」Quoteカードに表示する固定メッセージの定義。

---

## 概要

### 使用方法

- Talk画面のQuoteカードに1日1つ表示
- `dayOfYear % quotes.count` で選択（30個なので、約12日周期で同じQuoteが表示される）
- パーソナライズなし（全ユーザー同じ）
- **OSの言語設定に応じて日本語/英語を切り替える**

### 言語切り替えロジック

```swift
// AppState.userProfile.preferredLanguage または Locale.current.language を使用
let locale = Locale.current.language.languageCode?.identifier ?? "en"
let quotes = locale == "ja" ? quotesJapanese : quotesEnglish
let todayQuote = quotes[Calendar.current.ordinality(of: .day, in: .year, for: Date())! % quotes.count]
```

### トーンガイドライン

以下はAniccaの世界観（v3-ux.md）に基づくトーン：

- **温かく、判断せず、寄り添う**: 批判や命令ではなく、静かに指し示す
- **責めず、しかしごまかさない**: 現実を正直に伝えつつ、自己否定には導かない
- **仏教的智慧を地の言葉で翻訳**: オカルトではなく「世界の見方」として伝える
- **マインドフルネス・ACT・Self-Compassionの視点**: 科学的根拠に基づく

---

## 出典・参考文献

本Quotesの作成にあたり、以下の文献・概念を参考にした：

| カテゴリ | 出典・参考 |
|---------|-----------|
| **Self-Compassion** | Dr. Kristin Neff（セルフコンパッション研究の第一人者）の3要素：自分への優しさ、共通の人間性、マインドフルネス |
| **ACT (Acceptance and Commitment Therapy)** | Steven C. Hayes らによる心理的柔軟性の6スキル：受容、脱フュージョン、今この瞬間への接触、文脈としての自己、価値、コミットされた行動 |
| **仏教的智慧** | 『ダンマパダ（法句経）』『スッタニパータ』などの初期仏教経典、無常（anicca）・苦（dukkha）・慈悲（karuṇā）の教え |
| **マインドフルネス** | Jon Kabat-Zinn のMBSR、Thich Nhat Hanh の呼吸と今この瞬間への意識 |

---

## Quotes（30個）

### 英語版 (quotesEnglish)

#### 自己慈悲 / Self-Compassion (1-8)

```swift
// 1. 自己批判への対処 - Kristin Neff の教えに基づく
"Even when you hate yourself, you still deserve gentleness."

// 2. 完璧主義への寛容 - Robert Holden の洞察を参考
"You don't have to fix your whole life tonight. One honest step is enough."

// 3. 傷つきへの承認 - Self-Compassion の「共通の人間性」
"The part of you that's hurting is also the part that wants to heal."

// 4. 自己批判からの解放 - Louise Hay の教え
"You've criticized yourself for years. What if you tried kindness instead?"

// 5. 苦しみの瞬間での自己慈悲 - Kristin Neff の慈悲のフレーズ
"This is a moment of suffering. May you be kind to yourself."

// 6. 自己受容の価値 - ACT の受容概念
"There is no amount of self-improvement that can make up for a lack of self-acceptance."

// 7. 失敗への寛容 - Eleanor Brown の言葉を参考
"Stop beating yourself up for beating yourself up. Just notice, and begin again."

// 8. 傷ついた自分への視点転換 - Anicca の核フレーズ
"You're not a broken person. You're a healing one."
```

#### マインドフルネス / Present Moment (9-16)

```swift
// 9. 今この瞬間への集中 - 仏教の教え
"This breath is the only one that matters right now."

// 10. 思考との脱同一化 - ACT の脱フュージョン
"You are not your thoughts. You are the one watching them."

// 11. 感覚への回帰 - Shamash Alidina のACT quote
"Your senses are always in the present. Return to them when you feel lost."

// 12. 心の天気としての感情 - ACT のメタファー
"Your mind is the sky. Thoughts and feelings are merely weather."

// 13. 過去と未来からの解放 - 仏教の教え
"The past is gone. The future is not yet. Only this moment is real."

// 14. 変化の受容 - 無常（anicca）の教え
"Everything changes. Even this feeling will pass."

// 15. 観察者としての自己 - ACT の「文脈としての自己」
"Behind all your thoughts, there is a stillness that never leaves."

// 16. 今日への集中 - 仏教経典『バッデーカラッタ・スッタ』
"Today is enough. Tomorrow will take care of itself."
```

#### 行動変容 / Behavior Change (17-23)

```swift
// 17. 小さな一歩の力 - 行動科学の原則
"Small changes, repeated, become who you are."

// 18. 始めることの価値 - 仏教の教え
"The best time to start was yesterday. The second best time is now."

// 19. 価値に基づく行動 - ACT の価値概念
"When you act on your values, happiness follows. Not the other way around."

// 20. 恐れとともに進む - ACT の心理的柔軟性
"Courage isn't having no fear. It's moving gently toward what matters."

// 21. 水滴の教え - 仏教『ダンマパダ』
"A jug fills drop by drop. So does a life of meaning."

// 22. 自分自身を整える - 仏教の教え
"First, tend to yourself. Then you can tend to others."

// 23. 思考とともに行動する - ACT のコミットされた行動
"You don't need to eliminate negative thoughts. Take them with you and do what matters."
```

#### 苦しみへの寄り添い / Suffering & Acceptance (24-30)

```swift
// 24. 苦しみの普遍性 - 仏教の四諦
"Pain is part of life. Suffering alone is optional."

// 25. 苦しみが教えるもの - Self-Compassion の「共通の人間性」
"Your struggles don't define you. How you meet them does."

// 26. 抵抗と受容 - ACT の受容概念
"What you resist persists. What you accept transforms."

// 27. 感情との闘いをやめる - ACT のメタファー
"You don't have to fight your emotions. Try letting them be."

// 28. 執着からの解放 - 仏教の教え
"You only lose what you cling to."

// 29. 憎しみからの解放 - 仏教『ダンマパダ』
"Anger will only burn you. Let it go, not for them, but for yourself."

// 30. 静かな強さ - 仏教の教え
"Like a broken bell that makes no sound, find peace in stillness."
```

---

### 日本語版 (quotesJapanese)

#### 自己慈悲 / セルフコンパッション (1-8)

```swift
// 1. 自己批判への対処
"自分を嫌いな時でも、あなたは優しくされる価値がある。"

// 2. 完璧主義への寛容
"今夜、人生のすべてを直す必要はない。誠実な一歩で、十分。"

// 3. 傷つきへの承認
"傷ついている部分は、癒されたいと願っている部分でもある。"

// 4. 自己批判からの解放
"何年も自分を責めてきた。今度は、優しさを試してみない？"

// 5. 苦しみの瞬間での自己慈悲
"今、苦しいんだね。自分に優しくしていいんだよ。"

// 6. 自己受容の価値
"どれだけ自分を改善しても、自己受容の代わりにはならない。"

// 7. 失敗への寛容
"自分を責めすぎていることを、また責めないで。ただ気づいて、また始めよう。"

// 8. 傷ついた自分への視点転換
"壊れた人間じゃない。癒えていく途中の人間だ。"
```

#### マインドフルネス / 今この瞬間 (9-16)

```swift
// 9. 今この瞬間への集中
"今、この呼吸だけが大切。"

// 10. 思考との脱同一化
"あなたは思考ではない。思考を見ている存在だ。"

// 11. 感覚への回帰
"五感はいつも今この瞬間にある。迷ったら、感覚に戻ろう。"

// 12. 心の天気としての感情
"心は空。思考や感情は、ただ通り過ぎる雲。"

// 13. 過去と未来からの解放
"過去はもう終わった。未来はまだ来ていない。今だけが、本当。"

// 14. 変化の受容
"すべては変わる。この気持ちも、必ず過ぎていく。"

// 15. 観察者としての自己
"どんな思考の奥にも、静けさがある。それは消えない。"

// 16. 今日への集中
"今日一日で、十分。明日は明日が面倒を見てくれる。"
```

#### 行動変容 / 成長 (17-23)

```swift
// 17. 小さな一歩の力
"小さな変化の積み重ねが、あなた自身になる。"

// 18. 始めることの価値
"始めるのに一番いいタイミングは昨日だった。二番目にいいのは、今。"

// 19. 価値に基づく行動
"自分の価値観に沿って動くと、幸せはあとからついてくる。"

// 20. 恐れとともに進む
"勇気とは、恐れがないことじゃない。大切なことに向かって、静かに進むこと。"

// 21. 水滴の教え
"水瓶は一滴ずつ満ちていく。意味のある人生も同じ。"

// 22. 自分自身を整える
"まず自分を整えること。それから他の人に手を差し伸べられる。"

// 23. 思考とともに行動する
"ネガティブな思考を消す必要はない。連れていって、大切なことをしよう。"
```

#### 苦しみへの寄り添い / 受容 (24-30)

```swift
// 24. 苦しみの普遍性
"痛みは人生の一部。でも、一人で苦しむ必要はない。"

// 25. 苦しみが教えるもの
"苦しみがあなたを定義するのではない。苦しみとどう向き合うかが、あなたを定義する。"

// 26. 抵抗と受容
"抵抗するものは続く。受け入れるものは変わっていく。"

// 27. 感情との闘いをやめる
"感情と戦わなくていい。ただ、そこにいることを許そう。"

// 28. 執着からの解放
"失うのは、しがみついているものだけ。"

// 29. 怒りからの解放
"怒りは自分を焼くだけ。手放すのは、相手のためじゃなく、自分のため。"

// 30. 静かな強さ
"割れた鐘のように静かに。そこに、安らぎがある。"
```

---

## 実装仕様

### データ構造

```swift
struct Quote: Identifiable {
    let id: Int
    let textEN: String
    let textJA: String
    let category: QuoteCategory
}

enum QuoteCategory: String, CaseIterable {
    case selfCompassion = "self_compassion"
    case presentMoment = "present_moment"
    case behaviorChange = "behavior_change"
    case sufferingAcceptance = "suffering_acceptance"
}
```

### Quoteの取得ロジック

```swift
extension AppState {
    var todayQuote: String {
        let quotes = Quote.all // 30個の固定配列
        let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
        let index = (dayOfYear - 1) % quotes.count
        let quote = quotes[index]
        
        // 言語設定に応じて返す
        let preferredLanguage = userProfile?.preferredLanguage ?? Locale.current.language.languageCode?.identifier ?? "en"
        return preferredLanguage == "ja" ? quote.textJA : quote.textEN
    }
}
```

### UIコンポーネント

```swift
struct QuoteCardView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        VStack(spacing: 8) {
            Text(appState.todayQuote)
                .font(.system(size: 16, weight: .regular))
                .foregroundColor(Color("TextPrimary"))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
        }
        .frame(maxWidth: .infinity)
        .background(Color("CardBackground"))
        .cornerRadius(20)
    }
}
```

---

## Quote一覧（コピペ用）

### 英語版（配列形式）

```swift
let quotesEnglish: [String] = [
    // Self-Compassion (1-8)
    "Even when you hate yourself, you still deserve gentleness.",
    "You don't have to fix your whole life tonight. One honest step is enough.",
    "The part of you that's hurting is also the part that wants to heal.",
    "You've criticized yourself for years. What if you tried kindness instead?",
    "This is a moment of suffering. May you be kind to yourself.",
    "There is no amount of self-improvement that can make up for a lack of self-acceptance.",
    "Stop beating yourself up for beating yourself up. Just notice, and begin again.",
    "You're not a broken person. You're a healing one.",
    
    // Present Moment (9-16)
    "This breath is the only one that matters right now.",
    "You are not your thoughts. You are the one watching them.",
    "Your senses are always in the present. Return to them when you feel lost.",
    "Your mind is the sky. Thoughts and feelings are merely weather.",
    "The past is gone. The future is not yet. Only this moment is real.",
    "Everything changes. Even this feeling will pass.",
    "Behind all your thoughts, there is a stillness that never leaves.",
    "Today is enough. Tomorrow will take care of itself.",
    
    // Behavior Change (17-23)
    "Small changes, repeated, become who you are.",
    "The best time to start was yesterday. The second best time is now.",
    "When you act on your values, happiness follows. Not the other way around.",
    "Courage isn't having no fear. It's moving gently toward what matters.",
    "A jug fills drop by drop. So does a life of meaning.",
    "First, tend to yourself. Then you can tend to others.",
    "You don't need to eliminate negative thoughts. Take them with you and do what matters.",
    
    // Suffering & Acceptance (24-30)
    "Pain is part of life. Suffering alone is optional.",
    "Your struggles don't define you. How you meet them does.",
    "What you resist persists. What you accept transforms.",
    "You don't have to fight your emotions. Try letting them be.",
    "You only lose what you cling to.",
    "Anger will only burn you. Let it go, not for them, but for yourself.",
    "Like a broken bell that makes no sound, find peace in stillness."
]
```

### 日本語版（配列形式）

```swift
let quotesJapanese: [String] = [
    // 自己慈悲 (1-8)
    "自分を嫌いな時でも、あなたは優しくされる価値がある。",
    "今夜、人生のすべてを直す必要はない。誠実な一歩で、十分。",
    "傷ついている部分は、癒されたいと願っている部分でもある。",
    "何年も自分を責めてきた。今度は、優しさを試してみない？",
    "今、苦しいんだね。自分に優しくしていいんだよ。",
    "どれだけ自分を改善しても、自己受容の代わりにはならない。",
    "自分を責めすぎていることを、また責めないで。ただ気づいて、また始めよう。",
    "壊れた人間じゃない。癒えていく途中の人間だ。",
    
    // 今この瞬間 (9-16)
    "今、この呼吸だけが大切。",
    "あなたは思考ではない。思考を見ている存在だ。",
    "五感はいつも今この瞬間にある。迷ったら、感覚に戻ろう。",
    "心は空。思考や感情は、ただ通り過ぎる雲。",
    "過去はもう終わった。未来はまだ来ていない。今だけが、本当。",
    "すべては変わる。この気持ちも、必ず過ぎていく。",
    "どんな思考の奥にも、静けさがある。それは消えない。",
    "今日一日で、十分。明日は明日が面倒を見てくれる。",
    
    // 行動変容 (17-23)
    "小さな変化の積み重ねが、あなた自身になる。",
    "始めるのに一番いいタイミングは昨日だった。二番目にいいのは、今。",
    "自分の価値観に沿って動くと、幸せはあとからついてくる。",
    "勇気とは、恐れがないことじゃない。大切なことに向かって、静かに進むこと。",
    "水瓶は一滴ずつ満ちていく。意味のある人生も同じ。",
    "まず自分を整えること。それから他の人に手を差し伸べられる。",
    "ネガティブな思考を消す必要はない。連れていって、大切なことをしよう。",
    
    // 苦しみへの寄り添い (24-30)
    "痛みは人生の一部。でも、一人で苦しむ必要はない。",
    "苦しみがあなたを定義するのではない。苦しみとどう向き合うかが、あなたを定義する。",
    "抵抗するものは続く。受け入れるものは変わっていく。",
    "感情と戦わなくていい。ただ、そこにいることを許そう。",
    "失うのは、しがみついているものだけ。",
    "怒りは自分を焼くだけ。手放すのは、相手のためじゃなく、自分のため。",
    "割れた鐘のように静かに。そこに、安らぎがある。"
]
```

---

## カテゴリ別分布

| カテゴリ | 個数 | 番号 | テーマ |
|---------|------|------|--------|
| Self-Compassion | 8 | 1-8 | 自己批判、失敗への寛容、傷つきへの承認 |
| Present Moment | 8 | 9-16 | 呼吸、思考との脱同一化、無常の受容 |
| Behavior Change | 7 | 17-23 | 小さな一歩、価値観、恐れとの共存 |
| Suffering & Acceptance | 7 | 24-30 | 苦しみの普遍性、受容、執着からの解放 |
| **合計** | **30** | - | - |

---

## 注意事項

1. **1-2行に収める**: 長すぎるとUIのQuoteカードが崩れる（最大約60文字程度）
2. **Aniccaのトーン**: 温かく、判断せず、寄り添う。命令形は避ける
3. **文化的配慮**: 日本語版は直訳ではなく、日本語として自然な表現に調整
4. **科学的根拠**: Self-Compassion、ACT、仏教的智慧に基づく

---

## 更新履歴

- 2025-12-08: 初版作成（30個、日英両対応）

