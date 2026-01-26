import Link from 'next/link';
import { translations, type Locale } from '@/lib/i18n';

interface FooterProps {
  locale: Locale;
}

export default function Footer({ locale }: FooterProps) {
  const t = translations[locale].footer;

  return (
    <footer className="border-t border-border bg-background py-8">
      <div className="text-center">
        <p className="font-bold text-foreground">Anicca</p>

        <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
          <Link href={`/privacy/${locale}`} className="transition-colors hover:text-foreground">
            {t.privacy}
          </Link>
          <span>|</span>
          <Link href={`/terms/${locale}`} className="transition-colors hover:text-foreground">
            {t.terms}
          </Link>
          <span>|</span>
          <Link href="/tokushoho" className="transition-colors hover:text-foreground">
            {t.tokushoho}
          </Link>
          <span>|</span>
          <a
            href="mailto:keiodaisuke@gmail.com"
            className="transition-colors hover:text-foreground"
          >
            {t.contact}
          </a>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Anicca. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
