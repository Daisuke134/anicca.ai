export const metadata = { title: '利用規約 | Anicca' };

export default function TermsPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-3xl font-bold text-foreground">利用規約</h1>
      <p className="mt-6 text-muted-foreground">
        本規約は、音声アシスタントサービス「Anicca」（以下「本サービス」）の利用条件を定めるものです。ユーザーは本規約に同意のうえ本サービスを利用するものとします。
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第1条（適用）</h2>
      <p className="mt-3 text-muted-foreground">本規約は、ユーザーと成田大祐（個人事業主、以下「当方」）との間の本サービスの利用に関わる一切の関係に適用されます。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第2条（定義）</h2>
      <p className="mt-3 text-muted-foreground">「ユーザー」とは、本サービスを利用する全ての者をいいます。「有料プラン」とはStripe決済によるAnicca Proプラン（月額5USD、価格ID: price_1S93SrEeDsUAcaLSNXvHMwPL）を指します。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第3条（利用登録）</h2>
      <p className="mt-3 text-muted-foreground">本サービスの利用希望者はSupabaseによる認証を完了し、本規約に同意することで利用登録が成立します。当方は必要に応じて登録の拒否・取消を行うことがあります。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第4条（アカウント管理）</h2>
      <p className="mt-3 text-muted-foreground">ユーザーは自己の責任においてアカウント情報を管理し、第三者へ譲渡・貸与してはなりません。端末の管理不備に起因する損害について当方は責任を負いません。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第5条（サービス内容）</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>音声によるAIアシスタント機能</li>
        <li>Google Calendar 等の外部サービス連携（ユーザーによる許可が前提）</li>
        <li>Slackメッセージ送信等の自動化ツール</li>
        <li>当方が将来追加・改良する付随機能</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第6条（無料プランと有料プラン）</h2>
      <p className="mt-3 text-muted-foreground">無料プランでは利用できる機能に制限があります。有料プランへのアップグレードにより制限が解除され、高負荷機能を優先的に利用できます。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第7条（料金・支払方法）</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>料金：月額5米ドル（Stripe価格ID: price_1S93SrEeDsUAcaLSNXvHMwPL）。適用税額は決済時にStripeが算定します。</li>
        <li>支払方法：Stripe Checkoutによるクレジットカード決済。</li>
        <li>請求タイミング：初回は申し込み直後、以降は申込日に基づき毎月自動決済。</li>
        <li>領収書：Stripeから送信される決済レシートをご利用ください。</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第8条（解約）</h2>
      <p className="mt-3 text-muted-foreground">解約はDesktopアプリ「Upgrade to Pro」からStripe Customer Portalにアクセスし、「プランをキャンセル」を選択することで随時行えます。解約後も当該請求期間の終了までは有料機能を利用できます。途中解約による日割り返金は行いません。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第9条（禁止事項）</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>法令または公序良俗に違反する行為</li>
        <li>第三者の知的財産権・プライバシー等を侵害する行為</li>
        <li>本サービスの運営を妨害する行為、リバースエンジニアリング</li>
        <li>不正アクセス、過度なリクエスト送信、API鍵の共有</li>
        <li>本サービスで得た情報を無断で商用利用する行為</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第10条（サービス提供の停止）</h2>
      <p className="mt-3 text-muted-foreground">当方は、保守点検、システム障害、不可抗力等の場合に事前告知なくサービス提供を停止することがあります。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第11条（免責）</h2>
      <p className="mt-3 text-muted-foreground">当方は、OpenAI・Anthropic・Google等の外部サービスの変更・障害による損害について責任を負いません。当方の故意または重過失による場合を除き、当方の責任範囲は過去12か月にユーザーが支払った利用料金の総額を上限とします。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第12条（知的財産権）</h2>
      <p className="mt-3 text-muted-foreground">本サービスに関する知的財産権は当方または正当な権利者に帰属します。ユーザーは権利者の許諾なく複製・翻案等してはなりません。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第13条（規約の変更）</h2>
      <p className="mt-3 text-muted-foreground">当方は必要に応じて本規約を変更できます。変更後の規約は本ページに掲示された時点から効力を生じます。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第14条（準拠法・裁判管轄）</h2>
      <p className="mt-3 text-muted-foreground">本規約は日本法を準拠法とし、本サービスに関して紛争が生じた場合は東京地方裁判所または東京簡易裁判所を第一審の専属的合意管轄裁判所とします。</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">第15条（連絡方法）</h2>
      <p className="mt-3 text-muted-foreground">ユーザーと当方の連絡は、原則としてメール（keiodaisuke@gmail.com）で行います。当方からの通知は、メール送信または本サービス上の掲示により行います。</p>

      <p className="mt-12 text-right text-sm text-muted-foreground">最終更新日: 2025年2月21日</p>
    </main>
  );
}
