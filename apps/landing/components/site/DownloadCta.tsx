import Container from '@/components/base/Container'

export default function DownloadCta() {
  return (
    <section id="download" className="py-20 bg-ivory-50">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-bold">Get Started Now</h2>
          <p className="mt-2 text-ink-600">Take the first step toward behavioral change.</p>
          <div className="mt-6 flex justify-center">
            <a
              href="https://github.com/Daisuke134/anicca.ai/releases/latest/download/anicca-arm64.dmg"
              className="inline-flex items-center font-semibold px-5 py-3 text-base bg-ink-800 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition rounded-xl"
            >
              🎧 Apple Silicon (M1/M2/M3)
            </a>
          </div>
          <div className="mt-6">
            <a href="https://github.com/Daisuke134/anicca.ai" className="font-semibold underline">View on GitHub</a>
          </div>
        </div>
      </Container>
    </section>
  )
}


