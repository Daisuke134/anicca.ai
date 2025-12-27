//
//  AniccaWidget.swift
//  AniccaWidget
//
//  Created by CBNS03 on 2025/12/07.
//

import WidgetKit
import SwiftUI

// iOS 17+ 用のプロバイダー
@available(iOS 17.0, *)
struct Provider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), configuration: ConfigurationAppIntent())
    }

    func snapshot(for configuration: ConfigurationAppIntent, in context: Context) async -> SimpleEntry {
        SimpleEntry(date: Date(), configuration: configuration)
    }
    
    func timeline(for configuration: ConfigurationAppIntent, in context: Context) async -> Timeline<SimpleEntry> {
        var entries: [SimpleEntry] = []

        // Generate a timeline consisting of five entries an hour apart, starting from the current date.
        let currentDate = Date()
        for hourOffset in 0 ..< 5 {
            let entryDate = Calendar.current.date(byAdding: .hour, value: hourOffset, to: currentDate)!
            let entry = SimpleEntry(date: entryDate, configuration: configuration)
            entries.append(entry)
        }

        return Timeline(entries: entries, policy: .atEnd)
    }

//    func relevances() async -> WidgetRelevances<ConfigurationAppIntent> {
//        // Generate a list containing the contexts this widget is relevant in.
//    }
}

// iOS 16 用のプロバイダー
struct LegacyProvider: TimelineProvider {
    func placeholder(in context: Context) -> LegacyEntry {
        LegacyEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (LegacyEntry) -> Void) {
        completion(LegacyEntry(date: Date()))
    }
    
    func getTimeline(in context: Context, completion: @escaping (Timeline<LegacyEntry>) -> Void) {
        var entries: [LegacyEntry] = []
        let currentDate = Date()
        for hourOffset in 0 ..< 5 {
            let entryDate = Calendar.current.date(byAdding: .hour, value: hourOffset, to: currentDate)!
            entries.append(LegacyEntry(date: entryDate))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

@available(iOS 17.0, *)
struct SimpleEntry: TimelineEntry {
    let date: Date
    let configuration: ConfigurationAppIntent
}

struct LegacyEntry: TimelineEntry {
    let date: Date
}

@available(iOS 17.0, *)
struct AniccaWidgetEntryView: View {
    var entry: Provider.Entry

    var body: some View {
        VStack {
            Text("Time:")
            Text(entry.date, style: .time)

            Text("Favorite Emoji:")
            Text(entry.configuration.favoriteEmoji)
        }
    }
}

struct LegacyWidgetEntryView: View {
    var entry: LegacyEntry

    var body: some View {
        VStack {
            Text("Time:")
            Text(entry.date, style: .time)
        }
    }
}

@available(iOS 17.0, *)
struct AniccaWidgetModern: Widget {
    let kind: String = "AniccaWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: ConfigurationAppIntent.self, provider: Provider()) { entry in
            AniccaWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
    }
}

struct AniccaWidgetLegacy: Widget {
    let kind: String = "AniccaWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LegacyProvider()) { entry in
            LegacyWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Anicca")
        .description("Anicca Widget")
    }
}

// WidgetBundle で分岐するため、単一の Widget 型を公開
struct AniccaWidget: Widget {
    let kind: String = "AniccaWidget"
    
    var body: some WidgetConfiguration {
        if #available(iOS 17.0, *) {
            return AniccaWidgetModern().body
        } else {
            return AniccaWidgetLegacy().body
        }
    }
}

@available(iOS 17.0, *)
extension ConfigurationAppIntent {
    fileprivate static var smiley: ConfigurationAppIntent {
        let intent = ConfigurationAppIntent()
        intent.favoriteEmoji = "😀"
        return intent
    }
    
    fileprivate static var starEyes: ConfigurationAppIntent {
        let intent = ConfigurationAppIntent()
        intent.favoriteEmoji = "🤩"
        return intent
    }
}

// Preview を iOS 17+ に制限
#if swift(>=5.9)
@available(iOS 17.0, *)
#Preview(as: .systemSmall) {
    AniccaWidgetModern()
} timeline: {
    SimpleEntry(date: .now, configuration: .smiley)
    SimpleEntry(date: .now, configuration: .starEyes)
}
#endif
