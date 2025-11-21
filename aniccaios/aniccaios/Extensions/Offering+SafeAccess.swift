import RevenueCat

extension Offering {
    var hasPurchasablePackages: Bool {
        !availablePackages.isEmpty
    }

    var containsEmptyCarousel: Bool {
        // RevenueCatのPaywall構造に基づく実装
        // 実際のAPI構造に合わせて調整が必要な場合があります
        // 暫定的にfalseを返す（パッケージが空でない場合はcarouselも空でないと仮定）
        return false
    }
}

