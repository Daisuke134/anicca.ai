import RevenueCat

extension Offering {
    var hasPurchasablePackages: Bool {
        !availablePackages.isEmpty && availablePackages.allSatisfy { $0.storeProduct != nil }
    }

    var containsEmptyCarousel: Bool {
        // RevenueCatのPaywall構造に基づく実装
        // Carouselが空かどうかを判定（商品が0件の場合はtrue）
        if availablePackages.isEmpty {
            return true
        }
        
        // 各パッケージのstoreProductがnilでないか確認
        let validPackages = availablePackages.filter { $0.storeProduct != nil }
        if validPackages.isEmpty {
            return true
        }
        
        // Carouselの元となる商品数が0でないか確認
        // RevenueCatUIのCarouselComponentViewは、originalCountが0の場合に0除算エラーを起こす
        // ここでは、パッケージが有効な場合のみfalseを返す
        return false
    }
}

