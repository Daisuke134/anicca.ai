import Container from '@/components/base/Container'

const items = [
  { title: 'Local‑first', text: 'Session and schedules live in ~/.anicca.' },
  { title: 'Least privilege', text: 'Public PKCE + short‑lived tokens; OAuth tokens stay server‑side.' },
  { title: 'No telemetry', text: 'No analytics collection.' },
  { title: 'No screen recording', text: 'The app does not capture or upload screenshots.' },
  { title: 'Minimal audio streaming', text: 'Audio streams to the realtime model only to enable the experience.' },
  { title: 'Local logs', text: 'Logs stay on your Mac.' },
]

export default function Privacy() {
  return (
    <section id="privacy" className="py-16 bg-ivory-50">
      <Container>
        <h2 className="text-3xl font-bold text-center">Privacy‑first by design</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {items.map((i) => (
            <div key={i.title} className="flex gap-4">
              <div className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-white font-bold">✓</div>
              <div>
                <h3 className="font-semibold">{i.title}</h3>
                <p className="text-ink-600">{i.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <div className="mx-auto text-5xl">🔒</div>
          <p className="mt-2 font-semibold text-ink-800">Your data belongs only to you</p>
        </div>
      </Container>
    </section>
  )
}


