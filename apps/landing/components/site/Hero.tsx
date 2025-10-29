import Section from '@/components/base/Section'
import { Badge } from '@/components/ui/badge'
import FadeIn from '@/components/base/FadeIn'
import { Button } from '@/components/ui/button'

export default function Hero() {
  return (
    <Section className="pt-24 pb-16">
        <FadeIn>
        <div className="max-w-3xl">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight">
            <span className="text-foreground">Anicca</span><br />
            Leading you to your best self.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            A proactive agent for behavior change. From wake to sleep—build good habits and break bad ones in days, not decades.
          </p>
          <div className="mt-6 flex flex-col items-start gap-3">
            <Button asChild>
              <a href="https://github.com/Daisuke134/anicca.ai/releases/latest/download/anicca-arm64.dmg">
                Download for Mac (Apple&nbsp;Silicon)
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="https://github.com/Daisuke134/anicca.ai/releases/latest/download/anicca-x64.dmg">
                Download for Intel Mac
              </a>
            </Button>
            <p className="text-sm text-muted-foreground">macOS 10.15+ (Catalina or later)</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-muted-foreground font-semibold">
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
    </Section>
  )
}

