import SwiftUI

struct UsageLimitModalView: View {
    let plan: SubscriptionInfo.Plan
    let onClose: () -> Void
    let onUpgrade: () -> Void
    let onManage: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text(title)
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)
            HStack(spacing: 12) {
                Button("戻る") { onClose() }
                    .buttonStyle(.bordered)
                if plan == .free {
                    Button("アップグレード") { onUpgrade() }
                        .buttonStyle(.borderedProminent)
                } else {
                    Button("プランを管理") { onManage() }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
        .padding()
        .presentationDetents([.fraction(0.35), .medium])
    }

    private var title: String {
        switch plan {
        case .free: return "月の使用上限に達しました（Free 30/30）"
        case .pro:  return "月の使用上限に達しました（Pro 300/300）"
        case .grace: return "月の使用上限に達しました"
        }
    }

    private var message: String {
        switch plan {
        case .free:
            return "Proにアップグレードすると今すぐ続けられます。"
        case .pro:
            return "Maxプランは近日公開です。必要な方はサポートへご連絡ください。"
        case .grace:
            return "お支払いの更新をご確認ください。"
        }
    }
}

