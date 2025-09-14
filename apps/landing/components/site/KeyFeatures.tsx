import Container from '@/components/base/Container'
import { Card, CardText, CardTitle } from '@/components/ui/card'
import FadeIn from '@/components/base/FadeIn'

const features = [
  { icon: '🎯', title: 'Leads, not waits', text: 'Anicca moves first at the right moment.' },
  { icon: '🎙️', title: 'Voice‑only, tray‑only', text: 'No UI to manage—works for anyone.' },
  { icon: '🔁', title: 'Habit engine', text: 'Schedules that run themselves; today’s view auto‑generated.' },
  { icon: '💬', title: 'Slack follow‑through', text: 'Drafts ready at your set times; you just say “send”.' },
  { icon: '🔒', title: 'Privacy‑first', text: 'Local‑first, least privilege, no telemetry.' },
  { icon: '🧩', title: 'Open Source', text: 'Transparent by default.' },
]

export default function KeyFeatures() {
  return (
    <section id="features" className="py-16 bg-white">
      <Container>
        <h2 className="text-3xl font-bold text-center">Key Features</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {features.map((f) => (
            <FadeIn key={f.title}>
            <Card className="p-6 hover:shadow-md transition">
              <div className="text-3xl mb-3">{f.icon}</div>
              <CardTitle>{f.title}</CardTitle>
              <CardText className="mt-2">{f.text}</CardText>
            </Card>
            </FadeIn>
          ))}
        </div>
      </Container>
    </section>
  )
}


