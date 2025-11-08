
実装詳細計画
1. オンボーディング冒頭とサインイン導線の調整
aniccaios/Onboarding/WelcomeStepView.swift の L13 を "Let’s configure your routines." に置換し、文言を統一する。
aniccaios/Onboarding/AuthenticationStepView.swift にて以下を実施。
L24-33 の SignInWithAppleButton アクション内（request クロージャ直後）で AppState.shared.setAuthStatus(.signingIn) を呼び出し、 L37-39 の DispatchQueue.main.asyncAfter ブロックを削除して即時に next() を呼ぶ。
L52-61 の進捗表示ブロックを削除し、代わりにボタンを ZStack で包んで isProcessing が true の間は半透明オーバーレイ＋ Text("Signing in…") を重ねる。
L25 isProcessing = true 設定を維持しつつ、onCompletion 内で AppState.shared.setAuthStatus(.signingIn) を最初に呼び、完了・失敗時はいずれも isProcessing = false を確実に行う。
aniccaios/AuthCoordinator.swift の L68-75 で displayName のデフォルト値を "" に変更し、verifyWithBackend 呼び出し前に AppState.shared.setAuthStatus(.signingIn) を追加する。
aniccaios/AppState.swift の updateUserCredentials（L209-217）で credentials.displayName が空文字の場合は userProfile.displayName を上書きしないよう条件分岐を挿入し、.signedIn への遷移を即時化する。
2. プロフィール入力フローの改修
aniccaios/Onboarding/ProfileInfoStepView.swift
L22 の TextField に .textInputAutocapitalization(.words) と .autocorrectionDisabled() を追加。
.onAppear（L44-46）で appState.userProfile.displayName.trimmingCharacters(in: .whitespaces) が空、または "User" の場合はローカル状態を "" に設定してプレースホルダーを表示させる。
aniccaios/AuthCoordinator.swift で Apple 側から名前が取得できなかった際は UserCredentials.displayName に空文字を格納するよう handleAuthorization を修正（L63-L75）。
3. ハビット設定とフォローアップの分割
aniccaios/Onboarding/HabitSetupStepView.swift
冒頭の @State private var sleepLocation と selectedTrainingFocus を削除し、選択結果を一時保持する @State private var pendingSelections: HabitSelectionDraft（新規構造体）を導入する。
L130-200 の followUpSection / wakeFollowUp / trainingFollowUp 関連ビューを削除し、保存時には appState.prepareHabitFollowUps(selectedHabits: selectedHabits, habitTimes: habitTimes) を呼ぶ形に変更。
aniccaios/Onboarding/OnboardingStep.swift
.habitWakeLocation、.habitSleepLocation、.habitTrainingFocus の 3 ケースを追加。
aniccaios/AppState.swift
@Published private(set) var pendingHabitFollowUps: [HabitFollowUpItem] = [] を定義し、prepareHabitFollowUps（新規メソッド）で Wake／Bedtime／Training の順に必要な HabitFollowUpItem をキューに積むロジックを追加（Wake と Bedtime 両方の場合は Wake のみ追加、Bedtimeのみの場合は Sleep を追加）。
consumeNextHabitFollowUp() と clearHabitFollowUps() を実装して進行制御を担う。
aniccaios/Onboarding/OnboardingFlowView.swift
step 遷移ロジックを appState.consumeNextHabitFollowUp() を用いた分岐に変更し、switch に新規 3 ケースを追加。advance() ではフォローアップが残っていれば該当ステップへ、すべて消化済みなら .completion に進める。
新規ファイル aniccaios/Onboarding/HabitWakeLocationStepView.swift
Text("Where do you usually wake up?") と AccessorylessTextField（後述）で入力し、Continue ボタンで appState.updateSleepLocation(_:) を呼ぶ実装を追加。
新規ファイル aniccaios/Onboarding/HabitSleepLocationStepView.swift
Wake を選択しなかった場合に同等 UI で「Where do you usually sleep?」を表示し、保存時は sleepLocation を上書きする。
新規ファイル aniccaios/Onboarding/HabitTrainingFocusStepView.swift
4 つの選択肢を Picker（selection: Binding<String>）で単一選択させ、保存時 appState.updateTrainingFocus([selected]) を呼ぶ。
入力中にアクセサリバーの「Done」を表示しないため、aniccaios/Components/AccessorylessTextField.swift（新規）を追加し、UIViewRepresentable で inputAccessoryView = nil の UITextField を提供する。上記 2 つのロケーションステップで採用する。
4. 設定画面（Personalization）の刷新
aniccaios/SettingsView.swift
@State に displayName, sleepLocation, preferredLanguage, trainingFocus を追加し、init および onAppear で appState.userProfile から値を読み込む。
Personalization セクションを下記構成に置き換える。
TextField("John", text: $displayName)（.textInputAutocapitalization(.words) 付き）。
Picker("Language", selection: $preferredLanguage) に .pickerStyle(.segmented) を適用し、LanguagePreference.ja / .en の 2 つを表示。
TextField("Third-floor bedroom", text: $sleepLocation)。
Picker("Training Focus", selection: $trainingFocus) で 4 候補から単一選択。
Save アクション内で UserProfile を更新し、ProfileSyncService を通じてサーバと同期。Habit 時刻保存処理とまとめて完了させる。
5. 言語同期ロジックとバックエンド整備
aniccaios/Models/UserProfile.swift の LanguagePreference.detectDefault()（L16-L22）を確認し、Locale から ja 以外は en を返す現仕様を維持。
aniccaios/AppState.swift にてプロファイル読込時、preferredLanguage が未設定または mobile_profiles.language が nil の場合は LanguagePreference.detectDefault() を反映させる処理を追加（loadUserProfile() 内）。
apps/api/src/routes/mobile/profile.js
GET ルートで user_settings.language を取得するよう SQL を拡張し、preferredLanguage 未設定時のフォールバックに使用。
PUT ルートで受け取った preferredLanguage を user_settings.language にも UPSERT するよう mobile_profileService.upsertProfile の呼び出し後に更新処理を追加。
apps/api/src/services/mobile/profileService.js
upsertProfile 内で mobile_profiles.language を preferredLanguage で更新している現行 SQL を維持しつつ、同関数内で user_settings に対する INSERT ... ON CONFLICT ... DO UPDATE を追加する。
6. 期待される体験シナリオ
Welcome 画面に「Let’s configure your routines.」が表示される。
Apple サインインボタンを押すと即座に「Signing in…」へ変わり、認証完了後すぐプロフィール登録へ遷移する。
名前入力画面ではプレースホルダー “John” が薄い文字で表示され、空欄のままでは進めない。
ハビット選択後、選択した習慣に応じて Wake/Sleep/Training のフォローアップ画面がそれぞれ単独で表示される。
Personalization では Name/Lang/SleepLocation/TrainingFocus をその場で変更でき、言語は端末ロケールに合わせて初期表示される。
すべての同期が完了すると、メイン画面では日本語ロケールなら「おはよう、〇〇さん」と発話される。