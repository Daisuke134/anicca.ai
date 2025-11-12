現在の状況
Apple Developer Programに加入済み
App Store Connectの審査中（「追加情報を提供していただきありがとうございます。現在処理中で、間もなく審査されます。」）
審査完了までApp Store Connectにアクセスできない
TestFlight → App Store公開までのTODOリスト
【現在】審査完了を待つ
[ ] App Store Connectにアクセスできるようになるまで待つ
【審査完了後】1. TestFlightへのアップロード
[ ] Xcode Organizerウィンドウでアーカイブを選択
[ ] 「Distribute App」→「App Store Connect」を選択
[ ] 「Upload」を選択してアップロード
[ ] アップロード完了を待つ（数分〜数十分）
【アップロード完了後】2. TestFlight内部テストの設定
[ ] App Store Connectにログイン
[ ] 「TestFlight」タブを開く
[ ] アップロードしたビルドを選択
[ ] 「Internal Testing」セクションで以下を設定：
What to Test（テスト内容の説明）を入力
テスト手順を入力
[ ] 内部テスター（チームメンバー）に配布
[ ] 内部テストで動作確認
【内部テスト完了後】3. TestFlight外部テストの設定（友人向け）
[ ] App Store Connectで「External Testing」セクションを開く
[ ] 外部テスターグループを作成
[ ] 友人のメールアドレスを外部テスターに追加
[ ] 外部審査申請：
テスト情報を入力
審査用質問に回答
[ ] Appleの外部審査を待つ（通常1-2日）
[ ] 承認後にInviteを送付
【外部テスト完了後】4. App Store審査準備
[ ] App Store Connectの「App Information」を最新化：
アプリ名、説明文、キーワード
スクリーンショット（各デバイスサイズ）
プライバシーポリシーURL
サポートURL
[ ] 「App Privacy」セクションでデータ収集内容を確認
[ ] 「Version Information」で以下を設定：
リリースノート
Review Notes（Time Sensitive通知の利用理由、再現手順を明記）
テストアカウント情報（必要に応じて）
【準備完了後】5. App Store審査申請
[ ] 「Submit for Review」をクリック
[ ] エクスポートコンプライアンスの質問に回答
[ ] 審査提出を完了
[ ] Appleの審査を待つ（通常1-3日）
【審査通過後】6. App Store公開
[ ] 審査通過の通知を確認
[ ] 公開方法を選択：
「自動的に公開する」を選択（即時公開）
または「手動で公開する」を選択（後で公開日を設定）
[ ] 公開後、App Storeでアプリが表示されることを確認
【公開後】7. 公開後の確認
[ ] App Storeでアプリが公開されているか確認
[ ] ダウンロードリンクが正しく動作するか確認
[ ] バージョン情報が正しく表示されているか確認


TestFlight 外部テスト用（審査後すぐ友人に配布するための必須物）
[ ] What to Test：50〜80文字でテスト観点を文章化し、テキストファイルに保存
[ ] テスト手順：審査用の再現手順を箇条書きで3項目ほどまとめ、テキスト化
[ ] 外部テスター候補リスト：友人のメールアドレスを CSV かテキストで一覧化
[ ] テストアカウント情報：ログインが必要なら ID／パスワードをメモにまとめる
App Store 本申請用（TestFlight 外部テスト完了後に必須）
[ ] アプリ説明文：200文字程度で最新版を作り、テキスト保存
[ ] キーワード：カンマ区切りで10語程度、被りチェック済みのリストを準備
[ ] スクリーンショット：iPhone 6.7″ / 6.5″ / 5.5″ の PNG を store-assets/ などに整理
[ ] プライバシーポリシーURL・サポートURL：リンク先が最新か最終確認しメモ
[ ] App Privacy 質問票：収集データ・利用目的・第三者共有の有無を表形式で確定
[ ] Review Notes 下書き：Time Sensitive 通知の理由・再現手順を3行程度に整形
共通準備（アクセス復旧後に一気に進めるための段取り）
[ ] 審査完了後の手順書：
Web版 App Store Connect 再ログイン
Xcode > Settings > Accounts でセッション更新
Organizer から再アップロード
TestFlight 外部申請 → Beta App Review → 招待の流れをチェックリスト化
[ ] アーカイブ確認メモ：再アップロードする .xcarchive の保存場所とファイル名を記録
[ ] 審査状況確認用メモ：Beta App Review のステータス名称とメール通知の見方をまとめる
[ ] 進捗管理ファイル：上記チェック項目を Notion などに貼り付け、更新を即反映できる状態にする