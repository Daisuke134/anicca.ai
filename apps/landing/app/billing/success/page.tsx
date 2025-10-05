export const metadata = {
  title: 'Payment successful | Anicca',
  description: 'Your upgrade to Anicca Pro is complete.',
};

export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="max-w-xl text-center space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Payment successful</h1>
        <p className="text-base leading-relaxed text-white/70">
          Return to the desktop app and your Pro plan will be active right away. No restart required.
        </p>
      </div>
    </main>
  );
}
