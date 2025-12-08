//
//  AniccaWidgetLiveActivity.swift
//  AniccaWidget
//
//  Created by CBNS03 on 2025/12/07.
//

import ActivityKit
import WidgetKit
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
#endif

// MARK: - AlarmKit用のメタデータ（メインアプリと同じ定義）
@available(iOS 26.0, *)
struct HabitAlarmMetadata: AlarmMetadata {
    let habit: String
    let repeatCount: Int
    let alarmIndex: Int
    
    init(habit: String = "", repeatCount: Int = 1, alarmIndex: Int = 0) {
        self.habit = habit
        self.repeatCount = repeatCount
        self.alarmIndex = alarmIndex
    }
}

// MARK: - AlarmKit Live Activity（iOS 26+）
@available(iOS 26.0, *)
struct AniccaAlarmLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<HabitAlarmMetadata>.self) { context in
            // Lock Screen / Banner UI
            HStack(spacing: 12) {
                Image(systemName: "alarm.fill")
                    .font(.title2)
                    .foregroundColor(.orange)
                
                VStack(alignment: .leading, spacing: 2) {
                    // alertは非オプショナル
                    Text(context.attributes.presentation.alert.title)
                        .font(.headline)
                        .foregroundColor(.primary)
                    Text("Anicca")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
            }
            .padding()
            .activityBackgroundTint(.orange.opacity(0.1))
            .activitySystemActionForegroundColor(.orange)
            
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "alarm.fill")
                        .font(.title2)
                        .foregroundColor(.orange)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.presentation.alert.title)
                        .font(.headline)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    // 空にしない - 何かViewを入れる
                    Image(systemName: "bell.fill")
                        .foregroundColor(.orange)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text("Open")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 8)
                            .background(.orange)
                            .clipShape(Capsule())
                    }
                }
            } compactLeading: {
                Image(systemName: "alarm.fill")
                    .foregroundColor(.orange)
            } compactTrailing: {
                Text("Open")
                    .font(.caption2)
                    .foregroundColor(.white)
            } minimal: {
                Image(systemName: "alarm.fill")
                    .foregroundColor(.orange)
            }
            .keylineTint(.orange)
        }
    }
}

// MARK: - 既存のLive Activity（後方互換用、削除してもOK）
struct AniccaWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var emoji: String
    }
    var name: String
}

struct AniccaWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AniccaWidgetAttributes.self) { context in
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension AniccaWidgetAttributes {
    fileprivate static var preview: AniccaWidgetAttributes {
        AniccaWidgetAttributes(name: "World")
    }
}

extension AniccaWidgetAttributes.ContentState {
    fileprivate static var smiley: AniccaWidgetAttributes.ContentState {
        AniccaWidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: AniccaWidgetAttributes.ContentState {
         AniccaWidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: AniccaWidgetAttributes.preview) {
   AniccaWidgetLiveActivity()
} contentStates: {
    AniccaWidgetAttributes.ContentState.smiley
    AniccaWidgetAttributes.ContentState.starEyes
}
