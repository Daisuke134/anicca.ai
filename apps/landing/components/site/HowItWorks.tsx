import Section from '@/components/base/Section'

const steps = [
  { n: 1, title: 'Onboard', text: 'Tell Anicca your ideal day, the habits to build—and the ones to quit.' },
  { n: 2, title: 'Lead', text: 'Anicca prepares in advance and triggers at the right moment.' },
  { n: 3, title: 'Act', text: 'Routines and good deeds move first. You follow—and your day starts to run itself in the direction you chose.' },
]

export default function HowItWorks() {
  return (
    <Section id="how-it-works">
        <h2 className="text-3xl font-bold text-center">How It Works</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground text-xl font-bold">
                {s.n}
              </div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
    </Section>
  )
}


