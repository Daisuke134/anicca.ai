export const metadata = { title: 'Privacy Policy | Anicca' };

export default function PrivacyPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-3xl font-bold text-ink-800">Privacy Policy</h1>
      <p className="mt-6 text-ink-600">
        Anicca values your privacy and is committed to protecting your personal information. This Privacy Policy explains how we handle personal information in our service "Anicca" ("the Service").
      </p>
      <h2 className="mt-10 text-xl font-semibold text-ink-800">1. Information We Collect</h2>
      <ul className="mt-3 list-disc pl-6 text-ink-700">
        <li>Voice data (temporarily processed for voice commands, deleted after processing)</li>
        <li>Google Calendar event information (only with explicit user permission)</li>
        <li>Slack messages (only when user enables integration)</li>
        <li>Application usage data</li>
      </ul>
      <h2 className="mt-10 text-xl font-semibold text-ink-800">2. Use of Google API Services</h2>
      <p className="mt-3 text-ink-600">
        Anicca's use and transfer of information received from Google APIs to any other app will adhere to Google API Services User Data Policy, including the Limited Use requirements.
      </p>
      <p className="mt-3 text-ink-600">The Service uses the calendar.events scope to access Google Calendar. This allows users to check and manage their schedules through voice commands.</p>
      <ul className="mt-3 list-disc pl-6 text-ink-700">
        <li>Access purpose: Voice-based schedule checking, reading aloud, and management</li>
        <li>Data usage: Real-time display and voice reading only</li>
        <li>Data storage: Calendar data is not stored on our servers</li>
      </ul>
      <h2 className="mt-10 text-xl font-semibold text-ink-800">3. How We Use Information</h2>
      <ul className="mt-3 list-disc pl-6 text-ink-700">
        <li>Processing voice commands and generating responses</li>
        <li>Retrieving calendar information and reading it aloud</li>
        <li>Sending and receiving Slack messages</li>
        <li>Improving services and developing new features</li>
      </ul>
      <h2 className="mt-10 text-xl font-semibold text-ink-800">4. Data Storage and Protection</h2>
      <ul className="mt-3 list-disc pl-6 text-ink-700">
        <li>API keys are protected with OS-standard encryption (Electron safeStorage)</li>
        <li>User data is stored locally (~/.anicca/)</li>
        <li>Voice data is deleted immediately after processing</li>
        <li>Calendar data is fetched in real-time only and not stored</li>
      </ul>
      <h2 className="mt-10 text-xl font-semibold text-ink-800">5. Information Sharing with Third Parties</h2>
      <ul className="mt-3 list-disc pl-6 text-ink-700">
        <li>With your explicit consent</li>
        <li>When required to comply with legal requirements</li>
        <li>Integration with necessary APIs for service provision (Claude AI, Google Calendar, Slack)</li>
      </ul>
      <h2 className="mt-10 text-xl font-semibold text-ink-800">6. User Rights</h2>
      <ul className="mt-3 list-disc pl-6 text-ink-700">
        <li>Request access to, correction, or deletion of personal information</li>
        <li>Revoke Google integration (from Google Account settings)</li>
        <li>Revoke Slack integration</li>
        <li>Discontinue use of the service</li>
      </ul>
      <h2 className="mt-10 text-xl font-semibold text-ink-800">7. Use of Cookies</h2>
      <p className="mt-3 text-ink-600">The web app version of the Service uses minimal necessary cookies for session management.</p>
      <h2 className="mt-10 text-xl font-semibold text-ink-800">8. Children's Privacy</h2>
      <p className="mt-3 text-ink-600">The Service is not intended for children under 13. Users under 13 should obtain parental consent before use.</p>
      <h2 className="mt-10 text-xl font-semibold text-ink-800">9. Changes to Privacy Policy</h2>
      <p className="mt-3 text-ink-600">We may update this Privacy Policy as necessary. We will notify you of significant changes through the Service.</p>
      <h2 className="mt-10 text-xl font-semibold text-ink-800">10. Contact Us</h2>
      <p className="mt-3 text-ink-600">Email: contact@anicca.ai</p>
      <p className="mt-12 text-right text-sm text-ink-500">Last updated: January 24, 2025</p>
    </main>
  );
}


