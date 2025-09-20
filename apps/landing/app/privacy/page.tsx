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
        本サービスのデスクトップアプリ、連携API、カスタマーサポート、Stripe Checkout / Customer Portal を利用するすべてのユーザーに適用します。
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">3. 取得する情報</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>アカウント情報（メールアドレス、Supabase認証ID）</li>
        <li>音声データと文字起こし結果（リアルタイム処理後は即時破棄）</li>
        <li>Google Calendar・Slack等の連携サービスから取得するデータ（ユーザー許可範囲のみ）</li>
        <li>アプリ利用状況（プラン情報、起動ログ、エラー情報等）</li>
        <li>決済情報（Stripeで管理される顧客ID・請求履歴等。カード番号は取得しません）</li>
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
        <li>OpenAI（音声→テキスト変換およびリアルタイム応答）</li>
        <li>Anthropic（開発者支援タスクの処理）</li>
        <li>Google LLC（Google Calendar 等の連携機能）</li>
        <li>Slack Technologies, LLC（チャット送信機能）</li>
        <li>Stripe, Inc.（決済処理）</li>
        <li>Supabase, Inc.（認証・データベース管理）</li>
        <li>Railway（APIホスティング）</li>
        <li>GitHub（アプリ配布用ファイルのホスティング）</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">7. Google API Services に関する事項</h2>
      <p className="mt-3 text-muted-foreground">
        Google Calendar 等の利用において取得するデータは、Google API Services User Data Policy（特に Limited Use 要件）に従い、音声読み上げ・予定参照の目的に限定して使用し、サーバーに恒久保存しません。
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">8. 保存期間と削除</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>音声データ：リアルタイム処理後に即時削除</li>
        <li>認証トークン：ユーザー端末上（`~/.anicca`）に暗号化保存し、ログアウトまたは無効化時に削除</li>
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

      <h2 className="mt-10 text-xl font-semibold text-foreground">14. 改定</h2>
      <p className="mt-3 text-muted-foreground">改定する場合は本ページで告知し、重要な変更はアプリ内通知等でお知らせします。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">15. 問い合わせ</h2>
      <p className="mt-3 text-muted-foreground">keiodaisuke@gmail.com までご連絡ください。</p>

      <p className="mt-12 text-right text-sm text-muted-foreground">最終更新日: 2025年2月21日</p>
    </main>
  );
}
