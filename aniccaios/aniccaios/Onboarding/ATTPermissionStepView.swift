import SwiftUI
import AppTrackingTransparency

struct ATTPermissionStepView: View {
    let next: () -> Void
    
    @State private var hasRequested = false
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Spacer()
            
            // アイコン
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 60))
                .foregroundColor(AppTheme.Colors.accent)
            
            // タイトル
            Text("Help Us Improve")
                .font(AppTheme.Typography.onboardingTitle)
                .foregroundColor(AppTheme.Colors.label)
            
            // 説明文（Pre-prompt）
            Text("We'd like to understand how you discovered Anicca to improve our service. This helps us reach more people who need support.")
                .font(AppTheme.Typography.bodyDynamic)
                .foregroundColor(AppTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
                .padding(.horizontal, AppTheme.Spacing.xl)
            
            Spacer()
            
            // ボタン
            PrimaryButton(title: "Continue") {
                requestATT()
            }
            .accessibilityIdentifier("att_continue_button")
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.bottom, AppTheme.Spacing.xxl)
        }
        .background(AppTheme.Colors.background)
    }
    
    private func requestATT() {
        guard !hasRequested else {
            next()
            return
        }
        
        hasRequested = true
        
        // iOS 14.5+ のみATTリクエスト
        if #available(iOS 14.5, *) {
            ATTrackingManager.requestTrackingAuthorization { status in
                DispatchQueue.main.async {
                    // ATT完了後にトラッキングSDKを初期化
                    NotificationCenter.default.post(
                        name: .attAuthorizationCompleted,
                        object: nil,
                        userInfo: ["status": status.rawValue]
                    )
                    // 許可・拒否に関わらず次へ進む
                    next()
                }
            }
        } else {
            // iOS 14.5未満は即座に次へ
            next()
        }
    }
}

extension Notification.Name {
    static let attAuthorizationCompleted = Notification.Name("attAuthorizationCompleted")
}

#Preview {
    ATTPermissionStepView {
        print("ATT completed")
    }
}
