export const metadata = { title: 'プライバシーポリシー | Anicca' };

export default function PrivacyPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-3xl font-bold text-foreground">プライバシーポリシー</h1>
      <p className="mt-6 text-muted-foreground">
        本ポリシーは、音声アシスタントサービス「Anicca」（以下「本サービス」）において個人情報を含むユーザーデータをどのように取り扱うかを定めるものです。
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">1. 事業者情報</h2>
      <p className="mt-3 text-muted-foreground">成田 大祐（個人事業主） / keiodaisuke@gmail.com</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">2. 適用範囲</h2>
      <p className="mt-3 text-muted-foreground">
        本サービスのデスクトップアプリ、iOSアプリ、連携API、カスタマーサポート、Stripe Checkout / Customer Portal を利用するすべてのユーザーに適用します。
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">3. 取得する情報</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>アカウント情報（メールアドレス、Supabase認証ID、またはSign in with AppleによるApple User ID）</li>
        <li>音声データと文字起こし結果（リアルタイム処理後は即時破棄）</li>
        <li>Google Calendar・Slack等の連携サービスから取得するデータ（ユーザー許可範囲のみ）</li>
        <li>アプリ利用状況（プラン情報、起動ログ、エラー情報等）</li>
        <li>決済情報（Stripeで管理される顧客ID・請求履歴等。カード番号は取得しません）</li>
        <li>（iOS版）デバイス識別子（identifierForVendor）、習慣設定データ（起床時刻、トレーニング時刻、就寝時刻等）</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">4. 主な取得方法</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>ユーザーがアプリに入力・音声指示した内容</li>
        <li>OAuth連携により取得するGoogle Workspace / Slack APIレスポンス</li>
        <li>Supabase / Stripe / Railway上で自動生成されるログ</li>
        <li>サポート窓口へのメール問い合わせ内容</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">5. 利用目的</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>音声アシスタント機能の提供および質的向上</li>
        <li>ユーザー認証・プラン判定・課金処理の実施</li>
        <li>不具合解析・セキュリティ対策・サービス改善</li>
        <li>ユーザーからの問い合わせ対応、重要なお知らせの送信</li>
        <li>法令遵守のための記録保存</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">6. 第三者提供・委託</h2>
      <p className="mt-3 text-muted-foreground">
        サービス提供に必要な範囲で以下の事業者へ情報を送信します。各事業者は当方との契約または利用規約に基づき、情報保護義務を負います。
      </p>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>OpenAI（音声→テキスト変換およびリアルタイム応答。iOS版では音声データをストリーミング送信しますが、処理後は即座に破棄され恒久保存されません）</li>
        <li>Anthropic（開発者支援タスクの処理）</li>
        <li>Google LLC（Google Calendar 等の連携機能）</li>
        <li>Slack Technologies, LLC（チャット送信機能）</li>
        <li>Stripe, Inc.（決済処理）</li>
        <li>Supabase, Inc.（認証・データベース管理。デスクトップ版のみ）</li>
        <li>Railway（APIホスティング。iOS版では認証情報、デバイスID、習慣設定をPostgreSQLデータベースに保存）</li>
        <li>GitHub（アプリ配布用ファイルのホスティング）</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">7. Google API Services に関する事項</h2>
      <p className="mt-3 text-muted-foreground">
        Google Calendar 等の利用において取得するデータは、Google API Services User Data Policy（特に Limited Use 要件）に従い、音声読み上げ・予定参照の目的に限定して使用し、サーバーに恒久保存しません。
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">8. 保存期間と削除</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>音声データ：リアルタイム処理後に即時削除</li>
        <li>認証トークン：ユーザー端末上（デスクトップ版は`~/.anicca`、iOS版はUserDefaults）に暗号化保存し、ログアウトまたは無効化時に削除</li>
        <li>（iOS版）デバイス識別子：アプリ削除時にリセットされる一時的な識別子です</li>
        <li>Stripe決済記録：法令に基づき最低7年間保持</li>
        <li>サポート履歴：対応完了後3年間保管</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">9. 安全管理措置</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>安全な通信（HTTPS/TLS）とアクセストークンの暗号化保存</li>
        <li>データアクセスの権限分離（Supabase RLS、Stripeダッシュボード権限管理）</li>
        <li>ログの定期監査・不審アクセス検知</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">10. 利用者の権利</h2>
      <p className="mt-3 text-muted-foreground">
        ユーザーは自身の情報の開示・訂正・利用停止・削除を請求できます。keiodaisuke@gmail.com までご連絡ください。
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">11. クッキー等</h2>
      <p className="mt-3 text-muted-foreground">ランディングページでは必要最小限のCookieを使用します。Cookie自体に個人情報は含まれません。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">12. 未成年者の利用</h2>
      <p className="mt-3 text-muted-foreground">13歳未満の方は保護者の同意がない限り本サービスを利用できません。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">13. 法令等の遵守</h2>
      <p className="mt-3 text-muted-foreground">個人情報保護法その他関連法令・ガイドラインを遵守します。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">14. iOSアプリ版に関する追加事項</h2>
      <p className="mt-3 text-muted-foreground">
        iOSアプリ版では、以下の追加事項が適用されます。
      </p>
      
      <h3 className="mt-6 text-lg font-semibold text-foreground">取得する情報（iOS版）</h3>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li><strong>認証情報</strong>: Sign in with Apple により、Apple User ID、氏名（任意）、メールアドレス（提供された場合のみ）を取得します。</li>
        <li><strong>デバイス識別子</strong>: iOSの identifierForVendor を使用してデバイスを識別します。これはアプリ削除時にリセットされる一時的な識別子です。</li>
        <li><strong>習慣データ</strong>: 起床時刻、トレーニング時刻、就寝時刻、睡眠場所、トレーニングフォーカスなどの設定情報を保存します。</li>
        <li><strong>音声データ</strong>: リアルタイム音声対話のためにマイクから音声を取得します。音声データはリアルタイム処理のためにOpenAI Realtime APIに送信されますが、処理後は即座に破棄され、恒久保存されません。</li>
      </ul>

      <h3 className="mt-6 text-lg font-semibold text-foreground">データの保存先（iOS版）</h3>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li><strong>端末内</strong>: UserDefaultsを使用して認証情報、習慣設定、プロフィール情報をローカルに保存します。</li>
        <li><strong>サーバー</strong>: Railway上でホスティングされる自社APIサーバー（PostgreSQLデータベース）に、認証情報、デバイスID、習慣設定を保存します。音声データは保存しません。</li>
      </ul>

      <h3 className="mt-6 text-lg font-semibold text-foreground">データの利用目的（iOS版）</h3>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>アカウント管理と認証</li>
        <li>習慣スケジュールの通知配信（Time Sensitive通知を含む）</li>
        <li>リアルタイム音声対話機能の提供</li>
        <li>エラー解析とサービス改善</li>
      </ul>

      <h3 className="mt-6 text-lg font-semibold text-foreground">第三者共有（iOS版）</h3>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li><strong>OpenAI, Inc.</strong>: リアルタイム音声対話処理のため、音声データをストリーミング送信します。処理後は即座に破棄され、恒久保存されません。</li>
        <li>その他の第三者への共有は行いません。</li>
      </ul>

      <h3 className="mt-6 text-lg font-semibold text-foreground">通知権限について</h3>
      <p className="mt-3 text-muted-foreground">
        iOS版では、習慣形成を支援するため、Time Sensitive通知を使用します。これにより、端末がサイレントモードでも確実に通知を配信できます。通知は起床、トレーニング、就寝のスケジュールに基づいて配信されます。
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">15. 改定</h2>
      <p className="mt-3 text-muted-foreground">改定する場合は本ページで告知し、重要な変更はアプリ内通知等でお知らせします。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">16. 問い合わせ</h2>
      <p className="mt-3 text-muted-foreground">keiodaisuke@gmail.com までご連絡ください。</p>

      <p className="mt-12 text-right text-sm text-muted-foreground">最終更新日: 2025年11月9日</p>
    </main>
  );
}
