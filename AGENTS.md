# Anicca iOS 開発ガイド - エージェント向け

このドキュメントは、iOSアプリ開発を行うエージェント（AIアシスタント含む）が、プロジェクト全体を理解し、新機能を追加・実装する際に参照するための包括的なガイドです。

---

## 最重要ルール（必ず最初に読むこと）

### 1. 意思決定ルール

**「どちらがいいですか？」と聞くな。自分で決めろ。**

エージェントは以下の手順で意思決定を行うこと：

1. **ベストプラクティスを調査する** - Web検索、ドキュメント、既存の成功事例を調べる
2. **自分で決定する** - 調査結果に基づいて、最適な選択肢を一つ選ぶ
3. **理由を説明する** - なぜその決定をしたのか、根拠を明確に述べる

**禁止事項:**
- 「AとBどちらがいいですか？」のような質問をユーザーに投げかける
- 複数の選択肢を提示して「選んでください」と言う
- 判断を先延ばしにする

### 2. メモリ使用ルール

**重要な情報は言われなくても自発的にメモリに保存すること。**

- 価格、設定、ユーザーの好みなど繰り返し使う情報は即座に保存
- Cursorの`update_memory`ツールを使用
- 過去の会話で学んだ内容を忘れずに記録

### 3. Anicca基本情報

- **サブスクリプション価格**: 月額$9.99、年額$49.99（デフォルト）
- **TikTok SKAN設定**: CV1=Launch App、CV2=月額$9-10、CV3=年額$49-50

---

## 目次

1. [プロジェクト概要](#プロジェクト概要)
2. [アーキテクチャ全体像](#アーキテクチャ全体像)
3. [iOSアプリの主要コンポーネント](#iosアプリの主要コンポーネント)
4. [バックエンドAPIの主要エンドポイント](#バックエンドapiの主要エンドポイント)
5. [認証・課金・セッション管理の仕組み](#認証課金セッション管理の仕組み)
6. [開発時の重要な注意点](#開発時の重要な注意点)
7. [主要ファイルの役割](#主要ファイルの役割)

---

## プロジェクト概要

### Aniccaとは

Aniccaは、音声対話を通じてユーザーの生活リズムと習慣を整え、最終的に自律状態へ導くiOSアプリです。主な機能：

- **音声セッション**: OpenAI Realtime APIを使用したWebRTCベースのリアルタイム音声対話
- **習慣リマインダー**: 起床・トレーニング・就寝などの習慣をスケジュールし、通知でリマインド
- **サブスクリプション**: RevenueCatを使用した月額/年額プランの管理
- **利用量管理**: Virtual Currency（分単位）による利用量の計測と課金

### プロジェクト構造

```
anicca-project/
├── aniccaios/              # iOSアプリ（SwiftUI + WebRTC）
│   └── aniccaios/
│       ├── AppState.swift              # アプリ全体の状態管理
│       ├── VoiceSessionController.swift # 音声セッション制御
│       ├── Services/                    # 各種サービス
│       ├── Onboarding/                 # オンボーディングフロー
│       └── ...
├── apps/api/              # バックエンドAPI（Express.js）
│   └── src/
│       ├── routes/mobile/              # iOS向けAPIエンドポイント
│       ├── services/                   # ビジネスロジック
│       └── ...
└── docs/                 # 設計ドキュメント
```

### 技術スタック

**iOSアプリ:**
- SwiftUI（UIフレームワーク）
- WebRTC（音声通信）
- RevenueCat SDK（サブスクリプション管理）
- UserDefaults（ローカルストレージ）

**バックエンドAPI:**
- Express.js（Node.js）
- PostgreSQL（Railway）
- RevenueCat API（サブスクリプション管理）
- OpenAI Realtime API（音声対話）

---

## アーキテクチャ全体像

### データフロー

```
iOSアプリ
  ↓ (HTTP/HTTPS)
バックエンドAPI (Railway)
  ↓
外部サービス (RevenueCat, OpenAI)
```

### 主要なフロー

#### 1. 認証フロー
```
ユーザー → Sign in with Apple → iOSアプリ
  → バックエンド検証 (/api/auth/apple)
  → UserCredentials保存 → AppState更新
```

#### 2. 音声セッション開始フロー
```
ユーザー操作 → VoiceSessionController.start()
  → バックエンドにclient_secret要求 (/api/mobile/realtime/session)
  → 利用量チェック → セッションID発行
  → WebRTC接続確立 → OpenAI Realtime API接続
```

#### 3. 課金フロー
```
RevenueCat購入 → Webhook受信 (/api/billing/webhook/revenuecat)
  → データベース更新 → Virtual Currency付与
  → iOSアプリ側で同期 (SubscriptionManager.syncNow())
```

---

## iOSアプリの主要コンポーネント

### AppState（アプリ全体の状態管理）

**場所**: `aniccaios/aniccaios/AppState.swift`

**役割**: アプリ全体の状態を単一インスタンスで管理するシングルトン

**主要な状態:**
- `authStatus`: 認証状態（`.signedOut`, `.signingIn`, `.signedIn(UserCredentials)`）
- `userProfile`: ユーザープロフィール（名前、言語、睡眠場所、トレーニング重点）
- `subscriptionInfo`: サブスクリプション情報（プラン、利用量、残高）
- `habitSchedules`: 習慣スケジュール（`[HabitType: DateComponents]`）
- `isOnboardingComplete`: オンボーディング完了フラグ
- `onboardingStep`: 現在のオンボーディングステップ

**主要なメソッド:**
- `updateUserCredentials(_:)`: 認証情報を更新し、RevenueCatにログイン
- `updateUserProfile(_:sync:)`: プロフィールを更新し、バックエンドに同期
- `updateHabits(_:)`: 習慣スケジュールを更新し、通知を再登録
- `prepareForImmediateSession(habit:)`: 通知経由でセッションを即座に開始する準備

**永続化:**
- UserDefaultsに保存（キー: `com.anicca.*`）
- アプリ起動時に自動読み込み

### VoiceSessionController（音声セッション制御）

**場所**: `aniccaios/aniccaios/VoiceSessionController.swift`

**役割**: OpenAI Realtime APIへのWebRTC接続を管理

**主要な処理:**
1. `start()`: セッション開始
   - バックエンドから`client_secret`を取得
   - WebRTC接続を確立
   - OpenAI Realtime APIに接続
   - セッションIDを保存

2. `stop()`: セッション終了
   - バックエンドにセッション終了を通知 (`/api/mobile/realtime/session/stop`)
   - 利用量を計測・課金

**接続状態:**
- `.disconnected`: 未接続
- `.connecting`: 接続中
- `.connected`: 接続済み

**重要な注意点:**
- マイクロフォン権限が必要
- `AudioSessionCoordinator`で音声セッションを設定
- セッション中は30秒ごとに利用量をチェックし、上限到達時に自動終了

### SubscriptionManager（サブスクリプション管理）

**場所**: `aniccaios/aniccaios/Services/SubscriptionManager.swift`

**役割**: RevenueCat SDKとの連携とサブスクリプション状態の管理

**主要な処理:**
- `configure()`: RevenueCat SDKの初期化
- `refreshOfferings()`: オファリング情報の取得
- `syncNow()`: 購入状態をサーバーと同期
  - RevenueCatの`syncPurchases()`を実行
  - バックエンドに再同期を要求 (`/api/billing/revenuecat/sync`)
  - 利用量情報を取得 (`/api/mobile/entitlement`)

**重要な注意点:**
- PaywallやCustomer Centerを閉じた際に`syncNow()`を呼び出す
- エンタイトルメント状態はRevenueCatを優先し、利用量情報のみサーバーから取得

### AuthCoordinator（認証管理）

**場所**: `aniccaios/aniccaios/Authentication/AuthCoordinator.swift`

**役割**: Sign in with Apple認証フローの管理

**主要な処理:**
1. `configure(_:)`: 認証リクエストの設定（nonce生成）
2. `handleAuthorization(_:)`: 認証成功時の処理
   - IDトークンとnonceを取得
   - バックエンドに検証を依頼 (`/api/auth/apple`)
   - 成功時に`AppState.updateUserCredentials(_:)`を呼び出し

**重要な注意点:**
- nonceはセキュリティのため必須
- バックエンド検証が成功してから`AppState`を更新

### NotificationScheduler（通知スケジューリング）

**場所**: `aniccaios/aniccaios/Notifications/NotificationScheduler.swift`

**役割**: 習慣リマインダー通知の登録・解除

**主要な処理:**
- `applySchedules(_:)`: 習慣スケジュールに基づいて通知を登録
  - メイン通知: 指定時刻に毎日発火
  - フォローアップ通知: 60秒間隔で最大10件
  - 通知カテゴリ: `HABIT_ALARM`（アクション: 今すぐ対話、止める）

**重要な注意点:**
- 通知権限が必要
- 既存通知は削除してから新規登録
- サウンド: `AniccaWake.caf`（存在しない場合はデフォルト）

### ProfileSyncService（プロフィール同期）

**場所**: `aniccaios/aniccaios/Services/ProfileSyncService.swift`

**役割**: プロフィール情報をバックエンドと同期

**主要な処理:**
- `enqueue(profile:)`: プロフィール更新をキューに追加
- バックエンドにPUTリクエスト (`/api/mobile/profile`)
- 失敗時は再試行可能

---

## バックエンドAPIの主要エンドポイント

### 音声セッション関連

#### `GET /api/mobile/realtime/session`
**役割**: 音声セッション開始時に`client_secret`を発行

**リクエストヘッダー:**
- `device-id`: デバイスID（`UIDevice.identifierForVendor`）
- `user-id`: ユーザーID

**処理フロー:**
1. 利用量チェック（月間上限到達時は402を返す）
2. セッションIDを発行
3. `usage_sessions`テーブルに開始記録
4. OpenAI Realtime APIの`client_secret`を発行
5. セッションIDと`client_secret`を返す

**レスポンス:**
```json
{
  "client_secret": {
    "value": "...",
    "expires_at": 1234567890
  },
  "session_id": "uuid",
  "entitlement": { ... }
}
```

#### `POST /api/mobile/realtime/session/stop`
**役割**: セッション終了時に利用量を計測・課金

**リクエストボディ:**
```json
{
  "session_id": "uuid"
}
```

**処理フロー:**
1. `usage_sessions`テーブルを更新（終了時刻、利用時間を記録）
2. 利用時間を分単位に切り上げ
3. RevenueCat Virtual Currencyから利用分をデビット
4. 最新のエンタイトルメント状態を返す

### プロフィール関連

#### `GET /api/mobile/profile`
**役割**: プロフィール情報を取得

**リクエストヘッダー:**
- `device-id`: デバイスID
- `user-id`: ユーザーID

#### `PUT /api/mobile/profile`
**役割**: プロフィール情報を更新

**リクエストボディ:**
```json
{
  "displayName": "ユーザー名",
  "preferredLanguage": "ja",
  "sleepLocation": "寝室",
  "trainingFocus": ["筋力", "柔軟性"]
}
```

### エンタイトルメント関連

#### `GET /api/mobile/entitlement`
**役割**: サブスクリプション状態と利用量情報を取得

**レスポンス:**
```json
{
  "entitlement": {
    "plan": "pro",
    "status": "active",
    "monthly_usage_limit": 300,
    "monthly_usage_remaining": 250,
    "monthly_usage_count": 50
  }
}
```

### 認証関連

#### `POST /api/auth/apple`
**役割**: Sign in with AppleのIDトークンを検証

**リクエストボディ:**
```json
{
  "identity_token": "jwt_token",
  "nonce": "random_string",
  "user_id": "apple_user_id"
}
```

**処理フロー:**
1. IDトークンを検証
2. nonceを検証
3. ユーザーIDを返す

### 課金関連

#### `POST /api/billing/revenuecat/sync`
**役割**: RevenueCatの購入状態をサーバー側で再同期

**処理フロー:**
1. RevenueCat APIから最新の購入情報を取得
2. データベースを更新
3. Virtual Currencyを付与（必要に応じて）

---

## 認証・課金・セッション管理の仕組み

### 認証フロー

1. **iOSアプリ側**:
   - `AuthCoordinator`がSign in with Appleを実行
   - IDトークンとnonceを取得
   - バックエンドに検証を依頼 (`/api/auth/apple`)

2. **バックエンド側**:
   - IDトークンを検証（Appleの公開鍵を使用）
   - nonceを検証
   - ユーザーIDを返す

3. **iOSアプリ側**:
   - `AppState.updateUserCredentials(_:)`で認証情報を保存
   - `SubscriptionManager.handleLogin(_:)`でRevenueCatにログイン

### 課金フロー

#### 利用量の計測
- **単位**: 分（秒数を60で割って切り上げ）
- **記録**: `usage_sessions`テーブルに保存
- **課金**: RevenueCat Virtual Currencyから利用分をデビット

#### 月間利用量の付与
- **無料ユーザー**: 月初に30分を自動付与（`monthly_vc_grants`テーブルで管理）
- **月額ユーザー**: RevenueCat購入時に300分を自動付与
- **年額ユーザー**: 月初に300分を自動付与（サーバー側ジョブで実行）

#### 利用量制限
- セッション開始時に利用量をチェック（402エラーで拒否）
- セッション中は30秒ごとに利用量をチェックし、上限到達時に自動終了

### セッション管理フロー

1. **セッション開始**:
   - `VoiceSessionController.start()`が呼ばれる
   - バックエンドから`client_secret`を取得
   - WebRTC接続を確立
   - OpenAI Realtime APIに接続

2. **セッション中**:
   - 音声データをWebRTC経由で送受信
   - 30秒ごとに利用量をチェック
   - 5分ごとにサーバーと利用量を同期

3. **セッション終了**:
   - `VoiceSessionController.stop()`が呼ばれる
   - バックエンドにセッション終了を通知
   - 利用時間を計測・課金

---

## 開発時の重要な注意点

### 環境変数・設定ファイル

#### iOSアプリ側
- **Config.swift**: `Info.plist`から設定値を読み込む
  - `ANICCA_PROXY_BASE_URL`: バックエンドAPIのベースURL
  - `REVENUECAT_API_KEY`: RevenueCat APIキー
  - `REVENUECAT_ENTITLEMENT_ID`: エンタイトルメントID（例: `pro`）
  - `REVENUECAT_PAYWALL_ID`: Paywall ID（例: `anicca`）
  - `REVENUECAT_CUSTOMER_CENTER_ID`: Customer Center ID

- **xcconfigファイル**: `Configs/Production.xcconfig`, `Configs/Staging.xcconfig`
  - ビルド設定ごとの環境変数を定義

#### バックエンド側
- **Railway環境変数**:
  - `REVENUECAT_PROJECT_ID`: RevenueCatプロジェクトID
  - `REVENUECAT_REST_API_KEY`: RevenueCat REST APIキー
  - `REVENUECAT_WEBHOOK_SECRET`: Webhook検証用シークレット
  - `REVENUECAT_VC_CODE`: Virtual Currencyコード（例: `anicca`）
  - `FREE_MONTHLY_LIMIT`: 無料ユーザーの月間上限（例: `30`）
  - `PRO_MONTHLY_LIMIT`: PROユーザーの月間上限（例: `300`）

### オンボーディングフロー

**ステップ順序**:
1. `.welcome`: ウェルカム画面
2. `.microphone`: マイクロフォン権限要求
3. `.notifications`: 通知権限要求
4. `.account`: Sign in with Apple
5. `.profile`: プロフィール情報入力
6. `.habitSetup`: 習慣選択・時刻設定
7. `.habitWakeLocation`: 起床場所入力（wake習慣選択時）
8. `.habitSleepLocation`: 就寝場所入力（bedtime習慣選択時、wake未選択時）
9. `.habitTrainingFocus`: トレーニング重点選択（training習慣選択時）
10. `.paywall`: サブスクリプション購入画面
11. `.completion`: 完了画面

**状態管理**:
- `AppState.onboardingStep`で現在のステップを管理
- UserDefaultsに保存（キー: `com.anicca.onboardingStep`）
- オンボーディング完了時は`.completion`に設定

### 利用量制限と課金のタイミング

**重要なポイント**:
- セッション開始時に利用量をチェック（402エラーで拒否）
- セッション終了時に利用量を計測・課金
- セッション中は30秒ごとに利用量をチェックし、上限到達時に自動終了
- PaywallやCustomer Centerを閉じた際に`syncNow()`を呼び出して最新状態を取得

### エラーハンドリングのパターン

**ネットワークエラー**:
- `NetworkSessionManager`を使用してリトライ可能なリクエストを送信
- エラー時は既存のキャッシュされた状態を使用

**認証エラー**:
- 401エラー時は`AppState`の認証状態を`.signedOut`に戻す
- オンボーディングフローに戻す

**利用量上限エラー**:
- 402エラー時は`AppState.markQuotaHold(_:)`を呼び出してホールド状態を設定
- Paywallを表示

### デバッグのヒント

**ログ出力**:
- `Logger`を使用（サブシステム: `com.anicca.ios`）
- カテゴリごとに分類（例: `VoiceSession`, `AuthCoordinator`）

**開発用オプション**:
- `-resetOnLaunch`引数でUserDefaultsをクリア
- `AppDelegate.application(_:didFinishLaunchingWithOptions:)`で処理

---

## 主要ファイルの役割

### iOSアプリ

#### 状態管理
- `AppState.swift`: アプリ全体の状態管理（認証、プロフィール、習慣、オンボーディング）
- `Models/SubscriptionInfo.swift`: サブスクリプション情報のモデル
- `Models/UserProfile.swift`: ユーザープロフィールのモデル

#### 音声セッション
- `VoiceSessionController.swift`: WebRTC接続とOpenAI Realtime APIの管理
- `AudioSessionCoordinator.swift`: AVAudioSessionの設定管理

#### 認証
- `Authentication/AuthCoordinator.swift`: Sign in with Apple認証フロー
- `Authentication/AuthPresentationDelegate.swift`: 認証UIのデリゲート

#### サブスクリプション
- `Services/SubscriptionManager.swift`: RevenueCat SDKとの連携
- `Views/ManageSubscriptionSheet.swift`: サブスクリプション管理画面
- `Views/SubscriptionRequiredView.swift`: サブスクリプション必須画面

#### オンボーディング
- `Onboarding/OnboardingFlowView.swift`: オンボーディングフローのルーティング
- `Onboarding/OnboardingStep.swift`: オンボーディングステップの定義
- `Onboarding/*StepView.swift`: 各ステップのUI

#### 通知
- `Notifications/NotificationScheduler.swift`: 通知のスケジューリング
- `AppDelegate.swift`: 通知アクションの処理

#### 設定
- `Config.swift`: 設定値の読み込み
- `Views/Profile/ProfileView.swift`: プロファイルタブ（設定機能を含む）

#### 非推奨（DEPRECATED）
- `SettingsView.swift`: ⚠️ 使用されていません。ProfileView.swiftに統合済み。
- `SessionView.swift`内の`LegacyTalkRootView`: ⚠️ 使用されていません。TalkView.swiftが現在の実装。

### バックエンドAPI

#### ルーティング
- `src/routes/mobile/realtime.js`: 音声セッション関連エンドポイント
- `src/routes/mobile/profile.js`: プロフィール関連エンドポイント
- `src/routes/mobile/entitlement.js`: エンタイトルメント関連エンドポイント
- `src/routes/auth/apple.js`: Apple認証エンドポイント
- `src/routes/billing/index.js`: 課金関連エンドポイント

#### サービス
- `src/services/subscriptionStore.js`: サブスクリプション状態の管理
- `src/services/revenuecat/virtualCurrency.js`: Virtual Currencyの操作
- `src/services/mobile/profileService.js`: プロフィールのCRUD操作
- `src/services/openaiRealtimeService.js`: OpenAI Realtime APIの`client_secret`発行

#### ジョブ
- `src/jobs/monthlyCredits.js`: 月次クレジット付与ジョブ（UTC 00:05付近で実行）

#### 設定
- `src/config/environment.js`: 環境変数の管理

### データベース

#### マイグレーション
- `docs/migrations/007_usage_sessions.sql`: 利用セッション記録テーブル
- `docs/migrations/008_monthly_vc_grants.sql`: 月次クレジット付与記録テーブル

---

## 新機能追加時のチェックリスト

### 1. 既存パターンの確認
- [ ] 類似機能の実装を確認
- [ ] 既存のパターンに沿って実装

### 2. 状態管理の確認
- [ ] `AppState`に新しい状態が必要か確認
- [ ] UserDefaultsへの永続化が必要か確認

### 3. バックエンドAPIの確認
- [ ] 新しいエンドポイントが必要か確認
- [ ] 既存エンドポイントで対応可能か確認

### 4. 認証・権限の確認
- [ ] 認証が必要か確認
- [ ] 権限（マイク、通知など）が必要か確認

### 5. 課金・利用量の確認
- [ ] 課金が必要か確認
- [ ] 利用量制限の対象か確認

### 6. エラーハンドリングの確認
- [ ] エラーケースを洗い出し
- [ ] 適切なエラーハンドリングを実装

### 7. テストの確認
- [ ] ユニットテストを追加
- [ ] 統合テストを追加

---

## 参考ドキュメント

- `docs/anicca-ios.md`: iOSアプリの詳細仕様
- `docs/APP.md`: 音声分課金の実装詳細
- `docs/Behavior.md`: 行動変容機能の設計
- `README.md`: プロジェクト全体の概要

---

## よくある質問

### Q: 新しい習慣タイプを追加するには？
A: 
1. `Onboarding/HabitType.swift`に新しいケースを追加
2. `Resources/Prompts/`にプロンプトファイルを追加
3. `HabitPromptBuilder`でプロンプト生成ロジックを追加
4. 必要に応じてオンボーディングフローにフォローアップ質問を追加

### Q: 新しいAPIエンドポイントを追加するには？
A:
1. `src/routes/mobile/`に新しいルーターファイルを作成
2. `src/routes/mobile/index.js`にルーターを登録
3. 認証が必要な場合は`requireAuth`ミドルウェアを使用
4. エラーハンドリングを実装

### Q: 利用量制限を変更するには？
A:
1. Railway環境変数（`FREE_MONTHLY_LIMIT`, `PRO_MONTHLY_LIMIT`）を更新
2. RevenueCatダッシュボードでVirtual Currencyの設定を確認
3. iOSアプリ側の表示ロジックを確認（必要に応じて更新）

---

## エージェントの行動規範

### 意思決定ルール

**「どちらがいいですか？」と聞くな。自分で決めろ。**

エージェントは以下の手順で意思決定を行うこと：

1. **ベストプラクティスを調査する** - Web検索、ドキュメント、既存の成功事例を調べる
2. **自分で決定する** - 調査結果に基づいて、最適な選択肢を一つ選ぶ
3. **理由を説明する** - なぜその決定をしたのか、根拠を明確に述べる

**禁止事項:**
- 「AとBどちらがいいですか？」のような質問をユーザーに投げかける
- 複数の選択肢を提示して「選んでください」と言う
- 判断を先延ばしにする

**許可事項:**
- 決定後、ユーザーが異議を唱えた場合は再検討する
- 本当に情報が不足している場合のみ、具体的な情報を求める質問をする

---

## E2Eテスト自動化（Maestro）

### テストファイルの場所

```
maestro/
├── 01-onboarding.yaml      # オンボーディングフロー
├── 02-paywall.yaml         # ペイウォール表示
├── 03-session-start.yaml   # 音声セッション開始
└── 04-session-completion.yaml  # セッション終了フロー（新規追加）
```

### テスト実行コマンド

```bash
# 全テスト実行
maestro test maestro/

# 個別テスト実行
maestro test maestro/01-onboarding.yaml

# デバッグモード
maestro test --debug maestro/01-onboarding.yaml
```

### テスト作成時のルール

1. **ファイル命名**: `NN-description.yaml`（NN = 連番）
2. **テキストベース**: `id:` より `text:` を優先（accessibilityIdentifier不要）
3. **optional: true**: 権限ダイアログなど不確実な要素に使用

### テストシナリオ作成例

```yaml
appId: com.anicca.ios
---
- launchApp
- tapOn: "セッションを開始"
- assertVisible: "接続中"
- sleep: 3000
- tapOn: "終了"
- assertVisible: "セッションが終了しました"
```

### エージェントへの指示例

- 「オンボーディングのテストを実行して」
- 「セッション終了フローのテストを作成して」
- 「maestro/01-onboarding.yaml を修正して」

### CI連携

- PR作成時に自動実行（`.github/workflows/maestro-e2e.yml`）
- シミュレーター: iPhone 16
- 失敗時はPRにコメント

### Maestro Studioの使い方

1. シミュレーター起動 + アプリインストール
2. `maestro studio` でGUI起動
3. 画面をクリックしてテストコマンドを自動生成
4. 「Run」で実行確認、「Export」でYAML保存

---

**最終更新**: 2025-01-XX
**メンテナー**: Anicca開発チーム

