import Container from '@/components/base/Container'
import { Badge } from '@/components/ui/badge'
import FadeIn from '@/components/base/FadeIn'

export default function Hero() {
  return (
    <section className="bg-ivory-50 pt-24 pb-16">
      <Container>
        <FadeIn>
        <div className="max-w-3xl">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight">
            <span className="bg-gradient-to-r from-ink-800 to-saffron-600 bg-clip-text text-transparent">Anicca</span><br />
            Leading you to your best self.
          </h1>
          <p className="mt-5 text-lg text-ink-600">
            A proactive agent for behavior change. From wake to sleep—build good habits and break bad ones in days, not decades.
          </p>
          <div className="mt-6 flex flex-col items-start gap-3">
            <a
              href="https://github.com/Daisuke134/anicca.ai/releases/latest/download/anicca-arm64.dmg"
              className="inline-flex items-center font-semibold px-4 py-2.5 text-sm bg-ink-800 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition rounded-xl"
            >
              Download for Mac
            </a>
            <p className="text-sm text-ink-500">macOS 10.15+ (Catalina or later)</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-ink-600 font-semibold">
            <Badge>Proactive</Badge>
            <span>•</span>
            <Badge>Voice‑only</Badge>
            <span>•</span>
            <Badge>Tray‑only</Badge>
            <span>•</span>
            <Badge>Privacy‑first</Badge>
            <span>•</span>
            <Badge>Open Source</Badge>
          </div>
        </div>
        </FadeIn>
      </Container>
    </section>
  )
}


