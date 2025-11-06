1. 改訂後のオンボーディング体験（例）
端末言語が日本語のユーザー “Akira” のケース:
Welcome
「Aniccaが毎日の習慣を声で支えます。」
CTA: “Get Started”。
Mic Permission → Notification Permission
目的説明つきで許可をリクエスト。許可後0.5秒で自動遷移。
Sign in with Apple
純正黒ボタン。Face ID 認証 → /auth/apple に送信 → 成功で AppState.authStatus = .signedIn(userId…)。
氏名とメールが一度だけ返るので UserProfile.displayName に即保存。
Habit Selection (Wake / Training / Bedtime)
Wake を有効化 → 時間選択 (06:00)。
Training を有効化 → 時間選択 (19:00)。
Bedtime は今回スキップ。
Habit Follow-up (選択済みハビットだけが即座に表示)
Wake: カード直下にテキストフィールド “Where do you usually wake up?”（プレースホルダー “Third-floor bedroom”）。
入力すると UserProfile.sleepLocation = "Third-floor bedroom in Tokyo apartment"。
Training: “Which training do you want to focus on every day?”（タイル選択: Push-up / Core / Cardio / Stretch）。
複数選択可、選ばなければ空のまま。
Bedtimeは未選択なので質問は出ない。
Sleep location は Wake/B edtime 共通でここ一度だけ聞く。
Completion Card
現在20:10の場合 → 「You’re all set! Next up: tonight at 19:00 I’ll nudge you for Training.」
ロジック: 現在時刻から最も近いハビット (19:00 Training) を計算。
“Continue” でメイン画面へ。
メイン画面 (SessionView)
青い “Talk to Anicca” ボタン。
右上ギアは常時表示：
Habitの時間変更
Follow-up回答(睡眠場所, Trainingフォーカス)の再編集
言語Picker (自動設定済み, いつでも変更可)
Sign Out ボタン（AppStateリセット）
Wake習慣の声かけ例 (翌朝6:00):
> 「おはよう、Akiraさん。三階のベッドルームから起きる頃だね。身体を優しく起こして、1日のスタートを整えよう。」
Training習慣の声かけ例 (日19:00):
> 「Akiraさん、Push-upメニューの時間だよ。準備ができたら10回1セットから始めようか。」




iOSパーソナライズ強化計画


<タスク分析>

主要タスク: iOSオンボーディングに個人情報入力フローを追加し、取得データをバックエンドと同期した上でプロンプトに反映できるよう設計・実装する。
技術スタック確認: iOS( SwiftUI, Combine ), Node.js/Express(API), PostgreSQL(Supabase互換) を既存バージョンのまま利用する。
重要要件/制約: UIテキストは英語維持・プロンプトは日本語化、情報取得は選択式中心、言語は自動判定+手動切替、プレースホルダーを Resources/Prompts に集約、重複処理は共通化。
潜在課題: 無権限での地域推定可否、ユーザー識別(現状はdevice-id)、テンプレート置換の整合性、オンボーディング離脱率への影響。
実装ステップ(概要): ①ユーザープロファイルモデル整備 ②オンボーディング/設定UI拡張 ③プロファイル永続化＆バックエンド同期 ④プロンプトテンプレート刷新 ⑤バックエンドAPI+DB拡張 ⑥UXフロー記述&図解。
最適順序: モデル→UI→保存/同期→プロンプト→バックエンド→ドキュメント/検証。
</タスク分析>
実装ステップ
ユーザープロファイル基盤追加  
aniccaios/aniccaios/Models/UserProfile.swift 新規作成: UserProfile, LanguagePreference enum, 初期推定ヘルパを実装。  
AppState.swift (L8付近、プロパティ宣言部) に @Published var userProfile と保存キーを追加。saveUserProfile()/loadUserProfile() を init (L35-L63) 内に組み込み、updateUserProfile(_:sync:) を新設。
オンボーディングUI拡張  
OnboardingStep.swift に .personalizeIntro, .personalInfo, .sleepContext, .habitContext を追加。  
新規SwiftUIファイル追加:  
Onboarding/PersonalizeIntroStepView.swift (説明＋Skip/Continue)。  
Onboarding/PersonalInfoStepView.swift (名前入力 + 言語選択、デフォルトは LanguagePreference.detectDefault() を使用)。  
Onboarding/SleepContextStepView.swift (寝る場所プリセット＋フリーテキスト。SUOptionPicker 等で選択式)。  
Onboarding/HabitContextStepView.swift (続けたい/やめたい習慣を TagPicker 形式で複数選択、その他テキスト対応)。  
OnboardingFlowView.swift (L5-L31) を新ステップに合わせて更新し、Skip時は markOnboardingComplete() を即時実行。
設定画面での後編集  
SettingsView.swift に「Personalization」セクションを追加(L27以降)。モーダル PersonalizationFormView(新規ファイル) を表示し、オンボーディングと同じフォームを再利用できるよう PersonalizationFormViewModel を導入。
プロフィール同期サービス  
Services/ProfileSyncService.swift 新設: sync(profile:deviceId:) で PUT /mobile/profile を呼び出し、レスポンスを UserProfile に反映。ネットワーク層は AppConfig.proxyBaseURL.  
AppState.updateUserProfile 内で ProfileSyncService.shared.sync を非同期呼び出し、失敗時はリトライ用にログ＆PendingSync フラグを保持。
プロンプトテンプレート刷新  
Resources/Prompts/common.txt を日本語で再整理し、${USER_NAME} ${SLEEP_LOCATION} ${CONTINUING_HABITS} ${QUIT_HABITS} ${LANGUAGE_LINE} 等のプレースホルダーを明示。  
wake_up.txt bedtime.txt training.txt を日本語ベースに書き換え、共通テンプレートと結合される前提で {{HABIT_NAME}} などは使わず自然文に ${...} を差し込む。  
WakePromptBuilder.swift (L3-L58) を改修: buildPrompt で common.txt を読み込み結合、TemplateRenderer ヘルパ(同ファイル内に追加)で UserProfile 値とスケジュール情報(例:formattedTime)を置換。INTERNAL_LANGUAGE_LINE/LABEL は LanguagePreference から取得。フォールバック文も日本語/英語両対応に更新。
Backend: プロファイルAPIと永続化  
apps/api/docs/migrations/003_create_mobile_profiles.sql を作成し、mobile_profiles テーブル(device_id unique, profile jsonb, language, updated_at) を追加。  
apps/api/src/services/mobile/profileService.js 新設: getProfile(deviceId)/upsertProfile(deviceId, payload) を pg で実装。  
apps/api/src/routes/mobile/profile.js を追加し、GET /mobile/profile と PUT /mobile/profile を実装。バリデーションは zod を使用(既存依存確認)。  
apps/api/src/routes/mobile/index.js (L6付近) で router.use('/profile', profileRouter); を追加。  
エラーハンドリング/ログは baseLogger.withContext('MobileProfile') を使用し、デバイスID必須ヘッダーを共通化。
グラウンディングドキュメント整備  
Resources/Prompts/common.txt 冒頭に LanguagePreference で埋める言語宣言を揃え、必要に応じ common.txt コメントを更新。  
必要に応じ docs/ に UXガイドラインを追記(日本語)。
検証と図解  
シミュレータでオンボーディング導線を確認し、取得データが UserDefaults/API に保存されること、プロンプトに反映されることをログで検証。  
最終回答で初回起動→声かけまでのテキスト説明とASCII矢印図(例:"Welcome → Permissions → Habit Setup → Personalize → Voice Nudge") を添付。