import SwiftUI
import AppTrackingTransparency
import RevenueCat

struct ATTPermissionStepView: View {
    let next: () -> Void
    @State private var isRequesting = false
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Spacer()
            
            Image(systemName: "sparkles")
                .font(.system(size: 64))
                .foregroundColor(AppTheme.Colors.accent)
            
            Text(String(localized: "onboarding_att_title"))
                .font(AppTheme.Typography.onboardingTitle)
                .foregroundColor(AppTheme.Colors.label)
            
            Text(String(localized: "onboarding_att_description"))
                .font(AppTheme.Typography.bodyDynamic)
                .foregroundColor(AppTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            Spacer()
            
            PrimaryButton(title: String(localized: "common_continue"), style: .primary) {
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
                    
                    // Release設定でもログを出力（StagingスキームRelease設定でのテスト用）
                    print("[ATT] Authorization status: \(status.rawValue)")
                    if let idfa = SingularManager.shared.idfa {
                        print("[ATT] IDFA: \(idfa)")
                    }
                    
                    next()
                }
            }
        } else {
            // iOS 14.5未満はATTプロンプトなしでデバイス識別子を収集（IDFVのみ）
            Purchases.shared.attribution.collectDeviceIdentifiers()
            next()
        }
    }
}

