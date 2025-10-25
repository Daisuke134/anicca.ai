import Link from 'next/link'
import Container from '@/components/base/Container'

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur border-b border-border">
      <Container>
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center font-bold">
            <span className="text-foreground">Anicca</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features">Features</a>
            <a href="#privacy">Privacy</a>
            <a href="#how-it-works">How It Works</a>
            <a href="/faq">FAQ</a>
            <a href="#download">Download</a>
            <a href="https://app.aniccaai.com" target="_blank" rel="noreferrer" className="font-semibold">Web App</a>
          </div>
        </div>
      </Container>
    </nav>
  )
}

