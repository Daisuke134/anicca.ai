export const metadata = { title: 'Pricing | Anicca' };

export default function PricingPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-3xl font-bold text-ink-800">Pricing</h1>
      <p className="mt-6 text-ink-600">
        Choose the plan that fits you. Start building good habits today.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-ivory-300 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-ink-800">Starter</h2>
          <p className="mt-2 text-ink-600">$0 / month</p>
          <ul className="mt-4 list-disc pl-5 text-ink-700">
            <li>Voice-only, tray-only</li>
            <li>Privacy-first defaults</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-ivory-300 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-ink-800">Pro</h2>
          <p className="mt-2 text-ink-600">$12 / month</p>
          <ul className="mt-4 list-disc pl-5 text-ink-700">
            <li>Habit engine</li>
            <li>Slack follow-through</li>
            <li>Priority support</li>
          </ul>
        </div>
      </div>
    </main>
  );
}


