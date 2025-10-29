import Section from '@/components/base/Section'
import { Button } from '@/components/ui/button'

export default function DownloadCta() {
  return (
    <Section id="download" className="py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold">Get Started Now</h2>
          <p className="mt-2 text-muted-foreground">Take the first step toward behavioral change.</p>
          <div className="mt-6 flex flex-col items-center gap-2">
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
          </div>
          <div className="mt-6">
            <a href="https://github.com/Daisuke134/anicca.ai" className="font-semibold underline">View on GitHub</a>
          </div>
        </div>
    </Section>
  )
}

