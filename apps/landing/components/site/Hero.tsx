import { translations, type Locale } from '@/lib/i18n';

interface HeroProps {
  locale: Locale;
}

export default function Hero({ locale }: HeroProps) {
  const t = translations[locale].hero;

  return (
    <section className="flex h-dvh items-center justify-center bg-background px-6">
      <h1 className="text-6xl font-bold text-foreground text-balance md:text-8xl">
        {t.headline}
      </h1>
    </section>
  );
}
