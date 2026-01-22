export const metadata = { title: 'Privacy Policy | Anicca' };

export default function PrivacyEN() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
      <p className="mt-6 text-muted-foreground">
        This policy describes how we handle user data, including personal information, in the voice assistant service "Anicca" (hereinafter "this service").
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">1. Business Information</h2>
      <p className="mt-3 text-muted-foreground">Daisuke Narita (Individual Business Owner) / keiodaisuke@gmail.com</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">2. Scope of Application</h2>
      <p className="mt-3 text-muted-foreground">
        This policy applies to all users of our desktop app, iOS app, integrated APIs, customer support, and Stripe Checkout / Customer Portal.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">3. Information We Collect</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>Account information (email address, Supabase authentication ID, or Apple User ID via Sign in with Apple)</li>
        <li>Voice data and transcription results (deleted immediately after real-time processing)</li>
        <li>Data obtained from integrated services such as Google Calendar and Slack (only within user-permitted scope)</li>
        <li>App usage data (plan information, launch logs, error information, etc.)</li>
        <li>Payment information (customer ID and billing history managed by Stripe. We do not collect card numbers)</li>
        <li>(iOS version) Device identifier (identifierForVendor), habit setting data (wake time, training time, bedtime, etc.)</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">4. Main Collection Methods</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>Content entered or voice-instructed by users in the app</li>
        <li>Google Workspace / Slack API responses obtained through OAuth integration</li>
        <li>Logs automatically generated on Supabase / Stripe / Railway</li>
        <li>Email inquiry content sent to our support desk</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">5. Purpose of Use</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>Provision and qualitative improvement of voice assistant functions</li>
        <li>User authentication, plan determination, and billing processing</li>
        <li>Bug analysis, security measures, and service improvement</li>
        <li>Response to user inquiries and sending important notices</li>
        <li>Record keeping for legal compliance</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">6. Third-Party Provision and Outsourcing</h2>
      <p className="mt-3 text-muted-foreground">
        We transmit information to the following businesses to the extent necessary for service provision. Each business is obligated to protect information based on contracts or terms of service with us.
      </p>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>OpenAI (voice-to-text conversion and real-time responses. In the iOS version, voice data is streamed but deleted immediately after processing and not permanently stored)</li>
        <li>Anthropic (developer support task processing)</li>
        <li>Google LLC (Google Calendar and other integration features)</li>
        <li>Slack Technologies, LLC (chat sending features)</li>
        <li>Stripe, Inc. (payment processing)</li>
        <li>Supabase, Inc. (authentication and database management. Desktop version only)</li>
        <li>Railway (API hosting. In the iOS version, authentication information, device ID, and habit settings are stored in PostgreSQL database)</li>
        <li>GitHub (hosting of app distribution files)</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">7. Matters Regarding Google API Services</h2>
      <p className="mt-3 text-muted-foreground">
        Data obtained through the use of Google Calendar and other services is used only for the purpose of voice reading and schedule reference in accordance with Google API Services User Data Policy (especially Limited Use requirements), and is not permanently stored on servers.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">8. Retention Period and Deletion</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>Voice data: Deleted immediately after real-time processing</li>
        <li>Authentication tokens: Encrypted and stored on user devices (desktop version: `~/.anicca`, iOS version: UserDefaults), deleted upon logout or invalidation</li>
        <li>(iOS version) Device identifier: A temporary identifier that resets when the app is deleted</li>
        <li>Stripe payment records: Retained for at least 7 years as required by law</li>
        <li>Support history: Stored for 3 years after completion of response</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">9. Security Measures</h2>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>Secure communication (HTTPS/TLS) and encrypted storage of access tokens</li>
        <li>Access control separation (Supabase RLS, Stripe dashboard permission management)</li>
        <li>Regular log audits and suspicious access detection</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">10. User Rights</h2>
      <p className="mt-3 text-muted-foreground">
        Users can request disclosure, correction, suspension of use, or deletion of their information. Please contact keiodaisuke@gmail.com.
      </p>

      <h3 className="mt-6 text-lg font-semibold text-foreground">Account Deletion (iOS)</h3>
      <p className="mt-3 text-muted-foreground">
        You can complete account deletion within the app from "Settings" → "Delete Account" in the iOS app.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">11. Cookies, etc.</h2>
      <p className="mt-3 text-muted-foreground">The landing page uses only the minimum necessary cookies. Cookies themselves do not contain personal information.</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">12. Use by Minors</h2>
      <p className="mt-3 text-muted-foreground">Users under 13 years of age cannot use this service without parental consent.</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">13. Compliance with Laws and Regulations</h2>
      <p className="mt-3 text-muted-foreground">We comply with the Personal Information Protection Act and other related laws and guidelines.</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">14. Additional Matters Regarding iOS App Version</h2>
      <p className="mt-3 text-muted-foreground">
        The following additional matters apply to the iOS app version.
      </p>
      
      <h3 className="mt-6 text-lg font-semibold text-foreground">Information Collected (iOS Version)</h3>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li><strong>Authentication Information</strong>: We obtain Apple User ID, name (optional), and email address (only if provided) through Sign in with Apple.</li>
        <li><strong>Device Identifier</strong>: We use iOS identifierForVendor to identify devices. This is a temporary identifier that resets when the app is deleted.</li>
        <li><strong>Habit Data</strong>: We store setting information such as wake time, training time, bedtime, sleep location, and training focus.</li>
        <li><strong>Voice Data</strong>: We obtain voice from the microphone for real-time voice conversations. Voice data is sent to OpenAI Realtime API for real-time processing but is deleted immediately after processing and not permanently stored.</li>
      </ul>

      <h3 className="mt-6 text-lg font-semibold text-foreground">Data Storage Location (iOS Version)</h3>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li><strong>On Device</strong>: We store authentication information, habit settings, and profile information locally using UserDefaults.</li>
        <li><strong>Server</strong>: We store authentication information, device ID, and habit settings on our own API server (PostgreSQL database) hosted on Railway. We do not store voice data.</li>
      </ul>

      <h3 className="mt-6 text-lg font-semibold text-foreground">Purpose of Data Use (iOS Version)</h3>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li>Account management and authentication</li>
        <li>Notification delivery for habit schedules (including Time Sensitive notifications)</li>
        <li>Provision of real-time voice conversation features</li>
        <li>Error analysis and service improvement</li>
      </ul>

      <h3 className="mt-6 text-lg font-semibold text-foreground">Third-Party Sharing (iOS Version)</h3>
      <ul className="mt-3 list-disc pl-6 text-foreground space-y-2">
        <li><strong>OpenAI, Inc.</strong>: We stream voice data for real-time voice conversation processing. Data is deleted immediately after processing and not permanently stored.</li>
        <li>We do not share with any other third parties.</li>
      </ul>

      <h3 className="mt-6 text-lg font-semibold text-foreground">About Notification Permissions</h3>
      <p className="mt-3 text-muted-foreground">
        The iOS version uses Time Sensitive notifications to support habit formation. This ensures that notifications are delivered even when the device is in silent mode. Notifications are delivered based on schedules for wake-up, training, and bedtime.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">15. Revisions</h2>
      <p className="mt-3 text-muted-foreground">When revisions are made, we will announce them on this page, and important changes will be notified through in-app notifications, etc.</p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">16. Contact</h2>
      <p className="mt-3 text-muted-foreground">Please contact keiodaisuke@gmail.com.</p>

      <p className="mt-12 text-right text-sm text-muted-foreground">Last Updated: November 9, 2025</p>
    </main>
  );
}










