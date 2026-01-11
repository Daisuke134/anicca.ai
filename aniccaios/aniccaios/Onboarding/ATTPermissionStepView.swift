import SwiftUI
import AppTrackingTransparency
import RevenueCat

struct ATTPermissionStepView: View {
    let next: () -> Void
    @State private var isRequesting = false
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Spacer()
            
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 64))
                .foregroundColor(AppTheme.Colors.accent)
            
            Text("Help Us Improve")
                .font(AppTheme.Typography.onboardingTitle)
                .foregroundColor(AppTheme.Colors.label)
            
            Text("Allow tracking to help us measure the effectiveness of our marketing and provide you with a better experience.")
                .font(AppTheme.Typography.bodyDynamic)
                .foregroundColor(AppTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            Spacer()
            
            PrimaryButton(title: "Continue", style: .primary) {
                requestATT()
            }
            .disabled(isRequesting)
            .padding(.horizontal)
            .padding(.bottom)
        }
        .background(AppTheme.Colors.background.ignoresSafeArea())
    }
    
    private func requestATT() {
        guard !isRequesting else { return }
        isRequesting = true
        
        // iOS 14.5以上でのみATTプロンプトを表示
        if #available(iOS 14.5, *) {
            ATTrackingManager.requestTrackingAuthorization { status in
                DispatchQueue.main.async {
                    // ATT許可後にデバイス識別子を再収集（IDFAを含める）
                    Purchases.shared.attribution.collectDeviceIdentifiers()
                    
                    #if DEBUG
                    print("[ATT] Authorization status: \(status.rawValue)")
                    if let idfa = SingularManager.shared.idfa {
                        print("[ATT] IDFA: \(idfa)")
                    }
                    #endif
                    
                    next()
                }
            }
        } else {
            // iOS 14.5未満はそのまま次へ
            next()
        }
    }
}

