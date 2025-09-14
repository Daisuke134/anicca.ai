export const metadata = { title: 'Pricing | Anicca' };

export default function PricingPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-3xl font-bold text-foreground">Pricing</h1>
      <p className="mt-6 text-muted-foreground">
        Choose the plan that fits you. Start building good habits today.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm text-card-foreground">
          <h2 className="text-xl font-semibold text-foreground">Starter</h2>
          <p className="mt-2 text-muted-foreground">$0 / month</p>
          <ul className="mt-4 list-disc pl-5 text-foreground">
            <li>Voice-only, tray-only</li>
            <li>Privacy-first defaults</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm text-card-foreground">
          <h2 className="text-xl font-semibold text-foreground">Pro</h2>
          <p className="mt-2 text-muted-foreground">$12 / month</p>
          <ul className="mt-4 list-disc pl-5 text-foreground">
            <li>Habit engine</li>
            <li>Slack follow-through</li>
            <li>Priority support</li>
          </ul>
        </div>
      </div>
    </main>
  );
}


