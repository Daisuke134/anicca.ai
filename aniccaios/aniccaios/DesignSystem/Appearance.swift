import SwiftUI

enum Appearance {
    static func configure() {
        // 既存の AppTheme.Colors.background を使用
        let bg = UIColor(AppTheme.Colors.background)

        // UINavigationBar
        let nav = UINavigationBarAppearance()
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = bg
        nav.shadowColor = .clear
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav

        // UIToolbar
        let tb = UIToolbarAppearance()
        tb.configureWithOpaqueBackground()
        tb.backgroundColor = bg
        UIToolbar.appearance().standardAppearance = tb
        if #available(iOS 15.0, *) {
            UIToolbar.appearance().scrollEdgeAppearance = tb
        }

        // UITableView / UICollectionView 背景
        UITableView.appearance().backgroundColor = bg
        UICollectionView.appearance().backgroundColor = bg
    }
}

