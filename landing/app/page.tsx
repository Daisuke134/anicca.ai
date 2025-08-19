import { ArrowRight, Mic, Shield, Waves } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-[100svh] flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/70 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-amber-500 to-emerald-500" />
            <span className="text-lg font-semibold tracking-wide">Anicca</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">特徴</a>
            <a href="#privacy" className="hover:text-foreground">プライバシー</a>
            <a href="#how" className="hover:text-foreground">使い方</a>
          </nav>
          <Link href="#download" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground shadow-sm hover:opacity-95">
            ダウンロード <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="relative">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,hsl(28_80%_60%/.15),transparent)]" />
        </div>
        <div className="container grid gap-10 py-20 md:grid-cols-2 md:gap-14 md:py-28">
          <div className="space-y-6">
            <span className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">無常 – すべては移ろい、しかし今に寄り添う</span>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">静けさの中で動くAIアシスタント</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Aniccaは、あなたの画面に静かに寄り添い、必要なときだけ声で応えるプライバシー優先のAGI。データはあなたの手元で、心は波立たず。
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="#download" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-primary-foreground shadow-sm hover:opacity-95">
                今すぐ試す <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#features" className="inline-flex items-center gap-2 rounded-md border px-5 py-3 hover:bg-muted/50">
                機能を見る
              </Link>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Shield className="h-4 w-4" /><span>ローカル優先</span></div>
              <div className="flex items-center gap-2"><Waves className="h-4 w-4" /><span>リアルタイム音声</span></div>
              <div className="flex items-center gap-2"><Mic className="h-4 w-4" /><span>ハンズフリー</span></div>
            </div>
          </div>
          <div className="relative rounded-xl border bg-card p-6 shadow-sm">
            <div className="aspect-video w-full rounded-md bg-gradient-to-br from-emerald-600/20 to-amber-600/20 ring-1 ring-inset ring-border" />
            <div className="absolute -left-3 -top-3 h-28 w-28 rounded-full bg-emerald-500/20 blur-2xl" aria-hidden />
            <div className="absolute -bottom-6 -right-4 h-32 w-32 rounded-full bg-amber-500/20 blur-2xl" aria-hidden />
          </div>
        </div>
      </section>

      <section id="features" className="border-t py-16 md:py-20">
        <div className="container">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">必要十分、しかし上品</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">雑多なUIはありません。必要な場面だけ現れ、役目を終えると静かに退きます。</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { title: "声で即応", desc: "ノイズに強い音声起動、遅延の少ない返答。", Icon: Mic },
              { title: "画面文脈", desc: "今見ている画面に合わせて助言。", Icon: Waves },
              { title: "あなたのデータはあなたのもの", desc: "ローカル優先、鍵はあなたに。", Icon: Shield },
            ].map(({ title, desc, Icon }) => (
              <div key={title} className="rounded-lg border bg-card p-6 shadow-sm">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="privacy" className="border-t py-16 md:py-20">
        <div className="container grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">プライバシーは前提</h2>
            <p className="mt-2 text-muted-foreground">やり取りは最小限。記録は意図した時のみ。足跡は軽く、助けは深く。</p>
            <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
              <li>・ローカル暗号化と最小権限</li>
              <li>・必要なときだけ接続</li>
              <li>・透明性のある設定</li>
            </ul>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="aspect-[4/3] rounded-md bg-gradient-to-br from-emerald-600/15 to-amber-600/15 ring-1 ring-inset ring-border" />
          </div>
        </div>
      </section>

      <section id="how" className="border-t py-16 md:py-20">
        <div className="container">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">使い方は簡潔</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {[
              "アプリを起動し、音声をオンに",
              "画面に合わせて質問・指示",
              "タスクが終われば沈黙に戻る",
            ].map((step, i) => (
              <li key={i} className="rounded-lg border bg-card p-6 text-sm text-muted-foreground shadow-sm">
                <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{i + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer id="download" className="mt-auto border-t bg-background/70">
        <div className="container flex flex-col items-center gap-4 py-12 md:flex-row md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">静けさを、力に。</h3>
            <p className="mt-1 text-sm text-muted-foreground">macOS向けに提供中。その他は順次。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-primary-foreground shadow-sm hover:opacity-95" href="https://app.aniccaai.com" target="_blank" rel="noreferrer">
              Webで試す
            </a>
            <a className="inline-flex items-center gap-2 rounded-md border px-5 py-3 hover:bg-muted/50" href="https://anicca.ai" target="_blank" rel="noreferrer">
              最新情報
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}