import RevenueCat

extension Offering {
    var hasPurchasablePackages: Bool {
        !availablePackages.isEmpty
    }

    var containsEmptyCarousel: Bool {
        // RevenueCatのPaywall構造に基づく実装
        // Carouselが空かどうかを判定（商品が0件の場合はtrue）
        // RevenueCatUIのCarouselComponentViewは、originalCountが0の場合に0除算エラーを起こす
        // パッケージが空の場合はtrueを返す
        let isEmpty = availablePackages.isEmpty
        if isEmpty {
            print("[Offering] Empty carousel detected: identifier=\(identifier), packages=\(availablePackages.count)")
        }
        return isEmpty
    }
}

