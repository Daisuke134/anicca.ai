export default function SuccessPage() {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>決済が完了しました - Anicca</title>
        <style>{`
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f7; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; color: #1f2933; }
          .card { background: #fff; padding: 48px 40px; border-radius: 16px; box-shadow: 0 16px 32px rgba(15,23,42,0.12); max-width: 480px; text-align: center; }
          h1 { font-size: 1.8rem; margin-bottom: 16px; }
          p { line-height: 1.6; margin-bottom: 16px; }
          a.button { display: inline-block; margin-top: 12px; padding: 12px 20px; border-radius: 999px; background: #2563eb; color: #fff; text-decoration: none; font-weight: 600; }
          a.button:hover { background: #1d4ed8; }
        `}</style>
      </head>
      <body>
        <div className="card">
          <h1>決済が完了しました</h1>
          <p>ご登録ありがとうございます。数秒後にアプリへ戻り、プラン情報が更新されると利用上限が解除されます。</p>
          <p>アプリが自動で切り替わらない場合は、Aniccaを再度開き直してください。</p>
          <a className="button" href="https://anicca.ai">Anicca トップへ戻る</a>
        </div>
      </body>
    </html>
  );
}
