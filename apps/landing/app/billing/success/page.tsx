export const metadata = {
  title: '課金が完了しました | Anicca',
  description: 'Anicca Pro プランへのアップグレードが完了しました。',
};

export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="max-w-xl text-center space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">課金が完了しました</h1>
        <p className="text-base leading-relaxed text-white/70">
          デスクトップアプリへ戻ると、Pro プランがすぐに反映されます。アプリを再起動する必要はありません。
        </p>
      </div>
    </main>
  );
}
