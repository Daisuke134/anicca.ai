# Anicca iOS 実装仕様 v1.0（Codex向け・完全版）

最終更新日: 2025-10-31（Asia/Tokyo）
対象読者: 実装担当（Codex/エンジニアリング）、QA、デザイン、運用

---

## 1. 目的と範囲

1.1 目的
Anicca のiOS版を新規フォルダ `apps/ios` として実装し、低遅延の双方向音声対話・確実な起床介入・日中の短時間ナッジ・就寝前の内省・段階的フェードアウトを安定提供する。説得のための音声エージェントとして、ユーザーのセルフトークを内在化させ、「卒業」に至る体験を実現する。

1.2 スコープ（MVP）

1. 起床シーケンス（Critical Alert→前面化→リアルタイム会話）
2. 日中ナッジ（Time‑Sensitive通知→即会話）
3. オンボーディング（権限、起床セット、ボイス選択、呼び出し導線、試走）
4. ボイス運用（標準ボイス／クローンボイス、回線断オフラインTTS）
5. 決済（RevenueCat + StoreKit2）と認証（Passkey + Sign in with Apple）
6. データ保存（Core Data + CloudKitミラー）、音声暗号化（CryptoKit AES‑GCM）

1.3 非スコープ（本版で扱わないが将来想定）

1. 他OS（Android）
2. 電話SIP呼び出し
3. 複数ユーザー同時会話・グループルーム

---

## 2. 体験設計（ユーザー視点）

2.1 モーメント別ユースケース

1. 起床
   前夜に生成した起床音源がクリティカル通知で必ず鳴る。ロック画面で開くと即ライブ会話へ。指示は短く、実行合図の単語（例: OK）で進行が切り替わる。ベッド→洗面→呼吸→瞑想→一言宣言までを5〜7分で完了。

2. 日中の注意散漫ナッジ
   スマホ依存など特定アプリ滞在や連続視聴時間を検知したら、Time‑Sensitive通知で短い音声呼びかけ。タップで前面化、30〜60秒の介入（呼吸3回、目線移動、再開宣言）。

3. 誠実さのセルフトーク
   嘘を書きそうになった時、自分の声の短いフレーズがイヤホンで再生され行動修正を支援。アファメーションは前夜の内省から生成。

4. 就寝前の内省
   1分の振り返りを音声で収集し要約と感情タグを保存。翌朝の説法テーマに反映。

5. フェードアウト（卒業）
   連続自走が達成された習慣は介入頻度を自動減衰。呼び出しフレーズで必要時のみ再介入。

2.2 成功基準（KPI）

1. 起床成功率（Critical Alert鳴動→会話開始→ベッド離脱）80%以上
2. 日中ナッジ応答率（通知→会話→指示実行）60%以上
3. 習慣の自走日数連続3→5→7日達成率の漸増
4. クレーム率・電池消費の閾値内（1日あたり追加バッテリー消費3%以内目標）

2.3 プロンプト原則

1. 一文短く、動詞から始める。2) 行動→合図→次の行動の最短ループ。3) 比喩や宗教的語は穏当な範囲で使い分け。4) 逐次要約で次回の説法に学習を反映。

---

## 3. オンボーディング体験

3.1 ステップ一覧

1. ウェルカムと目標の言語化（音声）
2. 権限取得（マイク、通知、背景オーディオ）
3. 起床セット（時刻・合図語・前夜音源プリロード）
4. ボイス選択（標準 or クローン）
5. 呼び出し導線（SiriショートカットまたはVoice Controlの設定ガイド）
6. 試走（30秒の体験デモ）
7. 課金トライアル開始

3.2 画面ワイヤ（要旨）

1. WelcomeView: タイトル、音声入力ボタン、進むボタン
2. PermissionsView: 権限進行バー、動作確認ボタン
3. WakeSetupView: 時刻ピッカー、合図語テキスト、テスト再生
4. VoiceSelectView: 標準/クローンの選択、録音、プレビュー
5. InvokeGuideView: 設定手順の静止画と読み上げ案内
6. TrialPaywallView: 無料期間、購読開始

3.3 クローンボイス

1. 録音30〜60秒を暗号化して送信。返却された voice_id を保存。生音声は破棄。
2. 通常会話はストリーミングTTS、起床音源は前夜にファイル化しローカル再生。

3.4 同意とポリシー

1. 自分の声のみ許容。他者や著名人の模倣は禁止。
2. 削除要求は voice_id 無効化とローカル鍵破棄で即時対応。

---

## 4. アーキテクチャ

4.1 構成図（ASCII）

```
[Mic] -> AVAudioEngine(voiceChat+VPIO)
   | publish
   v
[iOS LiveKit SDK] <--- WebRTC ---> [LiveKit Agents] ---> [OpenAI Realtime]
   ^  audio downlink         |             | STT/TTS切替(Deepgram/ElevenLabs)
   |                         |             |
[Speaker] <------------------+-------------+
             iOS: 通知/課金/保存/暗号化
```

4.2 iOSクライアント

1. AVAudioSession: category=playAndRecord, mode=voiceChat, VoiceProcessingIO 有効
2. LiveKit: Room接続、LocalAudioTrack publish、再接続ハンドリング
3. 通知: Time‑Sensitive（既定）、Critical Alert（審査通過後）
4. 背景処理: BGTaskScheduler で前夜プリロード

4.3 サーバ（Agents）

1. LiveKit Agents: OpenAI Realtime と接続し音声入出力を統合
2. STT/TTSプラガブル: Deepgram/ElevenLabs を差し替え
3. 自社API: 認証、エフェメラルキー、利用制限、RAG素材提供

4.4 依存

1. iOS 17 以上、Xcode 16 以上、Swift 5.9 以上
2. SPM: livekit-client-ios、RevenueCat、AnyCodable（任意）

---

## 5. 技術選定

5.1 伝送
LiveKit Swift SDK を採用。利点は回復性、サーバ側のAgents統合、将来のSIP連携。

5.2 モデル
第一選択は OpenAI Realtime。必要に応じてSTT/TTSを外部に分離しプラガブル化。

5.3 TTS/STT

1. TTS: ElevenLabs ストリーミング、もしくは Realtime 音声出力
2. STT: Deepgram 低遅延ストリーミング
3. オフライン: AVSpeechSynthesizer

5.4 通知

1. Time‑Sensitive を標準運用
2. Critical Alert は審査通過後に起床に限定して使用

5.5 課金
RevenueCat SDK 5.x と StoreKit 2 による自動更新サブスクリプション。

---

## 6. iOS 詳細仕様

6.1 権限と Info.plist（抜粋）

1. NSMicrophoneUsageDescription=「音声ガイドのためマイクを使用します」
2. UIApplicationExitsOnSuspend=false
3. UIBackgroundModes=audio
4. Push/Notification 権限（Time‑Sensitive, Critical Alert 用の申請書類）

6.2 オーディオセッション設定（サンプル）

```swift
func configureAudioSession() throws {
    let s = AVAudioSession.sharedInstance()
    try s.setCategory(.playAndRecord, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
    try s.setMode(.voiceChat)
    try s.setPreferredSampleRate(48000)
    try s.setPreferredIOBufferDuration(0.005)
    try s.setActive(true, options: .notifyOthersOnDeactivation)
}
```

要点: voiceChat で AEC/NS/AGC を有効化。スピーカーへ強制、Bluetoothヘッドセット許可、I/O バッファ短縮。

6.3 LiveKit接続（擬似コード）

```swift
let room = Room()
try await room.connect(url, token: token)
let local = try await LocalAudioTrack.create()
try await room.localParticipant?.publish(track: local)
```

6.4 通知（起床用）

1. 前夜に `wake.caf` をアプリ内に保存
2. スケジュール時刻で Critical/Time‑Sensitive を発火
3. タップで前面化し即座にWebRTC接続

6.5 背景処理（BGTask）

1. タスクID `com.anicca.preload` を登録
2. 実行内容: 起床音源プリロード、キャッシュ整理、前回セッションの同期

6.6 オフラインフォールバック

1. 回線断時はローカル台本 + システム音声で最小限誘導
2. 復帰時に Agents にサマリ同期

6.7 データモデル（Core Data + CloudKit）

1. UserProfile(id, wakeTime, goals)
2. Routine(date, steps[name, planAt, doneAt])
3. Reflection(date, text, affectTag, topics)
4. VoiceProfile(provider, voiceId, createdAt)
5. Interaction(ts, direction, transcript, latencyMs)

6.8 暗号化と鍵管理

1. 音声ファイルは AES‑GCM で保存
2. 鍵は Keychain に格納、voiceId 削除時に鍵も廃棄

6.9 設定・Feature Flags

1. `Config/Environments.xcconfig` に API_URL、LIVEKIT_URL
2. `Config/Features.plist` に `UseCriticalAlert`, `UseRealtime`, `UseElevenLabs`

---

## 7. サーバAPI契約（モバイル視点）

7.1 認証
POST /auth/passkey-begin → challenge
POST /auth/passkey-complete → session

7.2 エフェメラルトークン
GET /rtc/ephemeral-token → { token, url, ttl }

7.3 音声関連
POST /voice/clone-begin → uploadUrl
POST /voice/clone-complete → { voiceId }
GET  /voice/presign-wake → { uploadUrl }

7.4 反省記録
POST /reflection → { text, affectTag, topics[] }

7.5 計測
POST /metrics → { event, ts, props{} }

---

## 8. フォルダ構造（リポジトリ）

8.1 iOS 側（新規）

```
apps/ios/
  Anicca.xcodeproj
  App/
    AniccaApp.swift
    SceneDelegate.swift
  Features/
    Onboarding/
      OnboardingView.swift
      OnboardingCoordinator.swift
    Voice/
      RealtimeSession.swift
      VoiceProfileManager.swift
    Schedule/
      WakeScheduler.swift
      CriticalAlertManager.swift
    Meditation/
      MeditationController.swift
    Reflection/
      ReflectionFlow.swift
    Sermon/
      DhammaRAGService.swift
    Auth/
      PasskeyClient.swift
    Billing/
      RevenueCatAdapter.swift
  Services/
    API/
      MobileAPIClient.swift
    Storage/
      CoreDataStack.swift
    Notifications/
      NotificationCenter.swift
      SoundAssets/wake.caf
  Resources/
    Prompts/
      onboarding_ios.json
      meditation.guided.json
      sermon_base.txt
  Config/
    Environments.xcconfig
    Features.plist
  Tests/
    Unit/
    UI/
  Scripts/
    generate_wake_audio.sh
```

8.2 Agents 側（参考。既存 monorepo 内の apps/api を想定）

1. apps/api/agents/ 直下に LiveKit Agents 構成
2. `.env` に Realtime/Deepgram/ElevenLabs のキー

8.3 アセット

1. `Resources/Prompts` に台本とテンプレート
2. `SoundAssets` に起床音・鐘音

---

## 9. ビルド＆デプロイ

9.1 対応
iOS 17 以上、iPhone 12 以降推奨

9.2 依存（SPM）

1. livekit-client-ios（固定タグ）
2. RevenueCat（固定タグ）

9.3 証明書とID

1. バンドルID `com.anicca.ios`
2. App Groups は不要（当面）

9.4 配信

1. Dev, Staging, Prod の3スキーム
2. TestFlight クローズドβ（30ユーザー）

---

## 10. テスト計画

10.1 ユニット

1. RealtimeSession の接続/再接続
2. VoiceProfileManager の切替ロジック

10.2 UI

1. 起床→会話→瞑想→終了の自動E2E（XCUITest）
2. 通知拒否/許可の分岐

10.3 音声遅延測定

1. マイク入力からTTS出力までの往復遅延をログ計測

10.4 回線劣化テスト

1. パケットロス5〜10%、遅延100ms での復旧確認

10.5 実機マトリクス

1. iPhone 12〜16、iOS 17/18

---

## 11. 観測性

11.1 ログ
OSLogで重要イベントを分類。PIIは含めない。

11.2 分析イベント

1. wake_triggered, wake_joined, wake_done
2. nudge_sent, nudge_joined, nudge_done
3. voice_mode_changed（standard/clone/offline）

11.3 クラッシュ
Sentry または Crashlytics のいずれか

---

## 12. リスクと対策

12.1 Critical Alert 審査
落ちても Time‑Sensitive で機能が成立するよう二重化。

12.2 背景録音の規制
常時録音は行わない。通知→前面化→会話開始を原則。

12.3 回線不良
LiveKit再接続とローカル台本フォールバックで継続。

12.4 電池消費
音声セッションのビットレート・サンプルレートを自動調整。

---

## 13. Definition of Done（機能別）

13.1 起床

1. 指定時刻±1分で通知発火
2. タップ→3秒以内に会話開始
3. ベッド離脱の自己申告までガイド完走

13.2 日中ナッジ

1. 通知から30秒以内に介入完了
2. 介入後のアプリ復帰先を元アプリに戻す

13.3 ボイス

1. 標準/クローン/オフラインをUIなしで即時切替
2. voiceId 削除で以後クローン不可

13.4 課金

1. 無料期間→有料切替
2. レシート検証とリトライ

---

## 14. 参考GitHubと資料（実装の雛形）

1. LiveKit Swift SDK（iOSクライアントの基本）
2. LiveKit Agents（サーバ側のエージェント基盤）
3. Agents Playground（統合検証）
4. OpenAI Realtime iOS サンプル（SwiftUI + WebRTC）
5. Swift Realtime OpenAI（Swiftラッパ）
6. Deepgram Streaming iOS（逐次文字起こし）
7. ElevenLabs iOS/Swift SDK（ストリーミングTTS）
8. RevenueCat iOS SDK（サブスク）
9. BGTaskScheduler のサンプル
10. Audio VoiceProcessingIO の参考実装

URLは実装段階で `Docs/links.md` に記載する。

---

## 15. 付録

15.1 起床台本テンプレート（抜粋）

```
{
  "steps": [
    {"say": "時は来た。足を床へ。できたらOK。", "expect": "OK", "timeoutSec": 60},
    {"say": "冷水で顔を洗おう。触れたら『澄む』と一回", "expect": "澄む", "timeoutSec": 120},
    {"say": "呼吸を3回。吸う時『今』、吐く時『戻る』", "expect": "完了", "timeoutSec": 90}
  ]
}
```

15.2 反省保存API例

```
POST /reflection
{ "text": "午後に集中切れ", "affectTag": "tired", "topics": ["集中","睡眠"] }
```

15.3 Environments.xcconfig（例）

```
API_URL = https://api.anicca.ai
LIVEKIT_URL = wss://rtc.anicca.ai
FEATURE_USE_CRITICAL_ALERT = NO
```

以上。これを起点に Codex は `apps/ios` を作成し、順にモジュールとテストを実装する。
