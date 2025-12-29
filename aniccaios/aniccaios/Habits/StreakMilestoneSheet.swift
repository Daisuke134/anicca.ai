import SwiftUI
import UIKit

struct StreakMilestoneSheet: View {
    let habitName: String
    let streak: Int
    let onDismiss: () -> Void
    
    @State private var showAnimation = false
    @State private var scale: CGFloat = 0.8
    @State private var opacity: Double = 0
    
    static let milestones: Set<Int> = [7, 14, 21, 30, 60, 90, 100, 365]
    
    private var milestoneTitle: String {
        switch streak {
        case 7: return String(localized: "milestone_7_title", defaultValue: "1週間、続けられました")
        case 14: return String(localized: "milestone_14_title", defaultValue: "2週間、続けられました")
        case 21: return String(localized: "milestone_21_title", defaultValue: "3週間、続けられました")
        case 30: return String(localized: "milestone_30_title", defaultValue: "1ヶ月、続けられました")
        case 60: return String(localized: "milestone_60_title", defaultValue: "2ヶ月、続けられました")
        case 90: return String(localized: "milestone_90_title", defaultValue: "3ヶ月、続けられました")
        case 100: return String(localized: "milestone_100_title", defaultValue: "100日、続けられました")
        case 365: return String(localized: "milestone_365_title", defaultValue: "1年、続けられました")
        default: return String(localized: "milestone_generic_title", defaultValue: "素晴らしい継続です")
        }
    }
    
    private var milestoneSubtitle: String {
        // ローカライズ対応: Localizable.stringsで定義
        let format = NSLocalizedString("milestone_subtitle_format", 
                                       value: "%@を%lld日間続けています", 
                                       comment: "Milestone subtitle format: {habitName}を{streak}日間続けています")
        return String(format: format, habitName, streak)
    }
    
    var body: some View {
        ZStack {
            // 背景オーバーレイ（Figma: rgba(0,0,0,0.5) + blur）
            Color.black.opacity(0.5)
                .ignoresSafeArea()
                .onTapGesture { dismiss() }
            
            // ダイアログカード
            VStack(spacing: 0) {
                // 蓮アイコン（Figma: 96px円、#F4D9D0 30%背景）
                ZStack {
                    Circle()
                        .fill(Color(red: 0.96, green: 0.85, blue: 0.82).opacity(0.3))
                        .frame(width: 96, height: 96)
                    
                    Text("🪷")
                        .font(.system(size: 48))
                        .scaleEffect(showAnimation ? 1.05 : 1.0)
                        .animation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true), value: showAnimation)
                }
                .padding(.top, 32)
                
                // 日数表示（Figma: 72px bold #D4A574）
                HStack(alignment: .lastTextBaseline, spacing: 0) {
                    Text("\(streak)")
                        .font(.system(size: 72, weight: .bold, design: .rounded))
                        .foregroundStyle(Color(red: 0.83, green: 0.65, blue: 0.46))
                    
                    Text("日")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(Color(red: 0.83, green: 0.65, blue: 0.46))
                        .padding(.bottom, 12)
                }
                .padding(.top, 24)
                
                // 区切り線（Figma: 48px x 2px）
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color(red: 0.83, green: 0.65, blue: 0.46).opacity(0.3))
                    .frame(width: 48, height: 2)
                    .padding(.top, 4)
                
                // メインメッセージ（Figma: 24px bold #3A3A3A）
                Text(milestoneTitle)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(Color(red: 0.23, green: 0.23, blue: 0.23))
                    .multilineTextAlignment(.center)
                    .padding(.top, 24)
                
                // サブメッセージ（Figma: 16px #9CA3AF）
                Text(milestoneSubtitle)
                    .font(.system(size: 16))
                    .foregroundStyle(Color(red: 0.61, green: 0.64, blue: 0.69))
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
                    .padding(.horizontal, 24)
                
                // 続けるボタン（Figma: グラデーション #D4A574→#E8B896）
                Button(action: dismiss) {
                    Text(String(localized: "milestone_continue", defaultValue: "続けていく"))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(
                            LinearGradient(
                                colors: [
                                    Color(red: 0.83, green: 0.65, blue: 0.46),
                                    Color(red: 0.91, green: 0.72, blue: 0.59)
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .clipShape(Capsule())
                        .shadow(color: Color(red: 0.83, green: 0.65, blue: 0.46).opacity(0.3), radius: 10, y: 4)
                }
                .padding(.horizontal, 32)
                .padding(.top, 32)
                .padding(.bottom, 32)
            }
            .frame(width: 382) // Figma: 382px幅
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .shadow(color: .black.opacity(0.15), radius: 20, y: 10)
            .scaleEffect(scale)
            .opacity(opacity)
            .frame(maxWidth: .infinity, maxHeight: .infinity) // 画面中央に配置
        }
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                scale = 1.0
                opacity = 1.0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                showAnimation = true
            }
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        }
    }
    
    private func dismiss() {
        withAnimation(.easeOut(duration: 0.2)) {
            scale = 0.8
            opacity = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            onDismiss()
        }
    }
}

