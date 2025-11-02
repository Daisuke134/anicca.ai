• 了解しました。以下が IOS‑003「LiveKit接続と自動再接続」で実装エージェントに実際に手を動かしてもらうための、
  行動レベルの指示書です。目的・期待体験・後続ステップとのつながりも明確に記します。

  ———

  ## 1. 目的と到達点

  - 目的：iOSクライアント（Anicca/Smart）が LiveKit を介してリアルタイム音声セッションへ参加できるようにする。
  - 到達点：アプリ起動後、エフェメラルトークンを取得 → LiveKit Room へ接続 → ローカルのマイク音声を publish →
    サーバ（LiveKit Agents）が返す音声を subscribe し再生できる。回線断時は LiveKit SDK の自動リトライで復帰
    する。
  - ユーザー体験：アプリを実機で立ち上げると、数秒以内にリアルタイム音声リンクが確立し、Aniccaの声が戻ってくる
    状態になる（まだ起床導線や通知は未実装だが、主経路の音声対話が準備完了）。

  ———

  ## 2. 実装手順（ファイル/行レベルの指示）

  ### Step 0: 現状確認とフォルダ準備

  - 現状の iOS プロジェクトは Audio／Permissions／UI（IOS‑002まで）が実装済み。LiveKit 連携用の `Services/API`,
    `Config`, `Features/Voice` は未作成なので、本タスクで新設して問題ない。
  - `Smart.xcodeproj` には LiveKit の SPM 依存が未登録。Step 1 で追加し、ターゲットへリンクする。
  - 認証は未実装のため、`Services/Identity/DeviceIdentityStore.swift` を新設し、Keychain などに保存したデバイス固有
    UUID を `userId` として提供する（後の本格ログイン実装時に差し替え可能な構造にしておく）。

  ### Step 0.5: API サーバ（apps/api）でトークン発行エンドポイントを新設

  - 目的: iOS から LiveKit アクセストークンを取得できるようにする。
  - 実装手順:
      1. 依存追加: `@livekit/livekit-server-sdk` を `apps/api` の依存に追加。
      2. ルート作成: `apps/api/src/routes/mobile/rtc.ts` を新設し、`GET /api/mobile/rtc/ephemeral-token` を定義。
         - クエリ/ヘッダ `deviceId` を必須パラメータとし、未指定の場合は 400 を返す。
      3. サービス層: `apps/api/src/services/livekitTokenService.ts` を作成し、環境変数
         `LIVEKIT_WS_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` を用いて AccessToken を生成。
         - トークン有効期限（例: 10 分）と LiveKit URL を JSON で返す: `{ token, url, ttl }`
      4. ルータ登録: `apps/api/src/server.ts`（もしくは既存のルート集約ファイル）で
         `app.use('/api/mobile', mobileRouter);` を追加。
      5. テスト: ローカルで `curl "http://localhost:3000/api/mobile/rtc/ephemeral-token?deviceId=sample"`
         を実行し、トークンが返却されることを確認。
  - 環境変数: Railway の Production/Staging 双方に
    `LIVEKIT_WS_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` を登録済みであることを確認する。

  ### Step 1: LiveKit SDK 依存の導入確認

  - Anicca/Smart/Smart.xcodeproj → Target「Smart」→ Package Dependencies に https://github.com/livekit/client-
    sdk-swift が未登録なら追加。
  - TARGET の Frameworks, Libraries, and Embedded Content に LiveKit を必ず追加しておく。

  ### Step 2: API クライアントにエフェメラルトークン取得を追加（軽量なデバイス識別子前提）

  - ファイル: Anicca/Smart/Smart/Services/API/MobileAPIClient.swift（無ければ Services/API ディレクトリを新設
    してファイルを作成）。
  - 追加する内容:
      1. struct LiveKitTokenResponse { let token: String; let url: URL; let ttl: TimeInterval } を定義。
      2. func fetchLiveKitToken(userId: String) async throws -> LiveKitTokenResponse を実装。userId には
         `DeviceIdentityStore.shared.userId` を利用。
          - HTTP メソッド: GET
          - エンドポイント: PROXY_BASE（既存 API 基準） + /rtc/ephemeral-token
          - 成功レスポンス: { "token": "...", "url": "wss://...", "ttl": 600 } を LiveKitTokenResponse へ
            パース。
          - エラー時は APIError.realtimeTokenFetchFailed（新規定義）を throw。
      3. 認証ヘッダは現段階では不要（サーバ側仕様に合わせる）。将来のログイン導入時に Bearer トークンを付与できるよう
         実装を抽象化しておく。

  - 補足: iOS クライアントの責務は LiveKit ルーム入室と音声の送受信のみ。OpenAI Realtime など下流サービスへ
    の接続・切り替えは LiveKit Agents 側で処理される前提とする。

  ### Step 3: LiveKit 接続のための設定値を定義

  - ファイル: Anicca/Smart/Smart/Config/AppConfig.swift（無ければ新規作成）。
  - 追加する内容:
      1. enum AppEndpoints に static let liveKitTokenPath = "/rtc/ephemeral-token" を追加。
      2. ConnectOptions のデフォルト値（例: reconnectAttempts=10, reconnectAttemptDelay=0.5,
         reconnectMaxDelay=6.0）を返す AppConfig.liveKitConnectOptions を用意する。

### Step 4: Realtime セッション管理クラスを作成

  - ディレクトリ: Anicca/Smart/Smart/Features/Voice/（無ければ作成）。
  - ファイル: RealtimeSession.swift を新規追加。
  - 実装要件:
      1. final class RealtimeSession: ObservableObject とし、内部に private let room = Room() を保持。
      2. 公開メソッド（いずれもメインアクター想定）
          - func connect(userId: String) async throws
              - MobileAPIClient.fetchLiveKitToken を呼び出し、レスポンスを受け取る。
              - try await room.connect(url: response.url.absoluteString,
                                       token: response.token,
                                       connectOptions: AppConfig.liveKitConnectOptions)。
              - 接続完了後に try await room.localParticipant.setMicrophone(enabled: true)。
              - room.delegates.add(delegate: self) を一度だけ実行してイベント監視を開始。
          - func disconnect()
              - await room.disconnect()。
          - func handleForegroundResume()
              - room.connectionState が .disconnected のときのみ connect を再試行。
      3. 内部状態:
          - @Published var isConnected: Bool
          - @Published var statusMessage: String
          - private var remoteRenderer: AudioPlayerRenderer?
      4. イベント処理:
          - RoomDelegate を実装し、roomDidConnect(_:) / roomIsReconnecting(_:) / roomDidReconnect(_:) /
            room(_:didUpdateConnectionState:from:) で statusMessage と isConnected を更新。
          - room(_:didDisconnectWithError:) で最終失敗を受けたときのみ、数秒待って connect を再試行（最大 n 回）。
      5. 下り音声の再生:
          - connect 完了時に AudioPlayerRenderer.start() を呼び、AudioManager.shared.add(remoteAudioRenderer: renderer)
            で混合音声を再生。
          - room(_:participant:didUnsubscribeTrack:) または disconnect 時に AudioManager から remove して stop。

  ### Step 5: AppAudioController と結合（既存 Audio 基盤との整合確認済み）

  - ファイル: Anicca/Smart/Smart/Audio/AppAudioController.swift
  - 追加・修正ポイント:
      1. private let realtimeSession = RealtimeSession(mobileClient: MobileAPIClient.shared,
         userResolver: DeviceIdentityStore.shared) を追加。
      2. prepare() の成功後（権限許可→VoiceEngine起動が成功したタイミング）で Task {
         try await realtimeSession.connect(userId: DeviceIdentityStore.shared.userId)
         } を実行。
      3. handleScenePhase(.active/.inactive/.background) で、.active 時のみ realtimeSession.handleForegroundResume()
         を呼び、.inactive/.background では realtimeSession.disconnect() を呼ぶ（AudioSessionConfigurator と競合しない）。
      4. UI へ表示している status を RealtimeSession.statusMessage と同期（Combine の .sink で反映）。

  ### Step 6: UI 表示の更新

  - ContentView.swift に @EnvironmentObject を通じて AppAudioController を既に注入しているので、状態表示を
    変更。
      1. audioController.status の文言に加えて、realtimeSession の接続状態に応じたサブメッセージ（例: 接続完
         了, 再接続中, 切断）を出す。
      2. まだハードな UI にはしないが、接続失敗時は赤文字で警告を出すなど最低限の視覚フィードバックを入れる。

  ### Step 7: ログとエラーハンドリング（既存 Audio ログに追加）

  - OSLog カテゴリ RTC を新設。RealtimeSession の connect/disconnect/reconnect コールバックとエラーをすべて記
    録する。
  - MobileAPIClient.fetchLiveKitToken の失敗時、AppAudioController.status を "LiveKitトークン取得失敗: エラー内
    容" に更新。
  - DeviceIdentityStore が userId を返せなかった場合（初期化失敗など）は LiveKit 接続を試行せず、「デバイス識別子の
    取得に失敗しました」と表示する。
  - room(_:didDisconnectWithError:) を受けて定義済み回数リトライしても復帰しなかった場合のみ、「接続できません
    でした。ネットワーク状態を確認してください。」を表示する。

  ### Step 8（次フェーズ）: ログイン導入の指針

  - 目的: デバイス UUID に依存しない正式な認証を追加し、課金・同期機能と整合を取る。
  - 実装方針:
      1. フォルダ新設
         - `Features/Auth/` … ログイン UI（SwiftUI）
         - `Services/Auth/` … 認証サービス（Passkey / Sign in with Apple）
         - `Services/Identity/UserSessionStore.swift` … `userId` と `sessionToken` を管理
      2. 認証 API コール
         - `PasskeyAuthService` … `POST /auth/passkey-begin` → challenge 受領 → `POST /auth/passkey-complete`
         - `AppleSignInService` … `POST /auth/apple-signin` でサーバ検証
         - 共通の HTTP 基盤（MobileAPIClient）を利用して再試行・ログ処理を統一
      3. セッション保存
         - 成功時に `UserSessionStore` が Keychain に `sessionToken` と `userId` を保存
         - `DeviceIdentityStore` はフォールバック用途に限定し、通常は `UserSessionStore` を優先
      4. UI フロー
         - アプリ起動時に `UserSessionStore.isLoggedIn` で判定し、未ログインなら `LoginView` を表示
         - ログイン完了後に `AppAudioController.prepare()` → `RealtimeSession.connect(userId:sessionToken:)` を実行
         - ログアウト操作は `UserSessionStore.clear()` → ログイン画面へ戻す
      5. API 更新
         - `/api/mobile/rtc/ephemeral-token` で Bearer 認証を必須化し、`Authorization: Bearer {sessionToken}` を検証
         - デバイス UUID モードとの互換維持が必要な場合は環境変数で挙動を切り替えられるようにする
  - 受け入れ基準: ログイン完了後のみ LiveKit 接続が許可され、セッション期限切れ時は自動的にログイン画面へ戻る。

  ———

  ## 3. 期待されるユーザー体験

  - アプリを実機で開くと、デバイス識別子の初期化 → マイク権限許可 → 音声エンジン稼働中 → ライブ接続完了 の流れ
    がステータス表示で確認できる（将来のログイン導入後は「ログイン完了 → …」へ置き換える）。
  - 起動後数秒以内に LiveKit 上で音声セッションが確立し、サーバ（LiveKit Agents経由の Realtime API）が生成する
    音声が即座に再生される準備が整う。
  - 回線が切れても 30 秒以内に再接続が完了し、ユーザーが手動操作をせずとも再び音声対話に戻れる。

  ———

  ## 4. 後続ステップとの接続

  - IOS‑004 通知基盤：通知タップ時に RealtimeSession.connect() を呼び出し、即座に会話へ遷移できる導線を整備
    する。
  - IOS‑006 音声パイプライン：この LiveKit 経路を土台に OpenAI Realtime（Phase1）や Deepgram／
    ElevenLabs（Phase2）へ音声パイプラインを拡張する。RealtimeSession が確立した今、下流の TTS/STT 切り替えを
    容易に挿入できる。
  - IOS‑007 オンボーディング：権限取得や初期セットアップの音声ガイダンスをリアルタイム会話で行えるようになる。
  - E2E テスト：RealtimeSession の安定接続を前提に、起床→会話→瞑想→終了といった完全フローを自動テスト化で
    きる。

  以上です。実装エージェントは上記の順番でファイル編集・クラス追加を進めれば、妄想ではなく実行可能な形で
  IOS‑003 を完了できます。
