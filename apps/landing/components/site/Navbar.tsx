import Link from 'next/link';
import { translations, type Locale } from '@/lib/i18n';

interface NavbarProps {
  locale: Locale;
}

export default function Navbar({ locale }: NavbarProps) {
  const t = translations[locale].navbar;
  const otherLocale = locale === 'en' ? 'ja' : 'en';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-6 lg:px-8">
        <Link href={`/${locale}`} className="text-xl font-bold text-foreground">
          Anicca
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <Link
            href="#vision"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t.vision}
          </Link>
          <Link
            href="#how-it-works"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t.howItWorks}
          </Link>
        </div>

        <Link
          href={`/${otherLocale}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          {locale === 'en' ? 'JA' : 'EN'}
        </Link>
      </div>
    </nav>
  );
}
