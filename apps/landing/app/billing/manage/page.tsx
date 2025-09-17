export default function ManagePage() {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>サブスクリプションを管理 - Anicca</title>
        <style>{`
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f7; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; color: #1f2933; }
          .card { background: #fff; padding: 48px 40px; border-radius: 16px; box-shadow: 0 16px 32px rgba(15,23,42,0.12); max-width: 520px; text-align: center; }
          h1 { font-size: 1.8rem; margin-bottom: 16px; }
          p { line-height: 1.6; margin-bottom: 12px; }
          ul { list-style: none; padding: 0; margin: 16px 0 0; text-align: left; }
          li { margin-bottom: 8px; }
          a.button { display: inline-block; margin-top: 16px; padding: 12px 20px; border-radius: 999px; background: #2563eb; color: #fff; text-decoration: none; font-weight: 600; }
          a.button:hover { background: #1d4ed8; }
        `}</style>
      </head>
      <body>
        <div className="card">
          <h1>サブスクリプションを管理しました</h1>
          <p>請求情報やキャンセルの内容は即座に反映されます。変更後はAniccaデスクトップアプリを一度再度開き直すと最新のプラン状態が読み込まれます。</p>
          <ul>
            <li>・アップグレード: 数秒でProプランが有効になります。</li>
            <li>・キャンセル: 次回請求まで利用可能です。無料枠へ自動で戻ります。</li>
            <li>・お支払い方法の更新: Stripe Customer Portalで即時に反映されます。</li>
          </ul>
          <a className="button" href="https://anicca.ai">Anicca トップへ戻る</a>
        </div>
      </body>
    </html>
  );
}
