import Foundation

/// 1枚画面カードで表示するNudgeコンテンツ
struct NudgeContent: Identifiable {
    let id = UUID()
    let problemType: ProblemType
    let notificationText: String
    let detailText: String
    let variantIndex: Int

    /// 問題タイプから通知文言と詳細文言を取得
    static func content(for problem: ProblemType, variantIndex: Int = 0) -> NudgeContent {
        let messages = notificationMessages(for: problem)
        let details = detailMessages(for: problem)
        let index = variantIndex % max(1, messages.count)

        return NudgeContent(
            problemType: problem,
            notificationText: messages[safe: index] ?? messages[0],
            detailText: details[safe: index] ?? details[0],
            variantIndex: index
        )
    }

    /// 日付ベースでローテーション
    static func contentForToday(for problem: ProblemType) -> NudgeContent {
        let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
        let messages = notificationMessages(for: problem)
        let index = (dayOfYear - 1) % max(1, messages.count)
        return content(for: problem, variantIndex: index)
    }
}

// MARK: - Notification Messages
extension NudgeContent {
    /// 通知文言（スペックに基づく）
    static func notificationMessages(for problem: ProblemType) -> [String] {
        switch problem {
        case .stayingUpLate:
            return [
                "スクロールより、呼吸。",
                "その「あと5分だけ」で、何年失ってきた？",
                "明日の自分、泣くよ。"
            ]
        case .cantWakeUp:
            return [
                "起きないと、今日が始まらん。",
                "あと5分の君、信用ゼロ。",
                "Stay Mediocre"
            ]
        case .selfLoathing:
            return [
                "今日も生きてる。それだけで十分。",
                "自分を責めるのは、もうやめていい。",
                "あなたは思ってるより、ずっといい人だよ。"
            ]
        case .rumination:
            return [
                "今、何を感じてる？",
                "Are you present right now?",
                "朝の5分、瞑想してみない？"
            ]
        case .procrastination:
            return [
                "5分だけ。それだけでいい。",
                "また自分との約束、破る？",
                "やらない理由、全部言い訳。"
            ]
        case .anxiety:
            return [
                "今この瞬間、あなたは安全。",
                "今、何を感じてる？",
                "深呼吸。4秒吸って、4秒止めて、4秒吐く。"
            ]
        case .lying:
            return [
                "今日は正直に生きる日。"
            ]
        case .badMouthing:
            return [
                "今日は誰かを傷つける言葉を使わない。",
                "その言葉、自分に言われたらどう感じる？"
            ]
        case .pornAddiction:
            return [
                "誘惑に勝てば、明日の自分が変わる。",
                "本当にそれが欲しい？それとも逃げたいだけ？"
            ]
        case .alcoholDependency:
            return [
                "今夜は飲まない。それだけで勝ち。",
                "飲まなくても、リラックスできる。"
            ]
        case .anger:
            return [
                "怒りは自分を傷つける。深呼吸。",
                "3秒待ってから、話そう。"
            ]
        case .obsessive:
            return [
                "完璧じゃなくていい。手放していい。",
                "その考え、何回目？",
                "考えすぎてない？"
            ]
        case .loneliness:
            return [
                "一人じゃない。誰かがあなたを想ってる。",
                "大切な人に、一言送ってみない？"
            ]
        }
    }

    /// 1枚画面の詳細説明文（スペックに基づく）
    static func detailMessages(for problem: ProblemType) -> [String] {
        switch problem {
        case .stayingUpLate:
            return [
                "夜更かしは明日の自分を傷つける行為。今夜は画面を閉じよう。",
                "睡眠不足の脳は酔っ払いと同じ判断力。明日の自分を守るために、今夜は休もう。",
                "今スクロールしてる内容、明日覚えてる？でも睡眠不足は確実に残る。"
            ]
        case .cantWakeUp:
            return [
                "布団の中で何も変わらない。まず足を床につけよう。",
                "「あと5分」を何回言った？今起きれば、今日の自分を好きになれる。",
                "平凡なままでいい？今起きれば、今日は違う1日になる。"
            ]
        case .selfLoathing:
            return [
                "自己嫌悪は、自分を良くしようとしている証拠。でもその方法は逆効果。今日できた小さなことを1つ思い出してみて。",
                "完璧じゃなくていい。今のあなたで十分。",
                "自分に厳しすぎる。他の人にするように、自分にも優しくしていい。"
            ]
        case .rumination:
            return [
                "頭の中のループに気づいた？気づいたなら、もう半分解決してる。今この瞬間に戻ろう。",
                "過去でも未来でもなく、今ここにいる？深呼吸して、今の身体の感覚に意識を向けてみて。",
                "反芻を止める最も効果的な方法は瞑想。今朝5分だけ、呼吸に集中してみよう。"
            ]
        case .procrastination:
            return [
                "完璧にやる必要はない。5分だけ始めれば、続けられる。",
                "先延ばしは未来の自分を苦しめる。今やれば、未来の自分が感謝する。",
                "本当にできない？それとも、やりたくないだけ？正直になろう。"
            ]
        case .anxiety:
            return [
                "不安は未来への恐れ。でも今この瞬間は、何も起きていない。深呼吸して、今に戻ろう。",
                "不安に気づいた？気づいたなら、それを観察してみて。不安は来て、去っていく。",
                "身体を落ち着かせれば、心も落ち着く。今すぐやってみて。"
            ]
        case .lying:
            return [
                "嘘は一時的に楽でも、長期的には自分を苦しめる。今日は誠実でいよう。"
            ]
        case .badMouthing:
            return [
                "悪口は言った瞬間気持ちいいかもしれない。でも後から自己嫌悪が来る。今日は善い言葉だけ。",
                "言う前に一呼吸。相手の立場に立ってみよう。"
            ]
        case .pornAddiction:
            return [
                "今の衝動は一時的。5分待てば、衝動は去る。その5分を乗り越えよう。",
                "ポルノは一時的な逃避。根本の問題は解決しない。今何から逃げようとしてる？"
            ]
        case .alcoholDependency:
            return [
                "1日だけ。今夜だけ我慢しよう。明日の朝、自分を誇れる。",
                "お酒なしでストレス解消する方法を試してみて。散歩、深呼吸、音楽。"
            ]
        case .anger:
            return [
                "怒りを持ち続けるのは、自分が毒を飲んで相手が死ぬのを待つようなもの。手放そう。",
                "怒りに任せて話すと後悔する。3秒だけ待とう。"
            ]
        case .obsessive:
            return [
                "その考え、本当に重要？今手放しても、何も悪いことは起きない。",
                "同じことを考え続けても、答えは変わらない。今は手放して、後で考えよう。",
                "考えることと、実際に行動することは違う。今は考えるのをやめて、動いてみよう。"
            ]
        case .loneliness:
            return [
                "孤独を感じても、それは真実じゃない。今日、誰かに連絡してみない？",
                "つながりは待っていても来ない。自分から動こう。"
            ]
        }
    }
}

// MARK: - Safe Array Access
private extension Array {
    subscript(safe index: Int) -> Element? {
        return indices.contains(index) ? self[index] : nil
    }
}
