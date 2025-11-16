import SwiftUI

struct PaywallStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        PaywallContainerView(
            onPurchaseCompleted: {
                // 購入完了時にオンボーディング完了をマーク
                appState.markOnboardingComplete()
                next()
            },
            onDismissRequested: {
                // バツボタンが押されたら習慣設定画面に戻る
                appState.setOnboardingStep(.habitSetup)
            }
        )
    }
}


