# Behaviorタブ削除リファクタリング

**実施日**: 2025-01-XX  
**目的**: Behaviorタブを完全削除し、3タブ構成（Talk → Habits → Profile）に変更

---

## As Is（現状）

### アーキテクチャ
- **4タブ構成**: Talk → Habits → **Behavior** → Profile
- Behaviorタブは睡眠・歩数・スクリーンタイムなどのデータ統合機能を提供

### 関連ファイル構成

#### Views
- `Views/Behavior/BehaviorView.swift` - メインView
- `Views/Behavior/TimelineView.swift` - 24時間タイムライン表示
- `Views/Behavior/HighlightsCard.swift` - 今日のハイライトカード
- `Views/Behavior/FutureScenarioView.swift` - 10年後の未来シナリオ表示

#### Models
- `Models/BehaviorSummary.swift` - Behaviorデータモデル

#### Services
- `Services/BehaviorSummaryService.swift` - APIサービス
- `Services/BehaviorSummaryCache.swift` - キャッシュ管理

#### コード参照箇所
- `AppState.swift`: `RootTab` enumに`.behavior = 2`が定義
- `MainTabView.swift`: `case .behavior: BehaviorView()`で画面切り替え
- `FigmaTabBar.swift`: behaviorタブボタンが表示
- `VoiceSessionController.swift`: `get_behavior_summary`関数ツールが定義

#### ローカライズ
- `en.lproj/Localizable.strings`: Behavior関連文字列14個
- `ja.lproj/Localizable.strings`: Behavior関連文字列14個
- `settings_data_optional_description`: Behaviorへの言及あり

---

## To Be（目標状態）

### アーキテクチャ
- **3タブ構成**: Talk → Habits → Profile
- Behaviorタブを完全削除
- 関連する全てのコード・ファイル・ローカライズを削除

### ベストプラクティスに基づく判断
- **Martin Fowler「Refactoring」**: Remove Dead Codeパターンに従い、完全削除を選択
- **理由**: 
  - 「いつか使うかも」で残すのはCode Smell
  - Git履歴から完全復元可能（デザインを失わない）
  - コードベースをクリーンに保つ

---

## 実装パッチ

### 1. ファイル削除（7ファイル）

```bash
# 削除されたファイル
rm aniccaios/aniccaios/Views/Behavior/BehaviorView.swift
rm aniccaios/aniccaios/Views/Behavior/TimelineView.swift
rm aniccaios/aniccaios/Views/Behavior/HighlightsCard.swift
rm aniccaios/aniccaios/Views/Behavior/FutureScenarioView.swift
rm aniccaios/aniccaios/Models/BehaviorSummary.swift
rm aniccaios/aniccaios/Services/BehaviorSummaryService.swift
rm aniccaios/aniccaios/Services/BehaviorSummaryCache.swift
```

### 2. AppState.swift - RootTab enum修正

```diff
-    enum RootTab: Int, Hashable {
-        case talk = 0
-        case habits = 1      // 新規追加
-        case behavior = 2    // 1 → 2
-        case profile = 3     // 2 → 3
-    }
+    enum RootTab: Int, Hashable {
+        case talk = 0
+        case habits = 1
+        case profile = 2
+    }
```

**変更内容**: `.behavior`ケースを削除し、`.profile`の値を3から2に変更

### 3. MainTabView.swift - behaviorケース削除

```diff
         Group {
             switch appState.selectedRootTab {
             case .talk:
                 TalkView()
             case .habits:
                 HabitsTabView()
                     .environmentObject(appState)
-            case .behavior:
-                BehaviorView()
             case .profile:
                 ProfileView()
                     .environmentObject(appState)
             }
         }
```

**変更内容**: `case .behavior:`とその処理を削除

### 4. FigmaTabBar.swift - behaviorタブボタン削除

```diff
-    // Figma指定: 4タブ均等配置（水平中央揃え）
+    // Figma指定: 3タブ均等配置（水平中央揃え）
     private let tabCornerRadius: CGFloat = 24
     
     var body: some View {
         VStack(spacing: 0) {
             // 上部ボーダー（アダプティブ）
             Rectangle()
                 .fill(AppTheme.Colors.tabBarBorder)
                 .frame(height: 1)
             
-            // タブコンテナ（4タブ均等配置）
+            // タブコンテナ（3タブ均等配置）
             HStack(spacing: 0) {
                 tabButton(
                     tab: .talk,
                     icon: "message.fill",
                     title: String(localized: "tab_talk")
                 )
                 tabButton(
                     tab: .habits,
                     icon: "clock.arrow.circlepath",
                     title: String(localized: "tab_habits")
                 )
-                tabButton(
-                    tab: .behavior,
-                    icon: "chart.bar",
-                    title: String(localized: "tab_behavior")
-                )
                 tabButton(
                     tab: .profile,
                     icon: "person",
                     title: String(localized: "tab_profile")
                 )
             }
```

**変更内容**: 
- behaviorタブボタンを削除
- コメントを「4タブ」→「3タブ」に修正

### 5. VoiceSessionController.swift - get_behavior_summary関数削除

```diff
             ],
-            [
-                "type": "function",
-                "name": "get_behavior_summary",
-                "description": "Get today's behavior summary for the Behavior tab",
-                "parameters": [
-                    "type": "object",
-                    "strict": true,
-                    "additionalProperties": false,
-                    "properties": [
-                        "userId": ["type": "string"]
-                    ],
-                    "required": ["userId"]
-                ]
-            ]
         ]
```

**変更内容**: OpenAI Realtime APIの関数ツール定義から`get_behavior_summary`を削除

### 6. en.lproj/Localizable.strings - Behavior関連文字列削除

```diff
-/* v3 Behavior */
-"common_loading" = "Loading…";
-"common_retry" = "Retry";
-"behavior_title_today_insights" = "Today's Insights";
-"behavior_error_failed_load" = "Failed to load today's insights.";
-"behavior_title_today_highlights" = "Today's Highlights";
-"behavior_title_timeline" = "24-Hour Timeline";
-"behavior_title_future" = "10 Years From Now";
-"behavior_not_enough_data" = "Not enough data";
-"behavior_highlight_wake" = "Wake";
-"behavior_highlight_screen" = "Screen";
-"behavior_highlight_workout" = "Workout";
-"behavior_highlight_rumination" = "Rumination";
-"behavior_status_moving_forward" = "Moving Forward";
-"behavior_status_needs_attention" = "Needs Attention";
-"behavior_status_stable" = "Stable";
+"common_loading" = "Loading…";
+"common_retry" = "Retry";
```

```diff
-"tab_behavior" = "Behavior";
```

```diff
-"settings_data_optional_description" = "Sleep, Steps, Screen Time, and Motion are optional. Even if you keep them OFF, you can always use Talk. Behavior insights may be limited until you connect data.";
+"settings_data_optional_description" = "Sleep, Steps, Screen Time, and Motion are optional. Even if you keep them OFF, you can always use Talk.";
```

**変更内容**: 
- Behavior関連文字列14行削除
- `tab_behavior`削除
- `settings_data_optional_description`からBehavior言及を削除

### 7. ja.lproj/Localizable.strings - Behavior関連文字列削除

```diff
-/* v3 Behavior */
-"common_loading" = "読み込み中…";
-"common_retry" = "再試行";
-"behavior_title_today_insights" = "今日のインサイト";
-"behavior_error_failed_load" = "今日のインサイトを取得できませんでした。";
-"behavior_title_today_highlights" = "今日のハイライト";
-"behavior_title_timeline" = "24時間タイムライン";
-"behavior_title_future" = "10年後の未来";
-"behavior_not_enough_data" = "データが不足しています";
-"behavior_highlight_wake" = "起床";
-"behavior_highlight_screen" = "スクリーン";
-"behavior_highlight_workout" = "運動";
-"behavior_highlight_rumination" = "反芻";
-"behavior_status_moving_forward" = "前進中";
-"behavior_status_needs_attention" = "要注意";
-"behavior_status_stable" = "安定";
+"common_loading" = "読み込み中…";
+"common_retry" = "再試行";
```

```diff
-"tab_behavior" = "行動";
```

```diff
-"settings_data_optional_description" = "睡眠・歩数・スクリーンタイム・動作データの連携は任意です。未許可でもTalkはいつでも使えます。連携するとBehaviorのインサイト精度が向上します。";
+"settings_data_optional_description" = "睡眠・歩数・スクリーンタイム・動作データの連携は任意です。未許可でもTalkはいつでも使えます。";
```

**変更内容**: 
- Behavior関連文字列14行削除
- `tab_behavior`削除
- `settings_data_optional_description`からBehavior言及を削除

---

## 変更サマリー

| 変更種別 | ファイル数 | 詳細 |
|---------|-----------|------|
| ファイル削除 | 7 | Views/Behavior/* (4ファイル), Models/BehaviorSummary.swift, Services/BehaviorSummary*.swift (2ファイル) |
| ディレクトリ削除 | 1 | Views/Behavior/ |
| コード修正 | 4 | AppState.swift, MainTabView.swift, FigmaTabBar.swift, VoiceSessionController.swift |
| ローカライズ削除 | 2 | en.lproj（15行削除）, ja.lproj（15行削除）|
| ローカライズ修正 | 2 | settings_data_optional_description 文言変更（en/ja両方）|

**合計**: 16ファイルの変更（7削除 + 9修正）

---

## 検証結果

### ✅ 完了した検証
- [x] リンターエラー: なし
- [x] Behavior関連の参照: 全て削除済み（grepで確認）
- [x] ローカライズ: en/ja両方で対応完了

### ⏸️ 未完了
- [ ] Fastlaneでのビルド実行（タイムアウト）
- [ ] 実機での動作確認

---

## エラー時の参照

### 復元方法
削除したファイルはGit履歴から復元可能：

```bash
# 特定のコミットからファイルを復元
git checkout <commit-hash> -- aniccaios/aniccaios/Views/Behavior/

# または、削除前のコミットを確認
git log --all --full-history -- aniccaios/aniccaios/Views/Behavior/
```

### ロールバック方法
この変更をロールバックする場合：

```bash
# このコミットをrevert
git revert <commit-hash>

# または、このコミット以前の状態に戻す
git reset --hard <commit-hash>
```

---

## 参考資料

### ベストプラクティス根拠
- **Martin Fowler「Refactoring」**: [Remove Dead Code](https://refactoring.com/catalog/removeDeadCode.html)
- **refactoring.guru**: [Dead Code Smell](https://refactoring.guru/smells/dead-code)
- **Feature Flag Tech Debt**: [tggl.io/blog/how-to-remove-old-feature-flags](https://tggl.io/blog/how-to-remove-old-feature-flags-without-breaking-your-code)

### 決定理由
1. **完全削除を選択**: 「いつか使うかも」で残すのはCode Smell
2. **Git履歴で復元可能**: デザインを失うリスクなし
3. **コードベースをクリーンに**: 保守性向上

---

**最終更新**: 2025-01-XX  
**実装者**: AI Assistant  
**レビュー**: 未実施



