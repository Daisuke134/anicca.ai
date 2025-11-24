import SwiftUI
import StoreKit
import RevenueCat

struct PricingDisclosureBanner: View {
    let billedAmountText: String
    let perMonthText: String?
    let noteText: String
    
    var body: some View {
        VStack(spacing: 6) {
            Text(billedAmountText)
                .font(.largeTitle)
                .bold()
                .multilineTextAlignment(.center)
            if let perMonthText {
                Text(perMonthText)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            Text(noteText)
                .font(.footnote)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
    }
}

// Helper to generate billed amount text from Package
extension PricingDisclosureBanner {
    static func billedText(for package: Package) -> String {
        let price = package.storeProduct.localizedPriceString
        if let period = package.storeProduct.subscriptionPeriod {
            switch period.unit {
            case .year:
                return "\(price)/yr (auto-renewing)"
            case .month:
                return "\(price)/mo (auto-renewing)"
            case .week:
                return "\(price)/wk (auto-renewing)"
            default:
                return "\(price) (auto-renewing)"
            }
        }
        return price
    }
    
    static func perMonthText(for package: Package) -> String? {
        guard let period = package.storeProduct.subscriptionPeriod,
              period.unit == .year else {
            return nil
        }
        let price = package.storeProduct.price
        let perMonth = price / 12
        let formatter = package.storeProduct.priceFormatter ?? {
            let f = NumberFormatter()
            f.numberStyle = .currency
            f.locale = Locale.current
            return f
        }()
        formatter.maximumFractionDigits = 2
        if let formatted = formatter.string(from: NSDecimalNumber(decimal: perMonth)) {
            return "≈ \(formatted)/mo (for comparison)"
        }
        return nil
    }
}

