# Daily Dharma WidgetKit 実装仕様書

**作成日**: 2026-01-14
**ステータス**: レビュー待ち
**実装担当**: Claude Agent
**レビュー担当**: 別エージェント

---

## 1. 背景と目的

### 1.1 なぜWidgetKitを実装するのか

Daily Dharmaアプリは、仏教の教え（Dhammapada）を毎日ユーザーに届けるアプリである。現在、ユーザーはアプリを開かないと教えを見ることができない。

**問題点:**
- アプリを開く習慣がないと、教えに触れる機会が減る
- TikTokでのマーケティングにおいて、「ロック画面で見れる」は強力な訴求ポイント
- 競合アプリ（Headspace、Calm等）はWidget対応済み

**解決策:**
iOS Lock Screen Widgetを実装し、ユーザーがロック画面を見るたびに仏教の教えに触れられるようにする。

### 1.2 ビジネス価値

| 指標 | 期待効果 |
|------|----------|
| DAU（日次アクティブユーザー） | +20-30%（ロック画面からの流入） |
| リテンション | 向上（毎日目に触れる） |
| TikTokコンテンツ | 「このWidget無料で使える！」訴求可能 |
| App Store掲載 | Widgetスクショで差別化 |

---

## 2. As-Is（現状）

### 2.1 現在のアプリ構成

```
daily-dhamma-app/
├── app/
│   ├── index.tsx          # メイン画面（Verseスワイプ）
│   ├── settings.tsx       # 設定画面
│   ├── paywall.tsx        # 課金画面
│   └── onboarding.tsx     # オンボーディング
├── data/
│   └── verses.ts          # Verseデータ（30個）
├── providers/
│   ├── AppProvider.tsx    # アプリ状態管理
│   └── RevenueCatProvider.tsx  # 課金管理
└── app.json               # Expo設定
```

### 2.2 現在の課金体系

| 機能 | 無料 | 有料（Premium） |
|------|------|-----------------|
| Verse閲覧 | 8個（id: 1-8） | 30個（全部） |
| ブックマーク | ❌ | ✅ |
| Stay Present通知 | 最大3回/日 | 5/7/10回選択可 |
| **Widget** | **未実装** | **未実装** |

### 2.3 現在のユーザー体験

```
[ユーザーの1日]

6:00  起床
      ↓
      iPhoneのロック画面を見る → 何もない
      ↓
7:00  Daily Dharmaアプリを開く（開かない日も多い）
      ↓
      Verseを読む
      ↓
      アプリを閉じる
      ↓
      忘れる
```

---

## 3. To-Be（理想の姿）

### 3.1 実装後のアプリ構成

```
daily-dhamma-app/
├── app/
│   ├── index.tsx
│   ├── settings.tsx
│   ├── paywall.tsx
│   └── onboarding.tsx
├── data/
│   └── verses.ts
├── providers/
│   ├── AppProvider.tsx
│   └── RevenueCatProvider.tsx
├── targets/                    # 【新規】Widget Target
│   └── widget/
│       ├── expo-target.config.js
│       ├── index.swift
│       └── Assets.xcassets/
│           ├── Contents.json
│           ├── AccentColor.colorset/
│           │   └── Contents.json
│           └── WidgetBackground.colorset/
│               └── Contents.json
├── app.json                    # 【修正】plugin追加
└── package.json                # 【修正】依存追加
```

### 3.2 実装後の課金体系

| 機能 | 無料 | 有料（Premium） |
|------|------|-----------------|
| Verse閲覧 | 8個 | 30個 |
| ブックマーク | ❌ | ✅ |
| Stay Present通知 | 最大3回/日 | 5/7/10回選択可 |
| **Widget** | **✅（8個ローテ）** | **✅（8個ローテ）** |

**注**: Widgetは無料/有料共通で8個の無料Verseをローテーション。理由は後述。

### 3.3 理想のユーザー体験

```
[ユーザーの1日 - Widget実装後]

6:00  起床
      ↓
      iPhoneのロック画面を見る
      ↓
      ┌─────────────────────────────────────┐
      │          6:00 AM                    │
      │          Tuesday, January 14        │
      │                                     │
      │  ┌─────────────────────────────┐   │
      │  │ 🪷 Daily Dharma              │   │ ← Widget!
      │  │ "Hatred never ceases by     │   │
      │  │  hatred; by love alone..."  │   │
      │  └─────────────────────────────┘   │
      │                                     │
      │         🔦      📷      🔒          │
      └─────────────────────────────────────┘
      ↓
      「今日も良い教えだな」と思う
      ↓
      Widgetをタップ → アプリ起動
      ↓
      もっと読みたい → 有料版へ
```

---

## 4. Widget仕様詳細

### 4.1 対応Widgetファミリー

| ファミリー | 表示場所 | サイズ | 対応 |
|------------|----------|--------|------|
| `accessoryRectangular` | ロック画面 | 長方形 | ✅ |
| `accessoryCircular` | ロック画面 | 円形 | ✅ |
| `accessoryInline` | ロック画面 | 1行テキスト | ✅ |
| `systemSmall` | ホーム画面 | 小 | ✅ |
| `systemMedium` | ホーム画面 | 中 | ✅ |

### 4.2 各Widgetのデザイン

#### Lock Screen - Rectangular（メイン）
```
┌─────────────────────────────┐
│ 🪷 Daily Dharma              │
│ "Hatred never ceases by     │
│  hatred; by love alone..."  │
└─────────────────────────────┘
```

#### Lock Screen - Circular
```
    ┌───┐
    │ 🪷 │
    └───┘
```

#### Lock Screen - Inline
```
🪷 Hatred never ceases by hatred...
```

#### Home Screen - Small
```
┌─────────────────┐
│ 🪷 Daily Dharma │
│                 │
│ "Hatred never   │
│  ceases by      │
│  hatred..."     │
│                 │
│ Dhammapada 1:5  │
└─────────────────┘
```

#### Home Screen - Medium
```
┌─────────────────────────────────────┐
│ 🪷 Daily Dharma                      │
│                                     │
│ "Hatred never ceases by hatred;     │
│  by love alone is it healed."       │
│                                     │
│ Dhammapada, Chapter 1 (Yamaka Vagga)│
└─────────────────────────────────────┘
```

### 4.3 Verseローテーション仕様

**表示するVerse（8個・無料Verseのみ）:**

| ID | テキスト | ソース |
|----|----------|--------|
| 1 | "Hatred never ceases by hatred; by love alone is it healed." | Dhammapada 1:5 |
| 2 | "All things are impermanent. Work out your salvation with diligence." | Dhammapada 20:277 |
| 3 | "Wisdom springs from meditation; without meditation wisdom wanes." | Dhammapada 20:282 |
| 4 | "The mind is everything. What you think, you become." | Dhammapada 1:1-2 |
| 5 | "Better than a thousand hollow words is one word that brings peace." | Dhammapada 8:100 |
| 6 | "Let go of the past, let go of the future. Live fully in the present." | Dhammapada 24:348 |
| 7 | "Peace comes from within. Do not seek it without." | Dhammapada |
| 8 | "Wander alone like a rhinoceros horn." | Khaggavisana Sutta |

**更新タイミング:**
- 毎日0時（ローカルタイム）に自動更新
- `dayOfYear % 8` でインデックス計算

### 4.4 なぜWidgetは無料Verseのみか

**技術的制約:**
1. WidgetKitはiOSの独立プロセスで動作
2. React Native（RevenueCat）の課金状態を直接取得不可
3. App Groups経由でUserDefaultsを共有できるが、複雑化を避ける

**ビジネス判断:**
1. 無料ユーザーにもWidgetを使わせる → TikTokで「無料で使える！」とアピール
2. Widgetで興味を持つ → アプリを開く → 有料Verseを見たくなる → 課金

---

## 5. 技術仕様

### 5.1 使用パッケージ

| パッケージ | バージョン | 用途 |
|------------|------------|------|
| `@bacons/apple-targets` | 3.0.7 | Expo用Widget Target生成 |

### 5.2 Expo SDK要件

| 項目 | 現在 | 必要 | 状態 |
|------|------|------|------|
| Expo SDK | 54.0.27 | 53+ | ✅ OK |

### 5.3 Apple Developer設定

| 項目 | 値 |
|------|-----|
| Bundle ID（メイン） | `com.dailydhamma.app` |
| Bundle ID（Widget） | `com.dailydhamma.app.widget`（自動生成） |
| Team ID | `S5U8UH3JLJ` |
| App Group | `group.com.dailydhamma.app` |

**ユーザーが完了済みの作業:**
- [x] Apple Developer PortalでApp Group登録
- [x] メインアプリのBundle IDにApp Groups Capability追加

---

## 6. 実装パッチ（ファイル単位）

### 6.1 新規ファイル作成

#### File 1: `targets/widget/expo-target.config.js`

```javascript
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "Daily Dharma",
  deploymentTarget: "16.0",
  bundleIdentifier: ".widget",
  colors: {
    $accent: { color: "#8B7355", darkColor: "#D4A574" },
    $widgetBackground: { color: "#F5F0E8", darkColor: "#1A1A1A" },
  },
  entitlements: {
    "com.apple.security.application-groups": ["group.com.dailydhamma.app"]
  }
};
```

#### File 2: `targets/widget/index.swift`

```swift
import WidgetKit
import SwiftUI

// MARK: - Timeline Entry
struct DailyDharmaEntry: TimelineEntry {
    let date: Date
    let verseText: String
    let verseSource: String
}

// MARK: - Timeline Provider
struct DailyDharmaProvider: TimelineProvider {
    let defaultVerses = [
        ("Hatred never ceases by hatred; by love alone is it healed.", "Dhammapada 1:5"),
        ("All things are impermanent. Work out your salvation with diligence.", "Dhammapada 20:277"),
        ("Wisdom springs from meditation; without meditation wisdom wanes.", "Dhammapada 20:282"),
        ("The mind is everything. What you think, you become.", "Dhammapada 1:1-2"),
        ("Better than a thousand hollow words is one word that brings peace.", "Dhammapada 8:100"),
        ("Let go of the past, let go of the future. Live fully in the present.", "Dhammapada 24:348"),
        ("Peace comes from within. Do not seek it without.", "Dhammapada"),
        ("Wander alone like a rhinoceros horn.", "Khaggavisana Sutta")
    ]

    func placeholder(in context: Context) -> DailyDharmaEntry {
        DailyDharmaEntry(
            date: Date(),
            verseText: "Peace comes from within.",
            verseSource: "Dhammapada"
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (DailyDharmaEntry) -> ()) {
        let entry = getDailyEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DailyDharmaEntry>) -> ()) {
        let entry = getDailyEntry()

        // Update at midnight
        let calendar = Calendar.current
        let tomorrow = calendar.startOfDay(for: calendar.date(byAdding: .day, value: 1, to: Date())!)

        let timeline = Timeline(entries: [entry], policy: .after(tomorrow))
        completion(timeline)
    }

    private func getDailyEntry() -> DailyDharmaEntry {
        // Try to get from shared UserDefaults first
        if let defaults = UserDefaults(suiteName: "group.com.dailydhamma.app"),
           let verseText = defaults.string(forKey: "widgetVerseText"),
           let verseSource = defaults.string(forKey: "widgetVerseSource") {
            return DailyDharmaEntry(date: Date(), verseText: verseText, verseSource: verseSource)
        }

        // Fallback to local calculation
        let calendar = Calendar.current
        let dayOfYear = calendar.ordinality(of: .day, in: .year, for: Date()) ?? 1
        let index = (dayOfYear - 1) % defaultVerses.count
        let verse = defaultVerses[index]

        return DailyDharmaEntry(date: Date(), verseText: verse.0, verseSource: verse.1)
    }
}

// MARK: - Widget Views
struct DailyDharmaWidgetView: View {
    let entry: DailyDharmaEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryRectangular:
            AccessoryRectangularView(entry: entry)
        case .accessoryCircular:
            AccessoryCircularView()
        case .accessoryInline:
            AccessoryInlineView(entry: entry)
        case .systemSmall:
            SmallWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        default:
            SmallWidgetView(entry: entry)
        }
    }
}

// MARK: - Lock Screen Rectangular
struct AccessoryRectangularView: View {
    let entry: DailyDharmaEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Image(systemName: "leaf.fill")
                    .font(.caption2)
                Text("Daily Dharma")
                    .font(.caption2)
                    .fontWeight(.semibold)
            }
            Text(truncateText(entry.verseText, maxLength: 60))
                .font(.caption)
                .lineLimit(2)
        }
        .containerBackground(for: .widget) {
            AccessoryWidgetBackground()
        }
    }
}

// MARK: - Lock Screen Circular
struct AccessoryCircularView: View {
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            Image(systemName: "leaf.fill")
                .font(.title2)
        }
        .containerBackground(for: .widget) { }
    }
}

// MARK: - Lock Screen Inline
struct AccessoryInlineView: View {
    let entry: DailyDharmaEntry

    var body: some View {
        ViewThatFits {
            Text("\u{1FAB7} \(truncateText(entry.verseText, maxLength: 30))")
            Text("\u{1FAB7} Daily Dharma")
        }
    }
}

// MARK: - Home Screen Small
struct SmallWidgetView: View {
    let entry: DailyDharmaEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "leaf.fill")
                    .foregroundColor(Color("AccentColor"))
                Text("Daily Dharma")
                    .font(.caption)
                    .fontWeight(.semibold)
            }

            Text(truncateText(entry.verseText, maxLength: 80))
                .font(.caption)
                .lineLimit(4)

            Spacer()

            Text(entry.verseSource)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding()
        .containerBackground(for: .widget) {
            Color("WidgetBackground")
        }
    }
}

// MARK: - Home Screen Medium
struct MediumWidgetView: View {
    let entry: DailyDharmaEntry

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "leaf.fill")
                        .foregroundColor(Color("AccentColor"))
                    Text("Daily Dharma")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                }

                Text(entry.verseText)
                    .font(.callout)
                    .lineLimit(3)

                Spacer()

                Text(entry.verseSource)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer()
        }
        .padding()
        .containerBackground(for: .widget) {
            Color("WidgetBackground")
        }
    }
}

// MARK: - Helper
func truncateText(_ text: String, maxLength: Int) -> String {
    if text.count <= maxLength {
        return text
    }
    let truncated = String(text.prefix(maxLength - 3))
    return truncated + "..."
}

// MARK: - Widget Configuration
@main
struct DailyDharmaWidget: Widget {
    let kind: String = "com.dailydhamma.app.widget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DailyDharmaProvider()) { entry in
            DailyDharmaWidgetView(entry: entry)
        }
        .configurationDisplayName("Daily Dharma")
        .description("Today's Buddhist wisdom from the Dhammapada")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline
        ])
    }
}
```

#### File 3: `targets/widget/Assets.xcassets/Contents.json`

```json
{
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

#### File 4: `targets/widget/Assets.xcassets/AccentColor.colorset/Contents.json`

```json
{
  "colors": [
    {
      "color": {
        "color-space": "srgb",
        "components": {
          "red": "0.545",
          "green": "0.451",
          "blue": "0.333",
          "alpha": "1.0"
        }
      },
      "idiom": "universal"
    },
    {
      "appearances": [
        {
          "appearance": "luminosity",
          "value": "dark"
        }
      ],
      "color": {
        "color-space": "srgb",
        "components": {
          "red": "0.831",
          "green": "0.647",
          "blue": "0.455",
          "alpha": "1.0"
        }
      },
      "idiom": "universal"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

#### File 5: `targets/widget/Assets.xcassets/WidgetBackground.colorset/Contents.json`

```json
{
  "colors": [
    {
      "color": {
        "color-space": "srgb",
        "components": {
          "red": "0.961",
          "green": "0.941",
          "blue": "0.910",
          "alpha": "1.0"
        }
      },
      "idiom": "universal"
    },
    {
      "appearances": [
        {
          "appearance": "luminosity",
          "value": "dark"
        }
      ],
      "color": {
        "color-space": "srgb",
        "components": {
          "red": "0.102",
          "green": "0.102",
          "blue": "0.102",
          "alpha": "1.0"
        }
      },
      "idiom": "universal"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

### 6.2 既存ファイル修正

#### File 6: `app.json` の修正（差分）

**追加箇所1: `expo.ios` セクション**

```diff
  "ios": {
    "supportsTablet": false,
    "bundleIdentifier": "com.dailydhamma.app",
+   "appleTeamId": "S5U8UH3JLJ",
+   "entitlements": {
+     "com.apple.security.application-groups": ["group.com.dailydhamma.app"]
+   },
    "infoPlist": {
```

**追加箇所2: `expo.plugins` 配列の末尾**

```diff
      "expo-notifications",
      {
        "color": "#ffffff",
        "defaultChannel": "default",
        "enableBackgroundRemoteNotifications": false
      }
-   ]
+   ],
+   "@bacons/apple-targets"
  ],
```

### 6.3 パッケージインストール

```bash
cd /Users/cbns03/Downloads/anicca-project/daily-apps/daily-dhamma-app
npm install @bacons/apple-targets@3.0.7
```

---

## 7. ビルド＆デプロイ手順

### 7.1 ビルドコマンド

```bash
# 1. パッケージインストール
npm install @bacons/apple-targets@3.0.7

# 2. iOS用Prebuild（Widget Target生成）
npx expo prebuild --platform ios --clean

# 3. EAS Build（本番）
eas build --profile production --platform ios

# 4. TestFlight提出
eas submit --platform ios
```

### 7.2 検証方法

**注意**: WidgetはiOSシミュレーターでは動作しない。実機TestFlightで確認が必要。

1. TestFlightからアプリをインストール
2. ロック画面を長押し → 「カスタマイズ」
3. 「ウィジェットを追加」→「Daily Dharma」を選択
4. 好みのサイズを選んで配置
5. Verseが表示されることを確認
6. 翌日0時にVerseが更新されることを確認

---

## 8. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| EAS Buildエラー | ビルド失敗 | ログを確認し、entitlements設定を再確認 |
| App Group不一致 | Widget起動失敗 | Portal設定とapp.jsonの値を照合 |
| iOS 16未満の端末 | Widgetが表示されない | `deploymentTarget: "16.0"` で制限済み |
| Verse更新されない | UX低下 | Timeline policy `.after(tomorrow)` で対応済み |

---

## 9. レビューチェックリスト

レビュー担当者は以下を確認してください：

### コード品質
- [ ] SwiftUIコードに構文エラーがないか
- [ ] 色定義（AccentColor, WidgetBackground）がアプリのブランドと一致しているか
- [ ] Verseテキストが `verses.ts` と同期しているか

### 設定確認
- [ ] `expo-target.config.js` の `bundleIdentifier` が正しいか
- [ ] `app.json` の `appleTeamId` が正しいか
- [ ] `app.json` の `entitlements` が正しいか

### セキュリティ
- [ ] App Groupsの設定が適切か
- [ ] ハードコードされた機密情報がないか

### UX
- [ ] 各Widgetサイズでテキストが切れていないか
- [ ] ダークモード対応が適切か
- [ ] アクセントカラーが見やすいか

---

## 10. 参考資料

- [expo-apple-targets GitHub](https://github.com/EvanBacon/expo-apple-targets)
- [Expo Blog: iOS Widgets in Expo](https://expo.dev/blog/how-to-implement-ios-widgets-in-expo-apps)
- [SwiftUI Lock Screen Widget Guide](https://swiftsenpai.com/development/create-lock-screen-widget/)
- [Apple WidgetKit Documentation](https://developer.apple.com/documentation/widgetkit)

---

## 承認

| 役割 | 名前 | 日付 | 承認 |
|------|------|------|------|
| 実装担当 | Claude Agent | 2026-01-14 | - |
| レビュー担当 | - | - | ⬜ |
| プロダクトオーナー | ユーザー | - | ⬜ |
