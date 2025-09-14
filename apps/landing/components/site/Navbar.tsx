import Link from 'next/link'
import Container from '@/components/base/Container'

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-ivory-300">
      <Container>
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center font-bold">
            <span className="bg-gradient-to-r from-ink-800 to-saffron-500 bg-clip-text text-transparent">Anicca</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-ink-700">
            <a href="#features">Features</a>
            <a href="#privacy">Privacy</a>
            <a href="#how-it-works">How It Works</a>
            <a href="/pricing">Pricing</a>
            <a href="/faq">FAQ</a>
            <a href="#download">Download</a>
            <a href="https://app.aniccaai.com" target="_blank" rel="noreferrer" className="font-semibold">Web App</a>
          </div>
        </div>
      </Container>
    </nav>
  )
}


