import SwiftUI

struct AppBackground: View {
    var useOpacity: Bool = false
    
    var body: some View {
        if #available(iOS 15.0, *) {
            (useOpacity ? AppTheme.Colors.backgroundWithOpacity : AppTheme.Colors.adaptiveBackground)
                .ignoresSafeArea()
        } else {
            (useOpacity ? AppTheme.Colors.backgroundWithOpacity : AppTheme.Colors.background)
                .ignoresSafeArea()
        }
    }
}

