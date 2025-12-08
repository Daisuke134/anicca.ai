//
//  AniccaWidgetLiveActivity.swift
//  AniccaWidget
//
//  Created by CBNS03 on 2025/12/07.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct AniccaWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct AniccaWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AniccaWidgetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
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
