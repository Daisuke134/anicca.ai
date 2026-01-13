# Daily Dharma - App Store提出までの完全ガイド

## 現在の状態
- **ビルド**: ✅ 完了 (v1.0.0, Build 2)
- **TestFlight提出**: 🔄 進行中
- **アプリパス**: `/Users/cbns03/Downloads/anicca-project/daily-apps/daily-dhamma-app`

---

## 役割分担

### Claude（エージェント）がやること
1. ✅ TestFlight提出（進行中）
2. ⬜ WidgetKit実装
3. ⬜ 修正後の再ビルド・再TestFlight提出
4. ⬜ Landingデプロイ（Privacy Policy）

### ユーザーがやること
1. ⬜ 実機テスト確認（TestFlightアプリで）
2. ⬜ App Store Connect MCP設定（下記参照）
3. ⬜ Sleekでスクショ作成（下記プロンプト参照）
4. ⬜ App Store Connectメタデータ入力（下記参照）
5. ⬜ App Store審査提出ボタン押す
6. ⬜ TikTok動画撮影・投稿

---

## 1. App Store Connect MCP設定手順

### 設定ファイル場所（Claude Code）
```
~/.claude.json
```

### 追加する場所
JSONの `"/Users/cbns03/Downloads/anicca-project"` セクション内の `"mcpServers"` オブジェクト

### 追加するJSON
```json
"app-store-connect": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "appstore-connect-mcp-server"],
  "env": {
    "APP_STORE_CONNECT_KEY_ID": "D637C7RGFN",
    "APP_STORE_CONNECT_ISSUER_ID": "f53272d9-c12d-4d9d-811c-4eb658284e74",
    "APP_STORE_CONNECT_P8_PATH": "/Users/cbns03/Downloads/AuthKey_D637C7RGFN.p8"
  }
}
```

### 設定後
Claude Codeを再起動 → MCP接続確認

---

## 2. Sleekスクショプロンプト（5画面）

### スクショ1: メイン画面
```
Create an App Store screenshot for "Daily Dharma" meditation app.

Device: iPhone 15 Pro Max (6.7 inch, 1290x2796)
Background: Soft beige gradient (#F5F0E8 to #EDE5D8)

Content:
- App screenshot showing a verse: "Hatreds never cease through hatred in this world; through love alone they cease."
- Source citation: "Dhammapada, Chapter 1, Verse 5"
- Minimal UI with bookmark icon

Text overlay:
- Headline: "Ancient wisdom, every day"
- Subheadline: "Authentic Dhammapada verses"

Style: Clean, minimal, zen-inspired. No cluttered elements.
```

### スクショ2: スワイプ機能
```
Create an App Store screenshot showing the swipe feature.

Device: iPhone 15 Pro Max (6.7 inch, 1290x2796)
Background: Soft beige gradient (#F5F0E8 to #EDE5D8)

Content:
- Multiple verse cards stacked, showing swipe animation
- Visual indication of swiping up (TikTok-style)

Text overlay:
- Headline: "Swipe through wisdom"
- Subheadline: "Discover timeless Buddhist teachings"

Style: Dynamic but minimal
```

### スクショ3: Stay Present通知
```
Create an App Store screenshot showing Stay Present notifications.

Device: iPhone 15 Pro Max (6.7 inch, 1290x2796)
Background: Soft beige or show iPhone lock screen

Content:
- Notification banner: "Daily Dharma: Are you present right now?"
- Or: Settings screen showing notification frequency options (5x, 7x, 10x)

Text overlay:
- Headline: "Stay present throughout your day"
- Subheadline: "Gentle mindfulness reminders"

Style: Peaceful, calming
```

### スクショ4: ダークモード
```
Create an App Store screenshot showing dark mode.

Device: iPhone 15 Pro Max (6.7 inch, 1290x2796)
Background: Dark gradient (#1A1A1A to #2D2D2D)

Content:
- Same verse display but in dark mode
- Gold accent colors for decorative elements

Text overlay:
- Headline: "Beautiful in any light"
- Subheadline: "Easy on the eyes, day or night"

Style: Elegant dark theme
```

### スクショ5: 設定画面
```
Create an App Store screenshot showing settings.

Device: iPhone 15 Pro Max (6.7 inch, 1290x2796)
Background: Soft beige gradient (#F5F0E8 to #EDE5D8)

Content:
- Settings screen with:
  - Dark Mode toggle
  - Stay Present Reminders (5x, 7x, 10x)
  - Morning Verse notification time
  - Premium banner

Text overlay:
- Headline: "Customize your practice"
- Subheadline: "Set your reminder frequency"

Style: Clean settings UI
```

### 必要サイズ（各画面で3サイズ作成）
- 6.7インチ: 1290 x 2796
- 6.5インチ: 1242 x 2688
- 5.5インチ: 1242 x 2208

---

## 3. App Store Connectメタデータ（手動登録用）

### 基本情報
| 項目 | 値 |
|------|-----|
| App Name | Daily Dharma |
| Subtitle | Buddhist Wisdom for Every Day |
| Bundle ID | com.dailydhamma.app |
| Apple ID | 6757726663 |
| Category Primary | Lifestyle |
| Category Secondary | Health & Fitness |
| Age Rating | 4+ |

### Promotional Text（170文字以内）
```
Ancient Buddhist wisdom meets modern mindfulness. Daily verses from the Dhammapada to bring peace and presence to your everyday life.
```

### Description（全文）
```
Daily Dharma brings the timeless wisdom of the Dhammapada to your fingertips. Start each day with authentic Buddhist teachings that have guided seekers for over 2,500 years.

ANCIENT WISDOM, MODERN DELIVERY
• Carefully curated verses from the Dhammapada
• Beautiful, distraction-free reading experience
• Swipe through teachings like your favorite social app

STAY PRESENT THROUGHOUT YOUR DAY
• Gentle mindfulness reminders (5, 7, or 10 times daily)
• "Are you present right now?" notifications bring you back to the moment
• Morning verse notifications to start your day with intention

DESIGNED FOR PEACE
• Clean, minimal interface
• Dark mode for comfortable reading
• Bookmark your favorite verses

PREMIUM FEATURES
• Access to all curated Dhammapada verses
• Up to 10 mindfulness reminders per day
• Verse bookmarking

Whether you're new to Buddhism or a longtime practitioner, Daily Dharma offers a simple way to integrate these profound teachings into your daily life.

"Hatreds never cease through hatred in this world; through love alone they cease. This is an eternal law." — Dhammapada, Verse 5
```

### Keywords（100文字以内）
```
buddhism,dhammapada,meditation,mindfulness,buddha,wisdom,zen,dharma,quotes,spiritual,calm,peace
```

### What's New (Version 1.0.0)
```
Welcome to Daily Dharma!

• Daily verses from the authentic Dhammapada
• Stay Present mindfulness reminders
• Beautiful swipe-through interface
• Dark mode support
• Bookmark your favorite verses

May these ancient teachings bring peace to your day.
```

### URLs
| 用途 | URL |
|------|-----|
| Privacy Policy | https://aniccaai.com/dailydharma/privacy |
| Support | https://aniccaai.com/dailydharma/support |
| Marketing (任意) | https://aniccaai.com/dailydharma |

### Review Notes（Apple審査員向け）
```
Daily Dharma is a simple mindfulness app that displays Buddhist wisdom from the Dhammapada.

No login required. The app stores preferences locally on the device.

Premium subscription unlocks additional verses and notification frequency options.

Thank you for reviewing our app.
```

---

## 4. 重要な情報まとめ

### アプリ情報
| 項目 | 値 |
|------|-----|
| App Name | Daily Dharma |
| Bundle ID | com.dailydhamma.app |
| Apple ID | 6757726663 |
| Team ID | S5U8UH3JLJ |

### API Keys
| サービス | Key |
|---------|-----|
| App Store Connect Key ID | D637C7RGFN |
| App Store Connect Issuer ID | f53272d9-c12d-4d9d-811c-4eb658284e74 |
| P8 Path | /Users/cbns03/Downloads/AuthKey_D637C7RGFN.p8 |
| RevenueCat iOS | appl_fHvAqxkeyCBSFIslMvNRuCDjndy |
| RevenueCat Test | test_xsrRSGvJpoCewrQyLxZUAOFpXXi |

### 機能の実態（有料 vs 無料）
| 機能 | 無料 | 有料 |
|------|------|------|
| Verse数 | 8個 | 16個 |
| ブックマーク | ❌ | ✅ |
| Stay Present通知 | 最大3回/日 | 5/7/10回選択可 |
| Widget | 実装後 | 実装後 |

---

## 5. 別エージェント向け指示（MCP設定）

### タスク概要
App Store Connect MCPをClaude Codeに追加する

### 手順
1. `~/.claude.json` を開く
2. `/Users/cbns03/Downloads/anicca-project` セクションを探す
3. `mcpServers` オブジェクト内に以下を追加:

```json
"app-store-connect": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "appstore-connect-mcp-server"],
  "env": {
    "APP_STORE_CONNECT_KEY_ID": "D637C7RGFN",
    "APP_STORE_CONNECT_ISSUER_ID": "f53272d9-c12d-4d9d-811c-4eb658284e74",
    "APP_STORE_CONNECT_P8_PATH": "/Users/cbns03/Downloads/AuthKey_D637C7RGFN.p8"
  }
}
```

4. Claude Codeを再起動
5. MCPが接続されたことを確認（`app-store-connect · ✔ connected` が表示されるはず）

### MCP設定完了後のタスク
1. Daily Dharma (Apple ID: 6757726663) のメタデータを上記セクション3の内容で入力
2. スクショをアップロード（ユーザーがSleekで作成したもの）

---

## 実機テスト確認項目

- [ ] アプリ起動確認
- [ ] Verse表示・スワイプ
- [ ] Stay Present通知（8時〜21時に届く）
- [ ] ダークモード切り替え
- [ ] ペイウォール表示
- [ ] ブックマーク機能（有料機能）

---

最終更新: 2026-01-13
