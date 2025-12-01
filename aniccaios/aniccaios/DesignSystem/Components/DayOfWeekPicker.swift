import SwiftUI

// Mobbinデザイン: 曜日選択UIコンポーネント（円形145×145px、4pxボーダー）
struct DayOfWeekPicker: View {
    @Binding var selectedDays: Set<Int>  // 0=日曜日, 1=月曜日, ..., 6=土曜日
    
    private let dayLabels = ["S", "M", "T", "W", "T", "F", "S"]
    private let dayNames = [
        String(localized: "day_sunday_short"),
        String(localized: "day_monday_short"),
        String(localized: "day_tuesday_short"),
        String(localized: "day_wednesday_short"),
        String(localized: "day_thursday_short"),
        String(localized: "day_friday_short"),
        String(localized: "day_saturday_short")
    ]
    
    var body: some View {
        HStack(spacing: 12) {
            ForEach(0..<7) { index in
                dayButton(for: index)
            }
        }
    }
    
    @ViewBuilder
    private func dayButton(for index: Int) -> some View {
        let isSelected = selectedDays.contains(index)
        
        Button(action: {
            if isSelected {
                selectedDays.remove(index)
            } else {
                selectedDays.insert(index)
            }
        }) {
            Text(dayLabels[index])
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected)
                .frame(width: 145, height: 145)  // Mobbin: 145×145px
                .background(
                    Circle()
                        .fill(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
                )
                .overlay(
                    Circle()
                        .stroke(isSelected ? AppTheme.Colors.border : AppTheme.Colors.borderLight, lineWidth: 4)  // Mobbin: 4pxボーダー
                )
        }
        .buttonStyle(.plain)
    }
}

