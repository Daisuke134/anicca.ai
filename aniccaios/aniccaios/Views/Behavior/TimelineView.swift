import SwiftUI
import Combine

struct TimelineView: View {
    let segments: [BehaviorSummary.TimelineSegment]

    var body: some View {
        CardView {
            VStack(alignment: .leading, spacing: 12) {
                Text(String(localized: "behavior_title_timeline"))
                    .font(AppTheme.Typography.headlineDynamic)
                    .foregroundStyle(AppTheme.Colors.label)

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(AppTheme.Colors.buttonUnselected.opacity(0.35))

                        ForEach(segments) { seg in
                            let start = minutes(from: seg.start)
                            let end = minutes(from: seg.end)
                            let total: CGFloat = 24 * 60
                            let x = geo.size.width * CGFloat(start) / total
                            let w = geo.size.width * CGFloat(max(0, end - start)) / total

                            RoundedRectangle(cornerRadius: 0, style: .continuous)
                                .fill(color(for: seg.type))
                                .frame(width: w, height: geo.size.height)
                                .offset(x: x)
                                .opacity(opacity(for: seg.type))
                        }
                    }
                }
                .frame(height: 48)

                HStack {
                    Text("12am")
                    Spacer()
                    Text("6am")
                    Spacer()
                    Text("12pm")
                    Spacer()
                    Text("6pm")
                    Spacer()
                    Text("12am")
                }
                .font(.system(size: 10))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)

                legend
            }
        }
    }

    private var legend: some View {
        FlexibleLegend(items: [
            (.sleep, String(localized: "timeline_label_sleep")),
            (.focus, String(localized: "timeline_label_focus")),
            (.scroll, String(localized: "timeline_label_scroll")),
            (.activity, String(localized: "timeline_label_activity")),
        ])
    }

    private func minutes(from hhmm: String) -> Int {
        let parts = hhmm.split(separator: ":").map(String.init)
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return 0 }
        return max(0, min(24 * 60, h * 60 + m))
    }

    private func color(for type: BehaviorSummary.TimelineSegment.SegmentType) -> Color {
        // HTMLテンプレ（screens/behavior.html）に合わせた代表色
        switch type {
        case .sleep: return Color(red: 0.29, green: 0.56, blue: 0.89)      // #4A90E2
        case .focus: return Color(red: 0.96, green: 0.65, blue: 0.14)      // #F5A623
        case .scroll: return Color(red: 0.91, green: 0.30, blue: 0.24)     // #E74C3C
        case .activity: return Color(red: 0.18, green: 0.80, blue: 0.44)   // #2ECC71
        }
    }

    private func opacity(for type: BehaviorSummary.TimelineSegment.SegmentType) -> Double {
        // HTMLテンプレでは一部を淡く描画しているが、ここでは type ベースで統一
        switch type {
        case .sleep, .focus, .scroll: return 1.0
        case .activity: return 0.8
        }
    }
}

/// Legend を雑に折り返し表示するための補助View（フェーズ6はUI優先で軽量実装）
private struct FlexibleLegend: View {
    let items: [(BehaviorSummary.TimelineSegment.SegmentType, String)]

    var body: some View {
        HStack(spacing: 12) {
            ForEach(0..<items.count, id: \.self) { i in
                let item = items[i]
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(color(for: item.0))
                        .frame(width: 12, height: 12)
                    Text(item.1)
                        .font(.system(size: 12))
                        .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func color(for type: BehaviorSummary.TimelineSegment.SegmentType) -> Color {
        switch type {
        case .sleep: return Color(red: 0.29, green: 0.56, blue: 0.89)
        case .focus: return Color(red: 0.96, green: 0.65, blue: 0.14)
        case .scroll: return Color(red: 0.91, green: 0.30, blue: 0.24)
        case .activity: return Color(red: 0.18, green: 0.80, blue: 0.44)
        }
    }
}

