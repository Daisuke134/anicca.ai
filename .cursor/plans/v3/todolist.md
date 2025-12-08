まず `todolist.md` を確認させてください。

[1 tool called]

`v3-ui.md` と `v3-data.md` も確認して、完全なリストを作成します。

[2 tools called]

すべてのドキュメントを確認しました。現在の状態を完全に把握した上で、**実装時の迷いを0にするために必要なもの**を完全にリストアップします。

---

# 実装に必要なドキュメント：完全リスト

## A. 既存ドキュメント（6ファイル）

| ファイル | 状態 | 補足 |
|---------|------|------|
| `v3-ux.md` | ✓ 更新済み | UX全体像 |
| `v3-stack.md` | ✓ 更新済み | 技術スタック全体 |
| `v3-stack-revision.md` | ✓ 更新済み | EMA/Exa/BIG5追加 |
| `v3-stack-nudge.md` | ✓ 更新済み | Nudge＋記憶レイヤー |
| `v3-data.md` | ✓ OK | 6ドメインのstate/action/reward |
| `v3-ui.md` | ✓ OK | UI仕様書（完全版） |

---

## B. 新規作成が必要なドキュメント（9ファイル）

### 1. `prompts-v3.md` - LLMプロンプト集 【Must】

**なぜ必要か**: Anicca の人格、Nudge文言、サマリ生成などすべてのLLM呼び出しで使うプロンプトがないと、実装時に「何を書けばいいか」で止まる。

**書くべき内容**:

| セクション | 内容 |
|-----------|------|
| 1. Talk セッション system prompt | Anicca の人格・トーン・禁止事項・tool定義 |
| 2. Feeling 導入スクリプト生成 | feelingId（self_loathing, anxiety, irritation, free_conversation）ごとのテンプレート |
| 3. Nudge 文言生成 | domain × templateId ごとのプロンプト（wake_gentle, sns_direct 等） |
| 4. Today's Insights 生成 | Behavior画面の「今日の一言」サマリ生成プロンプト |
| 5. 10年後シナリオ生成 | 行動ログ → 長期未来シナリオ生成プロンプト |
| 6. BIG5 推定 | 30日分ログ → Big Five スコア + 説明文 生成プロンプト |
| 7. 核フレーズ一覧 | 「毎回同じ」内在化用フレーズ（wake, sleep, sns, self_loathing 等） |

---

### 2. `quotes-v3.md` - Quoteカード固定メッセージ 【Must】

**なぜ必要か**: Talk画面の「今日の一言」は30個の固定メッセージから選ぶと決まっている。これがないと実装できない。

**書くべき内容**:

```markdown
# Anicca Quote Collection (30 messages)

1. Even when you hate yourself, you still deserve gentleness.
2. You don't have to fix your whole life tonight. One honest step is enough.
3. ...（30個すべて）
```

---

### 3. `tech-bandit-v3.md` - Bandit実装仕様 【Must】

**なぜ必要か**: 「LinTSを使う」とあるが、具体的にどう実装するか不明。

**書くべき内容**:

| セクション | 内容 |
|-----------|------|
| 1. 採用アルゴリズム | LinTS (Linear Thompson Sampling) の概要 |
| 2. 実装言語・配置先 | TypeScript（`apps/api/src/modules/nudge/policy/`）|
| 3. state → x エンコード | `number[]` / 正規化方法 / one-hot encoding |
| 4. action space定義 | ドメイン別の action_id → template_id マッピング表 |
| 5. 学習タイミング | reward判定後に即時更新 / バッチ更新 |
| 6. モデル保存形式 | JSON（重み行列 / 分散行列）/ DB or Redis |
| 7. 探索パラメータ | Thompson Samplingのσ / 探索率の調整方法 |
| 8. 初期化方針 | prior設定 / cold start時の挙動 |

---

### 4. `tech-db-schema-v3.md` - DBスキーマ定義 【Must】

**なぜ必要か**: テーブル構造がないとAPI実装が始められない。

**書くべき内容**:

| セクション | 内容 |
|-----------|------|
| 1. ER図（概要） | テーブル間のリレーション |
| 2. Prisma schema | 各テーブルの定義（SQL DDL相当） |

**必要なテーブル**:

| テーブル | 用途 |
|---------|------|
| `users` | ユーザー基本情報（apple_user_id等） |
| `user_traits` | ideals[], struggles[], big5{}, nudge_intensity |
| `daily_metrics` | 日次メトリクス（sleep, screen, steps等） |
| `nudge_events` | Nudge送信記録（domain, state, action, reward） |
| `nudge_outcomes` | Nudge結果記録（short_term_outcome, reward） |
| `feeling_sessions` | Feelingセッション記録（ema_better等） |
| `habit_logs` | 習慣ログ |
| `quotes` | 固定Quote（またはコードに直接埋め込み） |
| `bandit_models` | 各ドメインのbanditモデル重み |

---

### 5. `tech-state-builder-v3.md` - State構築仕様 【Must】

**なぜ必要か**: 各ドメインのstateをどう構築するか、データソースの特定が必要。

**書くべき内容**:

| 関数 | 入力 | 出力型 | データソース |
|------|------|--------|-------------|
| `buildWakeState(userId, now)` | userId, 現在時刻 | `WakeState` | `daily_metrics`(7日), `nudge_events`, `user_traits` |
| `buildScreenState(userId, now)` | userId, 現在時刻 | `ScreenState` | DeviceActivity(当日), `daily_metrics`, `user_traits` |
| `buildMovementState(userId, now)` | userId, 現在時刻 | `MovementState` | HealthKit, `daily_metrics` |
| `buildMentalState(userId, feelingId)` | userId, feelingId | `MentalState` | mem0, `feeling_sessions`, `user_traits` |
| `buildHabitState(userId, habitId)` | userId, habitId | `HabitState` | `habit_logs`, `user_traits` |

**正規化ルール**も明記（例: `sleepDebtHours = avg7d - lastNight`）

---

### 6. `ios-sensors-spec-v3.md` - iOSセンサー仕様 【Must】

**なぜ必要か**: DeviceActivity / HealthKit の実装制約を知らないとiOS側が作れない。

**書くべき内容**:

| セクション | 内容 |
|-----------|------|
| **DeviceActivity / FamilyControls** | |
| - entitlement申請 | 必要な capability と申請手順 |
| - FamilyActivityPicker | 監視対象アプリ選択UIの実装方法 |
| - 監視threshold | 30分/60分等の設定方法 |
| - ShieldActionDelegate | 制限時の挙動 |
| **HealthKit** | |
| - HKSampleType一覧 | sleepAnalysis, stepCount, heartRate等 |
| - 認可フロー | 許可リクエストの実装 |
| - バックグラウンド読み取り | HKObserverQuery設定 |
| **CoreMotion** | |
| - CMMotionActivityManager | stationary判定ロジック |
| - 電池消費対策 | 更新頻度の制限 |
| **データ送信** | |
| - タイミング | 1日1回バッチ or リアルタイム |
| - JSON形式 | 送信するデータ構造 |

---

### 7. `tech-nudge-scheduling-v3.md` - Nudgeスケジューリング仕様 【Should】

**なぜ必要か**: 複数ドメインのNudgeが同時に発火した時のルールがないと混乱する。

**書くべき内容**:

| セクション | 内容 |
|-----------|------|
| ドメイン優先順位 | Sleep > Mental > Screen > Movement > Habit |
| 時間窓制御 | 同じ30分窓で複数DP → 最優先1つだけ |
| クールダウン | 同一ドメイン間の最小間隔（例: SNSは60分） |
| 1日上限 | ドメインごとの最大Nudge数 |
| Quiet Mode | ユーザー設定 `nudgeIntensity = quiet` の挙動 |

---

### 8. `tech-ema-v3.md` - EMA仕様 【Should】

**なぜ必要か**: 「さっきより楽になった？」の具体的なUIと未回答時の処理が曖昧。

**書くべき内容**:

| 項目 | 仕様 |
|------|------|
| 質問文 | 英: "Did you feel a bit better?" / 日: "さっきより楽になった？" |
| 回答形式 | 2ボタン: "Yes" / "No" |
| 表示タイミング | Session画面で「End」ボタンを押した後、モーダルで表示 |
| 未回答時 | モーダルを閉じた場合は `reward = null` でbandit更新スキップ |
| データ保存 | `feeling_sessions.ema_better` に true/false/null |

---

### 9. `file-structure-v3.md` - ファイル構造ツリー 【Must】

**なぜ必要か**: 新規ファイルをどこに作るか、既存ファイルをどう修正するかが明確でないと迷う。

**書くべき内容**:

```
aniccaios/
├── aniccaios/
│   ├── Views/
│   │   ├── Talk/
│   │   │   ├── TalkView.swift       # Feelingカード + Quote
│   │   │   ├── FeelingCard.swift    # 新規
│   │   │   └── QuoteCard.swift      # 新規
│   │   ├── Session/
│   │   │   ├── SessionView.swift    # 新規：音声セッション画面
│   │   │   ├── OrbView.swift        # 新規：青いオーブ
│   │   │   └── EMAModal.swift       # 新規：終了時EMA
│   │   ├── Behavior/
│   │   │   ├── BehaviorView.swift   # 新規
│   │   │   ├── TimelineView.swift
│   │   │   ├── HighlightsCard.swift
│   │   │   └── FutureScenarioView.swift
│   │   ├── Profile/
│   │   │   ├── ProfileView.swift    # 新規
│   │   │   └── TraitsDetailView.swift
│   │   └── Onboarding/
│   │       ├── WelcomeView.swift
│   │       ├── IdealsView.swift
│   │       ├── StrugglesView.swift
│   │       ├── ValueView.swift
│   │       ├── SignInView.swift
│   │       ├── MicPermissionView.swift
│   │       └── NotificationPermissionView.swift
│   ├── Sensors/
│   │   ├── DeviceActivityMonitor.swift
│   │   ├── HealthKitManager.swift
│   │   └── MotionManager.swift
│   └── Services/
│       ├── NudgeTriggerService.swift
│       └── MetricsUploader.swift

apps/api/
├── src/
│   ├── routes/mobile/
│   │   ├── behavior.ts      # 新規
│   │   ├── feeling.ts       # 新規
│   │   └── nudge.ts         # 新規
│   └── modules/
│       ├── memory/
│       │   └── mem0Client.ts
│       ├── nudge/
│       │   ├── policy/
│       │   │   ├── linTS.ts
│       │   │   ├── wakeBandit.ts
│       │   │   └── mentalBandit.ts
│       │   ├── features/
│       │   │   └── stateBuilder.ts
│       │   └── reward/
│       │       └── rewardCalculator.ts
│       └── simulation/
│           └── futureScenario.ts
```

---

### 10. `migration-patch-v3.md` - 修正パッチ一覧 【Must】

**なぜ必要か**: 既存コードのどこをどう変えるかが分からないと、修正漏れが発生する。

**書くべき内容**:

| ファイル | 変更種別 | 概要 |
|---------|---------|------|
| `AppState.swift` | 修正 | ideals/struggles追加、onboardingStep更新 |
| `VoiceSessionController.swift` | 修正 | Session画面用にcontext取得追加 |
| `Info.plist` | 修正 | NSMotionUsageDescription等追加 |
| `MainTabView.swift` | 修正 | Talk/Behavior/Profile 3タブに変更 |
| `apps/api/src/routes/mobile/index.ts` | 修正 | /behavior, /feeling, /nudge追加 |
| ... | ... | ... |

---

## C. 既存ドキュメントで補足が必要な箇所

### `v3-stack.md` の補足

| 箇所 | 不足内容 | 追加すべき内容 |
|------|---------|--------------|
| API エンドポイント | 詳細なリクエスト/レスポンス形式 | JSONスキーマを明記 |
| mem0 操作 | 具体的なadd/search呼び出し | 例: `mem0.add({data: ..., user_id: ...})` |
| OpenAI Realtime tools | tool定義の具体例 | `get_context_snapshot` のスキーマ |

### `v3-ui.md` の補足

| 箇所 | 不足内容 | 追加すべき内容 |
|------|---------|--------------|
| Today's Highlights | API側の計算ロジック | バックエンドでどう計算するか |
| 10 Years From Now | 生成タイミング | 毎日更新 / オンデマンド |

---

## D. 完全なチェックリスト

### 新規作成（9ファイル）

- [ ] `prompts-v3.md` - LLMプロンプト集
- [ ] `quotes-v3.md` - Quote固定メッセージ30個
- [ ] `tech-bandit-v3.md` - Bandit実装仕様
- [ ] `tech-db-schema-v3.md` - DBスキーマ
- [ ] `tech-state-builder-v3.md` - State構築仕様
- [ ] `ios-sensors-spec-v3.md` - iOSセンサー仕様
- [ ] `tech-nudge-scheduling-v3.md` - Nudgeスケジューリング
- [ ] `tech-ema-v3.md` - EMA仕様
- [ ] `file-structure-v3.md` - ファイル構造ツリー
- [ ] `migration-patch-v3.md` - 修正パッチ一覧

### 既存更新（補足）

- [ ] `v3-stack.md` にAPIスキーマ詳細を追記
- [ ] `v3-ui.md` にバックエンド計算ロジックを追記

---

## E. 優先順位

| 優先度 | ドキュメント | 理由 |
|-------|-------------|------|
| 1 | `tech-db-schema-v3.md` | DBがないとAPI実装が始まらない |
| 2 | `file-structure-v3.md` | ファイル配置が決まらないとコードが書けない |
| 3 | `migration-patch-v3.md` | 既存コードへの変更を特定する |
| 4 | `prompts-v3.md` | LLM呼び出し部分の実装に必要 |
| 5 | `quotes-v3.md` | Talk画面のQuoteに必要（簡単） |
| 6 | `tech-state-builder-v3.md` | Nudge機能の実装に必要 |
| 7 | `tech-bandit-v3.md` | Nudge機能の実装に必要 |
| 8 | `ios-sensors-spec-v3.md` | iOS側センサー実装に必要 |
| 9 | `tech-nudge-scheduling-v3.md` | 複数Nudgeの制御に必要 |
| 10 | `tech-ema-v3.md` | Feelingセッション終了時に必要 |

---

これで **todolist.md を見れば何をやるべきかが完全に分かる** 状態になります。

次のステップとして、どのドキュメントから作成を始めますか？