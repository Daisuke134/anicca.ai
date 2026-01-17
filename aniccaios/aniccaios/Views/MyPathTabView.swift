import SwiftUI

/// My Path タブ - ユーザーが選択した問題（苦しみ）のリストを表示
struct MyPathTabView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedProblem: ProblemType?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // ヘッダー説明
                    Text("あなたが向き合いたい問題")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 20)
                        .padding(.top, 8)

                    // 問題カードリスト
                    LazyVStack(spacing: 12) {
                        ForEach(userProblems, id: \.self) { problem in
                            ProblemCardView(
                                problem: problem,
                                onDeepDive: {
                                    selectedProblem = problem
                                }
                            )
                        }
                    }
                    .padding(.horizontal, 16)

                    // 問題がない場合
                    if userProblems.isEmpty {
                        emptyStateView
                    }
                }
                .padding(.bottom, 100)
            }
            .navigationTitle("My Path")
            .background(AppBackground())
            .sheet(item: $selectedProblem) { problem in
                DeepDiveSheetView(problem: problem)
            }
        }
    }

    private var userProblems: [ProblemType] {
        appState.userProfile.struggles.compactMap { ProblemType(rawValue: $0) }
    }

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "leaf.fill")
                .font(.system(size: 48))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)

            Text("問題が選択されていません")
                .font(.headline)
                .foregroundStyle(AppTheme.Colors.label)

            Text("プロフィール設定から向き合いたい問題を選択してください")
                .font(.subheadline)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }
}

// MARK: - ProblemCardView
struct ProblemCardView: View {
    let problem: ProblemType
    let onDeepDive: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // アイコンと問題名
            HStack(spacing: 12) {
                Text(problem.icon)
                    .font(.system(size: 32))

                VStack(alignment: .leading, spacing: 4) {
                    Text(problem.displayName)
                        .font(.headline)
                        .foregroundStyle(AppTheme.Colors.label)

                    Text(problem.notificationTitle)
                        .font(.caption)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }

                Spacer()
            }

            Divider()

            // Deep Dive ボタン
            Button(action: onDeepDive) {
                HStack {
                    Image(systemName: "arrow.down.circle.fill")
                        .font(.system(size: 16))
                    Text("深掘りする")
                        .font(.subheadline.weight(.medium))
                }
                .foregroundStyle(AppTheme.Colors.primaryButton)
            }
        }
        .padding(16)
        .background(AppTheme.Colors.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - DeepDiveSheetView
struct DeepDiveSheetView: View {
    let problem: ProblemType
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // ヘッダー
                    VStack(alignment: .center, spacing: 12) {
                        Text(problem.icon)
                            .font(.system(size: 48))

                        Text(problem.displayName)
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(AppTheme.Colors.label)

                        Text("自分を深く理解するための質問")
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 16)

                    Divider()
                        .padding(.horizontal, 20)

                    // 質問リスト
                    VStack(alignment: .leading, spacing: 20) {
                        ForEach(Array(deepDiveQuestions.enumerated()), id: \.offset) { index, question in
                            HStack(alignment: .top, spacing: 12) {
                                Text("\(index + 1)")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 24, height: 24)
                                    .background(AppTheme.Colors.primaryButton)
                                    .clipShape(Circle())

                                Text(question)
                                    .font(.body)
                                    .foregroundStyle(AppTheme.Colors.label)
                                    .lineSpacing(4)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.bottom, 40)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    }
                }
            }
            .background(AppBackground())
        }
    }

    private var deepDiveQuestions: [String] {
        DeepDiveQuestions.questions(for: problem)
    }
}

// MARK: - DeepDiveQuestions
enum DeepDiveQuestions {
    static func questions(for problem: ProblemType) -> [String] {
        switch problem {
        case .stayingUpLate:
            return [
                "夜更かしをやめられない本当の理由は何だと思う？",
                "その時間に何をしてる？スマホ？SNS？YouTube？",
                "理想の就寝時間は何時？なぜその時間？",
                "夜更かしをやめたら、明日の自分はどう変わると思う？",
                "今夜、就寝時間を守るために何ができる？"
            ]
        case .cantWakeUp:
            return [
                "理想の起床時間は何時？",
                "起きられない朝、何を感じてる？",
                "前日の夜、何時に寝てる？",
                "起きた後、最初にしたいことは何？",
                "朝が楽しみになるとしたら、何がある？"
            ]
        case .selfLoathing:
            return [
                "自分を責める時、何について責めてる？",
                "その基準は誰が決めたもの？",
                "友達が同じ状況だったら、何て言う？",
                "今日、自分を許せることは1つある？",
                "自分の良いところを3つ挙げるとしたら？"
            ]
        case .rumination:
            return [
                "同じ考えが頭の中でループする時、何について考えてる？",
                "その考えを止められない理由は何だと思う？",
                "考えることで何か解決してる？",
                "今この瞬間、身体はどう感じてる？",
                "5分間、呼吸だけに集中できる？"
            ]
        case .procrastination:
            return [
                "今、先延ばしにしていることは何？",
                "なぜそれを避けてる？本当の理由は？",
                "5分だけやるとしたら、何から始める？",
                "それを終わらせた自分を想像してみて。どう感じる？",
                "今すぐできる最小の一歩は何？"
            ]
        case .anxiety:
            return [
                "今、何について不安を感じてる？",
                "その不安は現実に起きてる？それとも想像？",
                "最悪のケースが起きたら、どう対処する？",
                "今この瞬間、安全？",
                "深呼吸を3回してみて。何か変わった？"
            ]
        case .lying:
            return [
                "最近、嘘をついたのはいつ？",
                "なぜ嘘をつく必要があった？",
                "本当のことを言ったらどうなってた？",
                "誠実でいることの難しさは何？",
                "今日、正直でいられる小さな機会は何？"
            ]
        case .badMouthing:
            return [
                "最近、誰かの悪口を言った？",
                "なぜその人について話したくなった？",
                "悪口を言った後、どう感じた？",
                "その人に直接言えることはある？",
                "今日、誰かを褒める機会は何？"
            ]
        case .pornAddiction:
            return [
                "ポルノを見たくなるのはどんな時？",
                "その時、何から逃げようとしてる？",
                "見た後、どう感じる？",
                "本当に欲しいものは何？",
                "衝動が来た時、代わりにできることは何？"
            ]
        case .alcoholDependency:
            return [
                "お酒を飲みたくなるのはどんな時？",
                "お酒なしでリラックスする方法は何？",
                "飲まなかった翌朝、どう感じる？",
                "お酒がなくても楽しめる活動は何？",
                "今週、1日だけ飲まない日を作れる？"
            ]
        case .anger:
            return [
                "最近、怒りを感じたのはいつ？",
                "怒りの下にある感情は何？（傷つき？恐れ？）",
                "怒りを持ち続けると誰が一番傷つく？",
                "その怒りを手放すために何ができる？",
                "怒りを感じた時、3秒待てる？"
            ]
        case .obsessive:
            return [
                "何について考えすぎてる？",
                "その考えをコントロールしたい？それとも手放したい？",
                "完璧じゃなくていいとしたら、何が変わる？",
                "今、手放しても大丈夫なことは何？",
                "考えることと行動すること、どちらに時間を使ってる？"
            ]
        case .loneliness:
            return [
                "孤独を感じるのはどんな時？",
                "つながりたい人は誰？",
                "最後に誰かに連絡したのはいつ？",
                "一人でいることと孤独を感じることの違いは？",
                "今日、誰かに一言メッセージを送れる？"
            ]
        }
    }
}

// MARK: - ProblemType Identifiable
extension ProblemType: Identifiable {
    var id: String { rawValue }
}

#Preview {
    MyPathTabView()
        .environmentObject(AppState.shared)
}
