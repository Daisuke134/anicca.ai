export const metadata = {
  title: '特定商取引法に基づく表記 | Anicca',
  description: '音声アシスタントサービス「Anicca」の有料プランに関する法的開示情報です。'
};

export default function TokushohoPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-3xl font-bold text-foreground">特定商取引法に基づく表記</h1>
      <p className="mt-6 text-muted-foreground">
        本ページは、音声アシスタントサービス「Anicca」の有料プランに関する法定表示です。
      </p>
      <dl className="mt-10 space-y-6">
        <div>
          <dt className="font-semibold text-foreground">販売業者</dt>
          <dd className="mt-1 text-muted-foreground">成田 大祐（個人事業主）</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">運営統括責任者</dt>
          <dd className="mt-1 text-muted-foreground">成田 大祐</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">所在地</dt>
          <dd className="mt-1 text-muted-foreground">ご請求があった場合には速やかに開示いたします。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">電話番号</dt>
          <dd className="mt-1 text-muted-foreground">ご請求があった場合には速やかに開示いたします。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">メールアドレス</dt>
          <dd className="mt-1 text-muted-foreground">keiodaisuke@gmail.com（受付：24時間、原則2営業日以内に返信）</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">販売URL</dt>
          <dd className="mt-1 text-muted-foreground">
            <a href="https://www.aniccaai.com" className="underline">https://www.aniccaai.com</a>
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">サービス名称</dt>
          <dd className="mt-1 text-muted-foreground">Anicca（AI音声アシスタント・macOSデスクトップアプリ）</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">提供形態</dt>
          <dd className="mt-1 text-muted-foreground">ダウンロード提供（Apple Silicon搭載macOS向けアプリケーション）</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">販売価格</dt>
          <dd className="mt-1 text-muted-foreground">
            Anicca Pro プラン：月額 5米ドル（Stripe価格ID: price_1S93SrEeDsUAcaLSNXvHMwPL）。決済時に各カード会社の為替レートで日本円換算されます。無料プランも提供しています。
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">消費税等</dt>
          <dd className="mt-1 text-muted-foreground">海外通貨決済のため表示価格は税抜です。適用法令に基づき決済事業者およびカード会社が税額を算定します。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">追加手数料</dt>
          <dd className="mt-1 text-muted-foreground">なし。インターネット接続費・為替手数料・端末費用等はお客様のご負担です。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">お支払い方法</dt>
          <dd className="mt-1 text-muted-foreground">Stripeを通じたクレジットカード決済（Visa、Mastercard、American Express など Stripe がサポートするブランド）。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">お支払い時期</dt>
          <dd className="mt-1 text-muted-foreground">初回はお申し込み完了時に即時決済。以降は申し込み日に基づき毎月自動更新で決済されます。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">サービス提供時期</dt>
          <dd className="mt-1 text-muted-foreground">Stripe Checkout完了後すぐに有料機能が有効化され、Desktopアプリで即時反映されます。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">動作環境</dt>
          <dd className="mt-1 text-muted-foreground">Apple Silicon（arm64）搭載のmacOS。常時インターネット接続とマイクが必要です。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">解約方法</dt>
          <dd className="mt-1 text-muted-foreground">Desktopアプリ「Upgrade to Pro」からStripe Customer Portalを開き、「プランをキャンセル」を選択してください。解約後も当該請求期間の終了までは利用できます。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">返品・返金</dt>
          <dd className="mt-1 text-muted-foreground">デジタルサービスの特性上、提供開始後の返金は原則として承っておりません。重大な不具合が確認された場合はメールで個別対応いたします。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">販売数量・申込期限</dt>
          <dd className="mt-1 text-muted-foreground">数量・期限の制限はありません（随時お申し込みいただけます）。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">サポート対応</dt>
          <dd className="mt-1 text-muted-foreground">メールサポートのみ。原則2営業日以内に回答いたします。</dd>
        </div>
      </dl>
      <p className="mt-12 text-right text-sm text-muted-foreground">最終更新日: 2025年2月21日</p>
    </main>
  );
}
