import Container from '@/components/base/Container'
import { Button } from '@/components/ui/button'

export default function DownloadCta() {
  return (
    <section id="download" className="py-20 bg-ivory-50">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-bold">Get Started Now</h2>
          <p className="mt-2 text-ink-600">Take the first step toward behavioral change.</p>
          <div className="mt-6 flex justify-center">
            <Button asChild>
              <a href="https://github.com/Daisuke134/anicca.ai/releases/latest/download/anicca-arm64.dmg">
                Download for Mac
              </a>
            </Button>
          </div>
          <div className="mt-6">
            <a href="https://github.com/Daisuke134/anicca.ai" className="font-semibold underline">View on GitHub</a>
          </div>
        </div>
      </Container>
    </section>
  )
}


