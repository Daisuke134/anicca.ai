import Navbar from '@/components/site/Navbar'
import Hero from '@/components/site/Hero'
import PromiseStrip from '@/components/site/PromiseStrip'
import KeyFeatures from '@/components/site/KeyFeatures'
import Privacy from '@/components/site/Privacy'
import HowItWorks from '@/components/site/HowItWorks'
import Demo from '@/components/site/Demo'
import Philosophy from '@/components/site/Philosophy'
import DownloadCta from '@/components/site/DownloadCta'

export default function Page() {
  return (
    <>
      <Navbar />
      <Hero />
      <Demo />
      <PromiseStrip />
      <KeyFeatures />
      <Privacy />
      <HowItWorks />
      <Philosophy />
      <DownloadCta />
      <footer className="bg-primary text-primary-foreground py-8 text-center">
        <p>© 2025 Anicca. All rights reserved.</p>
        <p className="mt-2 flex items-center justify-center gap-2">
          <a href="https://github.com/Daisuke134/anicca.ai" className="underline">GitHub</a>
          <span>•</span>
          <a href="/privacy" className="underline">Privacy Policy</a>
          <span>•</span>
          <a href="/terms" className="underline">Terms of Service</a>
          <span>•</span>
          <a href="mailto:contact@anicca.ai" className="underline">Contact</a>
        </p>
      </footer>
    </>
  )
}


