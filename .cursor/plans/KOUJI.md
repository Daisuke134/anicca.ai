<!-- 2425871f-6eee-432e-9293-248ca88f93fb b7b45570-5e32-4198-aa3c-aa7b22f7a18b -->
# 習慣管理機能の大幅改善 - 実装計画

## 概要

現在の習慣管理機能を大幅に改善し、Appleの時計アプリのような直感的なUI/UXを実現します。複数のカスタム習慣を追加可能にし、設定画面で時系列順に表示、スワイプ削除、トグルスイッチによるON/OFF切り替えを実装します。

## Phase 1: 即座に実装すべき機能（同時実装版）

### 1. データモデルの拡張

#### 1.1 CustomHabitStoreの配列対応

**ファイル**: `aniccaios/aniccaios/Models/CustomHabitConfiguration.swift`

- `CustomHabitStore`を配列対応に変更
- `load()` → `loadAll(): [CustomHabitConfiguration]`
- `save(_:)` → `saveAll(_:)` と `add(_:)`, `remove(at:)`, `update(at:configuration:)`
- 各カスタム習慣にUUIDを付与して識別

#### 1.2 UserProfileの拡張

**ファイル**: `aniccaios/aniccaios/Models/UserProfile.swift`

- `wakeLocation: String` を追加（起床場所）
- `wakeRoutines: [String]` を追加（起床後ルーティン配列）
- `sleepRoutines: [String]` を追加（就寝前ルーティン配列）
- `trainingGoal: String` を追加（筋トレの目標値、例："15回"）
- `idealTraits: [String]` を追加（理想の姿、Phase 1で使用）

#### 1.3 HabitConfigurationモデルの作成

**ファイル**: `aniccaios/aniccaios/Models/HabitConfiguration.swift` (新規)

- 習慣ごとの設定を管理する構造体
- `id: UUID`, `type: HabitType`, `isEnabled: Bool`, `time: DateComponents?`, `customName: String?` など

### 2. オンボーディングフローの簡略化

#### 2.1 フォローアップ質問の削除

**ファイル**: `aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift`

- `habitWakeLocation`, `habitSleepLocation`, `habitTrainingFocus` のケースを削除
- `advance()` メソッドから該当分岐を削除

**ファイル**: `aniccaios/aniccaios/Onboarding/OnboardingStep.swift`

- 該当ステップを削除（またはコメントアウト）

**ファイル**: `aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift`

- `appState.prepareHabitFollowUps()` の呼び出しを削除
- フォローアップなしで直接Paywall/Completionへ遷移

**ファイル**: `aniccaios/aniccaios/AppState.swift`

- `prepareHabitFollowUps()`, `consumeNextHabitFollowUp()`, `clearHabitFollowUps()` を削除または無効化

#### 2.2 HabitSetupStepViewの改善

**ファイル**: `aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift`

- チェックボックスをトグルスイッチに変更（右側配置、Apple時計アプリ風）
- 初期状態は全てOFF
- トグルON → 時間設定の流れ
- **重要**: カスタム習慣の固定要素（「カスタム習慣」という項目）は削除
- 既存の3つ（起床、トレーニング、就寝）の下に「習慣を追加」ボタンを配置
- 追加したカスタム習慣は「習慣を追加」ボタンの上に表示
- 「習慣を追加」ボタンは常に最下部に固定（スクロールしても見える位置）
- 左スワイプでカスタム習慣を削除可能

### 3. 設定画面の大幅改善

#### 3.1 Personalizationセクションの簡略化

**ファイル**: `aniccaios/aniccaios/SettingsView.swift`

- `sleepLocation`, `trainingFocus` フィールドを削除
- `Name` と `Language` のみ残す

#### 3.2 習慣一覧の改善

**ファイル**: `aniccaios/aniccaios/SettingsView.swift`

- チェックボックスをトグルスイッチに変更（右側配置、Apple時計アプリ風）
- 時系列順に自動ソート（`habitSchedules`を時間順に並び替え）
- 左から右へスワイプでカスタム習慣を削除可能（`.swipeActions(edge: .trailing)`）。スワイプすると右側に赤い削除ボタンが表示される
- **重要**: カスタム習慣の固定要素は削除
- 既存の3つ（起床、トレーニング、就寝）の下に「習慣を追加」ボタンを配置
- 追加したカスタム習慣は「習慣を追加」ボタンの上に表示
- 「習慣を追加」ボタンは常に最下部に固定（スクロールしても見える位置）
- 各習慣カードをタップするとフォローアップ画面へ遷移

#### 3.3 習慣カードのレイアウト変更

**ファイル**: `aniccaios/aniccaios/SettingsView.swift` の `habitCard(for:)` メソッド

- 左側: 習慣名と詳細
- 右側: 時間表示とトグルスイッチ
- トグルは `Toggle("", isOn: $isActive)` を使用
- スワイプアクションで削除ボタンを追加

#### 3.4 習慣セクションのコンポーネント化（新規・重要）

**ファイル**: `aniccaios/aniccaios/Habits/HabitsSectionView.swift` (新規)

- **目的**: `SettingsView` と `HabitsTabView` の両方で再利用可能な習慣セクションコンポーネントを作成
- `SettingsView` にあった習慣セクション（トグル・時間・時系列ソート・スワイプ削除・追加シート）をまるごと抽出
- `.toolbar { EditButton() }` を付与して `.onMove` のUIを有効化（ルーティン順番変更用）
- 時刻表示は `date.formatted(date: .omitted, time: .shortened)` を使用（ロケール・12/24時制対応）
- 追加フォームは `.sheet(item:)` を使って一元化（複数 `.sheet` 乱立を回避）
- `enum SheetRoute: Identifiable` で sheet の種類を管理

### 4. フォローアップ画面の実装

#### 4.1 HabitFollowUpViewの作成

**ファイル**: `aniccaios/aniccaios/Settings/HabitFollowUpView.swift` (新規)

- 起床/就寝/筋トレの3種類に対応
- NavigationViewで実装、左上Cancel、右上Save
- Save押下で設定を保存して元の画面に戻る

#### 4.2 起床/就寝フォローアップ画面

**ファイル**: `aniccaios/aniccaios/Settings/HabitWakeFollowUpView.swift` (新規)
**ファイル**: `aniccaios/aniccaios/Settings/HabitSleepFollowUpView.swift` (新規)

- 場所入力フィールド（起床場所/就寝場所）
- ルーティン入力セクション:
- デフォルトで3つの空欄要素を表示（プレースホルダーのみ、値は入っていない）
- 各要素にナンバリング（1, 2, 3...）
- 自由記述で入力可能
- 各ルーティン行の左側に三本線アイコン（☰）を表示し、ドラッグ&ドロップで順番を変更可能（`.onMove(perform:)`を使用）
  - **実装要件**: `Array`に`move(fromOffsets:toOffset:)`拡張メソッドを実装する必要がある（`Array+Extensions.swift`に追加）
  - ドラッグハンドル（三本線アイコン）を長押ししてドラッグすることで順番を変更
- ルーティンの削除は×ボタンではなく、左から右へスワイプして削除ボタンを表示（`.swipeActions(edge: .trailing)`）
- 「+」ボタンで新しいルーティン項目を追加

#### 4.3 筋トレフォローアップ画面

**ファイル**: `aniccaios/aniccaios/Settings/HabitTrainingFollowUpView.swift` (新規)

- **重要**: レイアウト順序を変更
- **上に「目標」入力フィールド**（自由記述、例："1日15回"）
- **下に「トレーニングの種類を選択」**の4つの選択肢（Push-up, Core, Cardio, Stretch）
- **重要**: 複数選択ではなく、**一つだけ**選択可能（`Set<String>`ではなく`String?`を使用）
- チェックマークではなく、**トグルスイッチ**を使用（`Toggle`コンポーネント）
- 一つのトグルをONにすると、他のトグルは自動的にOFFになる（単一選択の動作）
- Push-up/Coreは回数、Cardio/Stretchは時間またはそのまま

### 5. プロンプトの改善

#### 5.1 training.txtの改善

**ファイル**: `aniccaios/aniccaios/Resources/Prompts/training.txt`

- `Down... Up...` の間に必ず一語挟む（"Good", "Nice", "Perfect"などバラエティ持たせる）
- ユーザー割り込み時のカウント継続ロジックを追加
- 目標値のグラウンディングを追加（`${TRAINING_GOAL}`）
- 目標が設定されている場合の開始メッセージを追加

#### 5.2 wake_up.txtの改善

**ファイル**: `aniccaios/aniccaios/Resources/Prompts/wake_up.txt`

- デフォルトで「顔を洗って眠気を覚ます」ことを促す
- ルーティンが設定されている場合のグラウンディングを追加（`${WAKE_ROUTINES}`）
- 起床場所のグラウンディングを追加（`${WAKE_LOCATION}`）

#### 5.3 bedtime.txtの改善

**ファイル**: `aniccaios/aniccaios/Resources/Prompts/bedtime.txt`

- 就寝場所のグラウンディングを追加（`${SLEEP_LOCATION}`）
- 就寝前ルーティンのグラウンディングを追加（`${SLEEP_ROUTINES}`）

#### 5.4 common.txtの改善

**ファイル**: `aniccaios/aniccaios/Resources/Prompts/common.txt`

- 理想の姿のグラウンディングを追加（Phase 2で使用、`${IDEAL_TRAITS}`）

#### 5.5 WakePromptBuilderの拡張

**ファイル**: `aniccaios/aniccaios/WakePromptBuilder.swift`

- `render()` メソッドに新しいプレースホルダーの処理を追加:
- `WAKE_LOCATION`, `WAKE_ROUTINES`, `SLEEP_ROUTINES`
- `TRAINING_GOAL`, `IDEAL_TRAITS`
- 各習慣タイプに応じた適切なグラウンディングを実装
- **重要**: `AppState.shared` の直接参照を避け、`UserProfile` を引数として依存注入（DI）する形に変更

### 6. AppStateの更新

#### 6.1 習慣管理メソッドの追加

**ファイル**: `aniccaios/aniccaios/AppState.swift`

- `addCustomHabit(_:)` メソッド
- `removeCustomHabit(at:)` メソッド
- `updateHabitRoutines(habit:routines:)` メソッド
- `updateHabitLocation(habit:location:)` メソッド
- `updateTrainingGoal(_:)` メソッド

#### 6.2 UserProfile更新メソッドの追加

**ファイル**: `aniccaios/aniccaios/AppState.swift`

- `updateWakeLocation(_:)` メソッド
- `updateWakeRoutines(_:)` メソッド
- `updateSleepRoutines(_:)` メソッド
- `updateTrainingGoal(_:)` メソッド

### 7. タブナビゲーションの追加（Phase 1へ前倒し）

#### 7.1 MainTabViewの実装

**ファイル**: `aniccaios/aniccaios/MainTabView.swift` (新規)

- `TabView` で2つのタブを実装:
- "Talk" タブ: 既存の `SessionView`（`typealias TalkTabView = SessionView` で再利用）
- "Habits" タブ: `HabitsTabView`（新規）
- `TabView(selection: $selectedTab)` でプログラム制御可能

#### 7.2 HabitsTabViewの作成

**ファイル**: `aniccaios/aniccaios/Habits/HabitsTabView.swift` (新規)

- 画面本体は `HabitsSectionView` を表示（習慣セクションのコンポーネントを再利用）
- 右上のギア（⚙️）ボタンで `SettingsView` を `.sheet` 表示
- `SettingsView` には「Personalization」と「理想の姿」セクションのみ残す（習慣セクションは削除）

#### 7.3 ContentRouterViewの更新

**ファイル**: `aniccaios/aniccaios/ContentRouterView.swift` (既存)

- ルート表示を `SessionView()` → `MainTabView()` に変更
- オンボーディング完了後もタブナビゲーションへ合流

### 8. 理想の姿設定機能（Phase 1に統合済み）

#### 8.1 理想の姿設定の実装

**ファイル**: `aniccaios/aniccaios/SettingsView.swift`

- **重要**: 別画面に遷移せず、設定画面内に直接表示（従来通り）
- Personalizationセクションの下に「理想の姿」セクションを追加
- 選択肢をグリッド表示（confident, empathetic, gentle, optimistic, creative, energetic, calm, assertive, motivational, supportive, direct, encouraging, analytical, patient, friendly, professional など）
- タップで選択/解除（複数選択可、選択時は黒背景に白文字、未選択時は白背景にグレー文字）
- 選択された項目を `UserProfile.idealTraits` に保存
- スクリーンショット3枚目のようなUIを実装
- **注意**: タブ導入後も `SettingsView` に残す（`HabitsTabView` から `.sheet` で開く）

#### 8.2 common.txtへのグラウンディング

**ファイル**: `aniccaios/aniccaios/Resources/Prompts/common.txt`

- `${IDEAL_TRAITS}` プレースホルダーを追加
- 理想の姿に基づいたコンテキストを追加

## Phase 2: 後で実装すべき機能（前倒し後の残タスク）

- 将来拡張（例：高度な分析、通知チューニング、A/B実験 など）
- Phase 1で導入したタブ/習慣UIの追加イテレーション

## 実装順序の推奨（同時実装版）

1. **データモデルの拡張** (1.1, 1.2, 1.3) + **AppStateの更新** (6.1, 6.2)
2. **オンボーディングフローの簡略化** (2.1, 2.2)
3. **設定画面の改善** (3.1, 3.2, 3.3) + **理想の姿設定** (8.1, 8.2)
4. **習慣セクションのコンポーネント化** (3.4, `HabitsSectionView` 抽出)
5. **フォローアップ画面の実装** (4.1, 4.2, 4.3)
6. **プロンプトの改善** (5.1-5.5) + **WakePromptBuilderのDI化** (5.5)
7. **タブナビゲーション導入** (7.1, 7.2, 7.3) + **ContentRouterView更新**

## 注意事項

### 基本要件
- 既存のデータとの互換性を保つため、マイグレーション処理が必要な場合がある
- カスタム習慣の削除時は、関連する通知スケジュールも削除する必要がある
- 時系列順のソートは、時間が設定されていない習慣は最後に表示
- **左から右へスワイプ削除は、デフォルト習慣（wake, training, bedtime）には適用しない（カスタム習慣のみ）**
- 「習慣を追加」ボタンは常に最下部に固定（スクロールしても見える位置）
- ルーティン入力欄はデフォルトで空欄（プレースホルダーのみ、値は入っていない）
- 筋トレフォローアップ画面は上に「目標」、下に「トレーニングの種類を選択」の順序
- 理想の姿は設定画面内に直接表示（別画面に遷移しない）
- Habitsタブの設定ボタンは右上に配置
- プロンプトの変更は、既存のセッションに影響しないよう注意

### 同時実装版の追加注意事項
- **`HabitsSectionView` を唯一の習慣UI表示コンポーネントとして再利用**（重複を作らない）
- **`.sheet` は `enum SheetRoute: Identifiable` + `sheet(item:)` で一元管理**（多重定義を避ける）
- **`UserDefaults.synchronize()` は使用しない**（iOSでは自動同期されるため非推奨）
- **`.onMove` は `List` 内 + `EditButton`/`editMode` 有効時に利用**（編集モードでUIが表示される）
- **時刻表示は `Date.FormatStyle` でローカライズ**（`date.formatted(date: .omitted, time: .shortened)` を使用）
- **`WakePromptBuilder` は `UserProfile` を引数として依存注入**（`AppState.shared` の直接参照を避ける）

## UIデザインイメージ

### 習慣設定画面（オンボーディング・設定画面共通）

- **トグルスイッチ**: iOS標準のトグルスイッチを使用（右側配置）
  - ON状態: 緑色のトグル、時間が表示される
  - OFF状態: グレーのトグル、時間は非表示
  - トグルON時に時間設定シートが自動表示

- **習慣の並び順**: 時系列順に自動ソート（時間が設定されていない習慣は最後）

- **カスタム習慣の削除**: 
  - 左から右へスワイプすると、右側に赤い削除ボタンが表示される
  - 削除ボタンをタップすると確認アラートが表示
  - デフォルト習慣（起床・トレーニング・就寝）は削除不可

### フォローアップ画面

#### 起床/就寝フォローアップ画面

- **ルーティンの順番変更**: 
  - 各ルーティン行の左側に三本線アイコン（☰）が表示
  - このアイコンを長押ししてドラッグすることで順番を変更可能
  - iOS標準のドラッグ&ドロップ機能を使用

- **ルーティンの削除**: 
  - ×ボタンは使用しない
  - 左から右へスワイプすると、右側に赤い削除ボタンが表示される
  - 削除ボタンをタップすると即座に削除

#### 筋トレフォローアップ画面

- **トレーニング種類の選択**: 
  - 複数選択ではなく、**一つだけ**選択可能
  - チェックマークではなく、**トグルスイッチ**を使用
  - 一つのトグルをONにすると、他のトグルは自動的にOFFになる
  - 選択中の項目のみトグルがON状態

### 操作フロー

1. **習慣の有効化**: トグルスイッチをON → 時間設定シート表示 → 時間選択 → 保存

2. **習慣の無効化**: トグルスイッチをOFF → 時間設定がクリア

3. **カスタム習慣の追加**: 「習慣を追加」ボタン → アラートで名前入力 → 追加

4. **カスタム習慣の削除**: 左から右へスワイプ → 削除ボタン表示 → タップ → 確認 → 削除

5. **ルーティンの順番変更**: 三本線アイコンを長押し → ドラッグ → 希望の位置にドロップ

6. **ルーティンの削除**: 左から右へスワイプ → 削除ボタン表示 → タップ → 即座に削除

7. **トレーニング種類の選択**: トグルスイッチをON → 他のトグルは自動的にOFF

### To-dos

- [ ] データモデルの拡張: CustomHabitStoreの配列対応、UserProfileの拡張、HabitConfigurationモデルの作成
- [ ] オンボーディングフローの簡略化: フォローアップ質問の削除、HabitSetupStepViewの改善（トグルスイッチ、複数カスタム習慣対応）
- [ ] 設定画面の改善: Personalization簡略化、習慣一覧の改善（トグルスイッチ、時系列順ソート、スワイプ削除）
- [ ] フォローアップ画面の実装: HabitFollowUpView、起床/就寝/筋トレの各フォローアップ画面
- [ ] プロンプトの改善: training.txt、wake_up.txt、bedtime.txt、common.txt、WakePromptBuilderの拡張
- [ ] AppStateの更新: 習慣管理メソッド、UserProfile更新メソッドの追加
- [ ] 習慣セクションのコンポーネント化: HabitsSectionViewの抽出、SettingsView/HabitsTabViewでの再利用
- [ ] タブナビゲーションの追加: MainTabView実装、HabitsTabViewの作成、ContentRouterView更新（Phase 1へ前倒し）
- [ ] 理想の姿設定機能: SettingsView内に直接表示、common.txtへのグラウンディング（Phase 1に統合済み）