ここからは「どう実装するか」の技術仕様だけに振り切るね。
DB 設計は一旦忘れて、スタックとサービス構成・データフローに集中する。

---

## 1. 全体アーキテクチャ概要

レイヤー構成はこう決める。

1. クライアント

   1. iOS アプリ（SwiftUI）
      OpenAI Realtime API（WebRTC）で音声エージェントと接続
      Realtime の tool 呼び出しを受けて、自前バックエンドに HTTP で投げる

2. バックエンドサービス（Python）

   1. Gateway / Tools API（FastAPI）
      iOS からの HTTP を受ける窓口。Realtime の tool を全部ここにマッピング
   2. Memory Service（mem0）([GitHub][1])
      対話・理想・ストラグル・行動要約など「その人の意味記憶」を保持
   3. Semantic Search Service（Moss）([GitHub][2])
      mem0 のメモリや日次サマリをリアルタイムに検索して、LLM に渡すコンテキストを返す
   4. Nudge Policy Service（contextual bandits）([GitHub][3])
      状態ベクトルから「どの Nudge テンプレートを使うか」を選択
   5. Simulation Service（OpenAI Chat / Realtime）([OpenAI Platform][4])
      今日残り・明日・1/5/10 年後のシミュレーションテキストを生成
   6. Observability / Eval Service（Langfuse + TruLens）([Langfuse][5])
      LLM 呼び出し・tool 呼び出し・Nudge 成功率をトレース＆評価

3. テスト・開発用ツール

   1. Maestro（iOS UI E2E テスト）([GitHub][6])
   2. Mobile MCP（mobile-next/mobile-mcp）で「AI から iOS を操作する自動テスト」([GitHub][7])

以降は、この構成に沿って具体的な実装の仕方を書く。

---

## 2. クライアント（iOS）実装

### 2.1 音声エージェント（Talk タブ）

使用技術

1. Swift 5.10
2. SwiftUI で UI
3. AVAudioEngine + WebRTC クライアント
4. OpenAI Realtime API（WebRTC 接続）([OpenAI Platform][4])

フロー

1. セッション開始

   1. アプリ起動時、ユーザーの `user_id` や OS 情報を含むメタデータを生成
   2. OpenAI Realtime API に WebRTC で接続
   3. Realtime の system prompt に「Anicca として話すこと」「使用する tools の JSON schema」を定義して送信

2. 音声送受信

   1. マイク入力を AVAudioEngine で取得し、Opus などにエンコードして Realtime にストリーム
   2. Realtime からの `response.audio.delta` を受けて再生
   3. Realtime からの `response.output_text.delta` も UI で字幕表示

3. tool 呼び出し

   1. Realtime の出力で `tool_call` が来たら、iOS 側でパース
   2. `tool_name` と `arguments` を Gateway API に HTTP POST
   3. Gateway からの JSON レスポンスをそのまま Realtime に `tool_result` として送り返す
   4. LLM がそれを使って次の発話を生成

iOS 側では

1. `ToolInvocation` プロトコルを切って、
   `get_context_snapshot`, `choose_nudge`, `log_nudge`, `get_behavior_summary` などを一元管理
2. すべて URLSession で `https://api.anicca.app/tools/<tool_name>` に POST 頭出し
3. エラー時は Realtime に「一時的なエラーなので別の話題に切り替える」と返すようにする

### 2.2 Behavior/Profile タブ

Talk とは独立して、REST API 経由でバックエンドを叩く。

1. `GET /behavior/summary/today`
   今日の睡眠・歩数・スクリーンタイム・今日の一言サマリ

2. `GET /behavior/trends`
   起床/就寝・SNS 時間・歩数の 7 日/30 日トレンド

3. `GET /behavior/future`
   明日のタイムライン、1・5・10 年後のシナリオ

4. `POST /behavior/profile/edit`
   Big Five / 理想の姿 / Struggle 修正を送信

UI 側はこの API のレスポンスだけをレンダリングする。
中身のロジックはすべて Python 側。

---

## 3. Gateway / Tools API（FastAPI）

言語・フレームワーク

1. Python 3.11
2. FastAPI + Uvicorn
3. Poetry で依存管理
4. Docker コンテナ化

エンドポイント構成（Realtime tool 呼び出しに対応）

1. `POST /tools/get_context_snapshot`
   入力
   ・user_id
   ・現在時刻・OS 情報（あれば）
   処理
   ・Memory Service, Moss, Metrics Service に問い合わせて「今この人に関係するコンテキスト」を JSON で返す

2. `POST /tools/choose_nudge`
   入力
   ・user_id
   ・target_behavior（sleep / sns / exercise / mindfulness / honesty）
   ・context_snapshot
   処理
   ・Nudge Policy Service に渡して、`template_id`, `tone`, `channel`, `priority` を返す

3. `POST /tools/log_nudge`
   入力
   ・user_id
   ・nudge_action
   ・context_snapshot
   処理
   ・ロギング（DB 側）は別サービスに投げるだけ
   ・返り値は ack

4. `POST /tools/get_behavior_summary`
   入力
   ・user_id
   処理
   ・Simulation Service + Metrics から Behavior タブ用の JSON を返す

5. `POST /tools/get_future_projection`
   入力
   ・user_id
   ・horizon（"tomorrow" / "1y" / "5y" / "10y"）
   処理
   ・Simulation Service で生成したテキスト・タイムラインを返す

FastAPI 側では `@router.post("/tools/get_context_snapshot")` のように実装し、
それぞれ専用の service クラスに依存注入する。

Langfuse には FastAPI の middleware でトレースを送信する。([Langfuse][5])

---

## 4. Memory Service（mem0）と Moss の実装

### 4.1 mem0 のセットアップ ([GitHub][1])

1. mem0 サーバのデプロイ

   1. GitHub の `mem0ai/mem0` を Docker で起動
   2. バックエンドから HTTP/REST か Python SDK でアクセス

2. Python サイドのクライアント

   1. `pip install mem0`
   2. FastAPI アプリで `Mem0Client` をシングルトンとして DI

3. メモリのカテゴリ設計

   1. `"profile"`
      理想の姿・Struggle・Big Five・価値観
   2. `"behavior_summary"`
      日次・週次の行動要約（睡眠・歩数・SNS 時間など）
   3. `"interaction"`
      重要な会話・ユーザーの発言・Nudge への主観コメント
   4. `"nudge_meta"`
      どの Nudge が効きやすいか、傾向のメモ

4. API 的な関数

   1. `save_profile_memory(user_id, payload)`
      mem0 に `"profile"` タイプとして upsert

   2. `save_daily_behavior_summary(user_id, summary_text, stats)`
      `"behavior_summary"` に保存

   3. `save_interaction_memory(user_id, transcript_snippet)`

   4. `search_memories(user_id, query, types)`
      Realtime からの tool `get_context_snapshot` 内で使用

### 4.2 Moss のセットアップ ([GitHub][2])

Moss = 「リアルタイム semantic search エンジン」。

1. Moss runtime の起動

   1. `usemoss` の GitHub から runtime コンテナを取得
   2. `MOSS_API_KEY` を設定して起動
   3. FastAPI から HTTP で `POST /index`, `POST /query` を叩けるようにする

2. インデックス設計

   1. インデックス名 `"user_memories"`
   2. ドキュメントとして
      ・mem0 の profile / behavior_summary / interaction
      ・日次集約の行動ログテキスト
      を push

3. 更新

   1. 日次バッチで「今日の要約」を生成して Moss に index
   2. 会話で重要な発言があれば随時 index

4. クエリ関数

   `search_relevant_context(user_id, query)`

   処理フロー

   1. mem0 から user_id に紐づく最近のメモリ ID を取得
   2. その ID を key にしたテキストを Moss に投入済みなので
      `query = f"user:{user_id} {query}"` のような形で検索
   3. 上位 k 件を Realtime に返すコンテキストに含める

5. Realtime での使い方

   例えば `get_context_snapshot` の tool を叩いたときに

   1. Query 例
      起床 Nudge 時
      `"最近の睡眠に関する出来事とユーザーが話した後悔"`
   2. `search_relevant_context` で
      直近の「夜更かし後悔」「睡眠についての会話」を拾う
   3. そのテキストをまとめて
      Realtime の `tool_result` として返す

こうすると、LLM は
「今の数値データ」＋「過去のストーリー」
両方を見ながら音声・通知の文言を組み立てられる。

---

## 5. Nudge Policy Service（コンテキスト付きバンディット）

使用技術

1. Python
2. `contextualbandits` ライブラリ([GitHub][3])

目的
状態ベクトルから、
どの Nudge テンプレート（template_id）を選ぶかを決める。

### 5.1 モデル設計

1. アクション空間
   例：
   template_id
   1: gentle_sleep_reminder
   2: firm_sleep_warning
   3: mindful_break_from_sns
   4: exercise_short_prompt
   5: self_compassion_message
   など 5〜10 個

2. コンテキスト特徴量
   `x = concat(momentary_state, long_term_features, personality_features)`
   具体例
   ・時刻（sin/cos）
   ・連続 SNS 時間
   ・睡眠負債
   ・歩数
   ・Big Five スコア
   ・理想の姿タグ one-hot

3. 報酬
   `r = 1`  : Nudge 後 30〜60 分で望ましい行動変化が起きた
   `r = 0`  : 変化なし
   （細かくしたければ -1 もありだが、v0.3 は 0/1 で十分）

### 5.2 実装フロー

1. 学習器の初期化
   `from contextualbandits.online import LinearBandit` などを使い、
   `model = LinearBandit(nchoices=N_TEMPLATES, method="linucb")` のように初期化。([Contextual Bandits][8])

2. 推論（choose_nudge 内）

   1. Gateway から `user_id` と `context_snapshot` を受け取る
   2. 上の特徴量ベクトル `x` を作る
   3. `chosen = model.predict_one(x)` でテンプレ ID を取得
   4. 結果を `{"template_id": chosen, "tone": ..., "channel": ...}` として返す

3. 学習（オフラインバッチ）

   1. 1 日の nudge イベントから `(x, a, r)` を抽出
   2. `model.partial_fit(X, a, r)` で更新
   3. 学習済みモデルをファイル保存し、次回ロード

v0.3 では

1. まずルールベースで `template_id` を決める期間を設けてログ収集
2. 一定のデータが溜まったら bandit 学習を有効化
3. bandit が学習に失敗した場合でも「致命的な Nudge」が発火しないように、
   ・一日あたり最大 N 件
   ・同じテンプレ連打禁止
   などのガードを Gateway 層でかける

---

## 6. Simulation Service（未来予測とストーリー）

使用技術

1. OpenAI Chat / Realtime HTTP モデル（gpt-5.1 系）
2. Python で prompt テンプレを管理

### 6.1 明日・今日残りのシミュレーション

1. 入力
   ・Trait Profile（理想・ストラグル）
   ・Long-term Rhythms（平均睡眠・SNS・歩数）
   ・今日の実績（朝〜今まで）

2. 手順

   1. 数値ベースの簡易予測
      起床時刻、就寝見込み、SNS 時間帯などを rule ベースで近似
   2. LLM に以下を渡す
      ・ユーザープロフィール
      ・行動統計
      ・今日ここまでのログ
      ・簡易予測
      と、「明日の 24 時間のタイムラインを JSON で返して」と指示

3. 出力
   例）
   ・時間ブロックごとのカテゴリ（sleep / work / sns / exercise / commute / rest）
   ・一言コメント

4. Behavior タブでは、この JSON をチャート化するだけ。

### 6.2 1・5・10 年後のシナリオ

1. 入力
   ・今の行動パターン（Long-term Rhythms）
   ・理想の姿
   ・Nudge による改善余地（簡易スコア）

2. LLM プロンプト
   ・「このまま今の行動が続いたと仮定した場合の 1/5/10 年後の典型的な 1 日と心の状態を、3〜5 行で書いてください」
   ・「もし睡眠・運動・スマホがこれだけ改善した場合の 1/5/10 年後も同様に書いてください」

3. 出力
   ・`current_traj_1y`, `improved_traj_1y`
   ・`current_traj_5y` … のようなテキスト

---

## 7. Observability / Eval（Langfuse + TruLens）

### 7.1 Langfuse の役割 ([Langfuse][5])

1. FastAPI と Python LLM 呼び出しに Langfuse SDK を仕込む
   `from langfuse import observe` デコレータで
   各 tool ハンドラと LLM 呼び出しをトレース

2. 追跡するもの
   ・Requst/Response のペイロード
   ・使用モデル
   ・tool 呼び出し（get_context / choose_nudge など）
   ・エラー
   ・レスポンスタイム

3. Langfuse UI で
   ・「今日どの Nudge が多く出たか」
   ・「どのパスでエラーが起きているか」
   を可視化し、プロンプト改善やバグ修正に使う。

### 7.2 TruLens の役割 ([GitHub][9])

1. Nudge テキストとシミュレーションテキストに対して、
   LLM を使った評価指標を計算。

2. 例えば Nudge については
   ・Kindness（優しさ）
   ・Clarity（行動の明確さ）
   ・Non-coerciveness（強制しすぎていないか）
   のスコアを定義。

3. 毎晩バッチで
   ・その日出した Nudge のサンプルを TruLens に通してスコア計算
   ・Langfuse トレースと紐付けて保存

4. スコアの低いパターンのプロンプト・テンプレを
   「改善候補」としてピックアップし、
   LLM に新しい文言案を作らせるなどのループに使う。

---

## 8. テスト・開発支援（Maestro / Mobile MCP）

### 8.1 Maestro（E2E UI テスト）([GitHub][6])

用途
オンボーディング、Habits 編集、Talk/Behavior 画面遷移など
「静的に決まっている UI フロー」の自動テスト。

実装

1. `maestro.yaml` フローを作成
   例：`onboarding.yaml`, `habit_create.yaml`, `behavior_view.yaml` など

2. GitHub Actions などの CI で
   iOS シミュレータ起動 → Maestro フロー実行 → スクリーンショット保存

3. リグレッション検知に使う。

### 8.2 Mobile MCP（AI からアプリを操作）([GitHub][7])

用途
Anicca のデジタルツインに
「実際の iOS アプリ」を触らせる自己テストやデモ用。

1. `mobile-next/mobile-mcp` をサーバとして起動
   ・シミュレータ接続
   ・MCP プロトコルで画面のアクセシビリティツリーを取得・操作

2. 開発用の LLM エージェントに
   ・MCP サーバをツールとして渡す
   ・「Anicca を起動して Behavior タブを開いて、今日のサマリを読む」
   などのタスクを実行させる

3. 将来的には、
   Nudge パイプラインの変更後に「AI が自分でアプリを回す E2E テスト」の自動実行もできる。

---

## 9. まとめ（v0.3 の技術スタック決定）

最終的に、Anicca v0.3 Persuasion Agent の技術スタックはこうなる。

1. クライアント

   1. iOS: SwiftUI + AVAudioEngine + WebRTC
   2. OpenAI Realtime API（WebRTC / tools）

2. バックエンド（全て Python）

   1. FastAPI + Uvicorn（Gateway / Tools API）
   2. mem0（Memory Service）([GitHub][1])
   3. Moss runtime（Semantic Search）([GitHub][2])
   4. contextualbandits（Nudge Policy）([GitHub][3])
   5. OpenAI Chat / Realtime HTTP モデル（シミュレーション）

3. 観測・評価

   1. Langfuse（トレース・メトリクス・プロンプト管理）([Langfuse][5])
   2. TruLens（Nudge とシミュレーションの品質評価）([GitHub][9])

4. テスト

   1. Maestro（UI/E2E テスト）([GitHub][6])
   2. Mobile MCP（エージェントからのモバイル操作）([GitHub][7])

これを前提にすれば、
あとは

・FastAPI のエンドポイント仕様
・Realtime tool 定義（JSON Schema）
・Python の service クラス設計

を順番に決めていくだけで、そのまま実装フェーズに入れるはず。

[1]: https://github.com/mem0ai/mem0?utm_source=chatgpt.com "mem0ai/mem0: Universal memory layer for AI Agents"
[2]: https://github.com/usemoss?utm_source=chatgpt.com "Moss"
[3]: https://github.com/david-cortes/contextualbandits?utm_source=chatgpt.com "Python implementations of contextual bandits algorithms"
[4]: https://platform.openai.com/docs/guides/realtime?utm_source=chatgpt.com "Realtime API"
[5]: https://langfuse.com/docs/observability/overview?utm_source=chatgpt.com "LLM Observability & Application Tracing (open source)"
[6]: https://github.com/mobile-dev-inc/Maestro?utm_source=chatgpt.com "mobile-dev-inc/Maestro: Painless E2E Automation for ..."
[7]: https://github.com/mobile-next/mobile-mcp?utm_source=chatgpt.com "mobile-next/mobile-mcp: Model Context Protocol Server for ..."
[8]: https://contextual-bandits.readthedocs.io/?utm_source=chatgpt.com "Contextual Bandits — Contextual Bandits documentation"
[9]: https://github.com/truera/trulens?utm_source=chatgpt.com "truera/trulens: Evaluation and Tracking for LLM ..."


AlarmKit のスヌーズと複数アラームの競合、既存設定の流用、トグルの配置について確認中です。


[3 tools called]


## 1. スヌーズと複数アラームの競合について

### 問題の整理
- 7:00 のアラームをスヌーズ（例: 9分後 = 7:09 に再発火）
- 7:01、7:02、7:03、7:04 にもアラームを設定
- 7:09 のスヌーズ再発火と 7:01〜7:04 のアラームが重なる可能性

### AlarmKit の挙動
- 各アラームは独立して動作し、同時刻に複数発火してもエラーにはなりません
- ただし、複数のアラーム UI が同時に表示されると UX が悪化します

### 推奨対応
- スヌーズを使わず、異なる ID で複数のアラームを設定する方法を推奨
- スヌーズを使う場合は、スヌーズ再発火時刻と次のアラーム時刻が重ならないように調整

### 実装方針（疑似パッチ）

```swift
@available(iOS 26.0, *)
private func scheduleWakeWithAlarmKit(hour: Int, minute: Int) async {
    do {
        let alarmManager = AlarmManager.shared
        let authState = try await alarmManager.requestAuthorization()
        guard authState == .authorized else {
            await scheduleMain(habit: .wake, hour: hour, minute: minute)
            return
        }
        
        // ★ 既存のフォローアップ回数設定を流用
        let followupCount = AppState.shared.followupCount(for: .wake)  // 1-10回
        
        // ★ スヌーズは使わず、1分間隔で複数アラームを設定
        // これにより、スヌーズと次のアラームの競合を完全に回避
        for i in 0..<followupCount {
            let alarmId = UUID()
            
            var fireHour = hour
            var fireMinute = minute + i  // 0分、1分、2分...
            
            if fireMinute >= 60 {
                fireHour += fireMinute / 60
                fireMinute = fireMinute % 60
            }
            
            let time = Alarm.Schedule.Relative.Time(hour: fireHour, minute: fireMinute)
            let schedule = Alarm.Schedule.relative(.init(
                time: time,
                repeats: .weekly([.monday, .tuesday, .wednesday, .thursday, .friday, .saturday, .sunday])
            ))
            
            // ★ countdownDuration は nil（スヌーズ機能なし）
            // これにより、各アラームは独立して動作し、競合しない
            let alertContent = AlarmPresentation.Alert(
                title: localizedString("habit_title_wake"),
                stopButton: .stopButton,
                secondaryButton: .openAppButton,
                secondaryButtonBehavior: .custom
            )
            let presentation = AlarmPresentation(alert: alertContent)
            
            struct WakeMetadata: AlarmMetadata {}
            let attributes = AlarmAttributes(
                presentation: presentation,
                metadata: WakeMetadata(),
                tintColor: .blue
            )
            
            let configuration = AlarmManager.AlarmConfiguration(
                countdownDuration: nil,  // ★ スヌーズなし = 競合回避
                schedule: schedule,
                attributes: attributes,
                stopIntent: StopIntent(alarmID: alarmId.uuidString),
                secondaryIntent: OpenAppIntent()
            )
            
            _ = try await alarmManager.schedule(id: alarmId, configuration: configuration)
            logger.info("Wake alarm \(i+1)/\(followupCount) scheduled at \(fireHour):\(fireMinute)")
        }
        
    } catch {
        logger.error("Failed to schedule AlarmKit wake: \(error.localizedDescription, privacy: .public)")
        await scheduleMain(habit: .wake, hour: hour, minute: minute)
    }
}
```

この方法なら、スヌーズと次のアラームの競合は発生しません。

## 2. 既存の「再通知回数（1-10回）」設定の流用について

流用できます。`AppState.followupCount(for: .wake)` が既に 1-10 の範囲で管理されているため、そのまま使えます。

```155:158:/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/AppState.swift
    func followupCount(for habit: HabitType) -> Int {
        if let n = habitFollowupCounts[habit] { return bounded(n) }
        return defaultFollowupCount(for: habit)
    }
```

```176:181:/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/AppState.swift
    private func defaultFollowupCount(for habit: HabitType) -> Int {
        switch habit {
        case .wake, .bedtime: return 5
        default: return 2
        }
    }
```

- ユーザーが「5回」に設定 → AlarmKit で 7:00、7:01、7:02、7:03、7:04 の 5 つのアラームを設定
- ユーザーが「10回」に設定 → 7:00〜7:09 の 10 つのアラームを設定

既存の設定画面で変更すれば、AlarmKit 側にも反映されます。

## 3. AlarmKit トグルと Sticky トグルの違いと配置

### 違い
- AlarmKit トグル: iOS 26+ でシステムアラーム UI を使うか（デフォルト ON）
- Sticky トグル: Wake セッションで 5 回返答まで声かけを続けるか（デフォルト ON）

### 配置（SettingsView の疑似パッチ）

```swift
// SettingsView.swift の Personalization Card の後に追加

// --------------------------
// Alarm Settings Section
// --------------------------
CardView {
    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
        Text(String(localized: "settings_alarm_title")) // 「アラーム設定」
            .font(AppTheme.Typography.headlineDynamic)
            .foregroundStyle(AppTheme.Colors.label)
            .padding(.bottom, AppTheme.Spacing.xs)

        // ★ AlarmKit トグル（iOS 26+ のみ表示）
        if #available(iOS 26.0, *) {
            Toggle(
                String(localized: "settings_alarm_use_alarmkit"), // 「起床に AlarmKit を使う (iOS 26 以降)」
                isOn: Binding(
                    get: { appState.userProfile.useAlarmKitForWake },
                    set: { newValue in
                        var profile = appState.userProfile
                        profile.useAlarmKitForWake = newValue
                        appState.updateUserProfile(profile, sync: true)
                    }
                )
            )
            .tint(AppTheme.Colors.accent)
        }

        // ★ Sticky モードトグル（AlarmKit とは別物）
        Toggle(
            String(localized: "settings_wake_sticky_title"), // 「Wake スティッキーモード（5 回返答まで）」
            isOn: Binding(
                get: { appState.userProfile.wakeStickyModeEnabled },
                set: { newValue in
                    var profile = appState.userProfile
                    profile.wakeStickyModeEnabled = newValue
                    appState.updateUserProfile(profile, sync: true)
                }
            )
        )
        .tint(AppTheme.Colors.accent)
    }
}
```

### デフォルト値の確認
- AlarmKit: `useAlarmKitForWake: Bool = true`（デフォルト ON）
- Sticky: `wakeStickyModeEnabled: Bool = true`（デフォルト ON）

両方ともデフォルト ON で問題ありません。

## まとめ

1. スヌーズと複数アラームの競合: `countdownDuration: nil` にしてスヌーズを使わず、異なる ID で複数アラームを設定すれば競合しません
2. 既存設定の流用: `AppState.followupCount(for: .wake)` をそのまま使えます（1-10 回）
3. トグルの配置: Settings の「アラーム設定」セクションに両方のトグルを配置。AlarmKit は iOS 26+ のみ表示。両方ともデフォルト ON

これで、スヌーズによる競合を避けつつ、既存設定を流用して実装できます。