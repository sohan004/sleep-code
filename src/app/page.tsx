import Image from "next/image";
import Link from "next/link";
import { StackPicker } from "@/components/home/StackPicker";
import { StartLink } from "@/components/StartLink";
import { ALL_FRAMEWORKS, CATALOG } from "@/lib/catalog";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const STACK_COUNT = ALL_FRAMEWORKS.length;

const steps = [
  {
    title: "Pick your stack",
    desc: "Choose backend, web, app or game, then your language and framework. The editor shows matching filenames, syntax and idioms.",
  },
  {
    title: "Go full screen",
    desc: "Hit Start, press F11 (or ⌃⌘F on Mac), and your screen becomes a convincingly active coding session.",
  },
  {
    title: "Rest up",
    desc: "SleepCode types real code indefinitely, switches between files and keeps an AI chat going. Wake up when ready.",
  },
];

const features = [
  { icon: "⌨️", title: "Human-speed typing", desc: "Character-by-character with natural pauses, auto-indent and think-time between lines." },
  { icon: "🤖", title: "Live AI chat panel", desc: "A Copilot-style conversation about the exact code on screen: reviews, edge cases, design questions." },
  { icon: "🗂️", title: "Real project trees", desc: "Each stack has its own folder structure, two working files and a plausible git branch." },
  { icon: "🎨", title: "Faithful VS Code UI", desc: "Title bar, explorer, tabs, breadcrumbs, minimap and status bar in the Dark Modern theme." },
  { icon: "🔒", title: "Runs in your browser", desc: "No accounts, no API calls, nothing to install. Close the tab and it's gone." },
  { icon: "🧩", title: `${STACK_COUNT} stacks`, desc: "From Laravel and Spring Boot to Flutter, Unity, Godot and Roblox." },
];

const faqs = [
  {
    q: "Will this actually fool my colleagues?",
    a: "The editor reproduces the VS Code layout and colours, types idiomatic code for your stack and runs an AI chat about it. From a normal viewing distance it looks like real work.",
  },
  {
    q: "Which languages and frameworks are supported?",
    a: `${STACK_COUNT} stacks across backend (Node.js, Django, Laravel, Spring Boot, ASP.NET Core, Gin, Rails and more), web (React, Vue, Angular, Svelte, Next.js, Nuxt), mobile apps (React Native, Flutter, SwiftUI, Jetpack Compose, .NET MAUI) and games (Unity, Unreal, Godot, Phaser, Pygame, LÖVE, Roblox).`,
  },
  {
    q: "How long does the session run?",
    a: "Indefinitely. It types one file, switches to the other tab, and keeps looping, with the chat conversation repeating in the background.",
  },
  {
    q: "Is any data sent to a server?",
    a: "No. SleepCode runs entirely in your browser. There are no accounts and nothing you do in the editor is sent anywhere.",
  },
  {
    q: "How do I make it full screen?",
    a: "Press F11 on Windows or Linux, or Control+Command+F on a Mac. The browser chrome disappears and the editor fills the screen.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-zinc-200">
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0a0a0f]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-md" priority />
            <span className="text-lg font-bold text-white">{SITE_NAME}</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <a href="#how-it-works" className="hidden transition-colors hover:text-white sm:block">How it works</a>
            <a href="#stacks" className="hidden transition-colors hover:text-white sm:block">Stacks</a>
            <a href="#faq" className="hidden transition-colors hover:text-white sm:block">FAQ</a>
            <a href="#pick" className="rounded-lg bg-indigo-600 px-4 py-1.5 font-semibold text-white transition-colors hover:bg-indigo-500">
              Try it →
            </a>
          </div>
        </div>
      </nav>

      <header className="relative mx-auto max-w-6xl px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
        </div>

        <p className="mb-8 inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-4 py-1.5 text-[13px] text-indigo-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
          Free · No login · {STACK_COUNT} stacks
        </p>

        <h1 className="mb-6 text-[clamp(2.5rem,7vw,5rem)] leading-[1.05] font-extrabold tracking-tight text-white">
          Look busy.{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-sky-400 bg-clip-text text-transparent">
            Code smart.
          </span>
        </h1>

        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
          A fake VS Code editor that types real code by itself, with an AI chat running alongside. Pick your stack, go
          full screen, and take that power nap.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="#pick"
            className="w-full rounded-xl bg-indigo-600 px-8 py-3.5 font-semibold text-white shadow-lg shadow-indigo-600/30 transition-colors hover:bg-indigo-500 sm:w-auto"
          >
            Pick your stack →
          </a>
          <StartLink
            href="/editor"
            className="w-full rounded-xl border border-zinc-700 px-8 py-3.5 font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white sm:w-auto"
          >
            Quick start (Next.js)
          </StartLink>
        </div>

        <EditorPreview />
      </header>

      <section id="pick" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="mb-3 text-center text-3xl font-bold text-white">Choose your coding drama</h2>
        <p className="mx-auto mb-10 max-w-xl text-center text-zinc-400">
          Backend, web, mobile or game: SleepCode writes idiomatic code for the stack your team actually uses.
        </p>
        <StackPicker />
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="mb-3 text-center text-3xl font-bold text-white">How it works</h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-zinc-400">Three steps between you and a convincing power nap.</p>
        <ol className="grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
              <div className="mb-4 text-5xl leading-none font-black text-zinc-700">0{i + 1}</div>
              <h3 className="mb-2 text-lg font-semibold text-white">{s.title}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="mb-3 text-center text-3xl font-bold text-white">Built to be convincing</h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-zinc-400">Every detail is there because someone might notice.</p>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="mb-3 text-2xl" aria-hidden>{f.icon}</div>
              <h3 className="mb-2 font-semibold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="stacks" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="mb-3 text-center text-3xl font-bold text-white">Every supported stack</h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-zinc-400">
          {STACK_COUNT} languages, frameworks and engines. Click any one to start straight away.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          {CATALOG.map((c) => (
            <div key={c.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                <span aria-hidden>{c.icon}</span> {c.label} development
              </h3>
              <dl className="space-y-3">
                {c.languages.map((l) => (
                  <div key={l.id}>
                    <dt className="mb-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase">{l.label}</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {l.frameworks.map((f) => (
                        <StartLink
                          key={f.id}
                          href={`/editor?stack=${f.id}`}
                          title={`Fake ${f.label} coding screen`}
                          className="rounded-md border border-zinc-700 px-2.5 py-1 text-sm text-zinc-300 transition-colors hover:border-indigo-500 hover:text-white"
                        >
                          {f.label}
                        </StartLink>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="mb-10 text-center text-3xl font-bold text-white">Frequently asked</h2>
        <div className="space-y-3">
          {faqs.map((faq) => (
            <details key={faq.q} className="group rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-white">
                {faq.q}
                <span className="shrink-0 text-xl leading-none text-zinc-500 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/60 to-violet-950/40 px-6 py-16 text-center">
          <h2 className="mb-4 text-3xl font-extrabold text-white sm:text-4xl">Ready for your nap?</h2>
          <p className="mx-auto mb-10 max-w-md text-zinc-400">
            Your colleagues will assume you&apos;re deep in a refactor. You&apos;ll know better.
          </p>
          <a
            href="#pick"
            className="inline-block rounded-xl bg-indigo-600 px-10 py-4 font-semibold text-white shadow-lg shadow-indigo-600/40 transition-colors hover:bg-indigo-500"
          >
            Choose a stack →
          </a>
        </div>
      </section>

      <footer className="border-t border-zinc-800 py-12 text-center text-sm text-zinc-500">
        <div className="mb-3 flex items-center justify-center gap-2">
          <Image src="/logo.png" alt="" width={20} height={20} className="h-5 w-5 rounded opacity-60" />
          <span>{SITE_NAME}</span>
        </div>
        <p>Built for developers who work hard. Sometimes.</p>
        <p className="mt-2 text-xs text-zinc-600">Not affiliated with Microsoft or Visual Studio Code.</p>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: SITE_NAME,
              url: SITE_URL,
              description: SITE_DESCRIPTION,
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
            },
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqs.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
          ]).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}

function EditorPreview() {
  const K = "text-[#c586c0]";
  const B = "text-[#569cd6]";
  const S = "text-[#ce9178]";
  const T = "text-[#4ec9b0]";
  const F = "text-[#dcdcaa]";
  const V = "text-[#9cdcfe]";
  return (
    <div
      aria-hidden
      className="mt-16 overflow-hidden rounded-2xl border border-zinc-700 bg-[#1f1f1f] text-left shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
    >
      <div className="flex items-center gap-2 border-b border-zinc-700 bg-[#181818] px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-red-500/70" />
        <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
        <span className="h-3 w-3 rounded-full bg-green-500/70" />
        <span className="ml-4 rounded-t border-t border-indigo-500 bg-[#1f1f1f] px-3 py-0.5 text-xs text-zinc-200">route.ts</span>
        <span className="px-3 py-0.5 text-xs text-zinc-500">middleware.ts</span>
      </div>
      <div className="grid md:grid-cols-[1fr_280px]">
        <div className="min-w-0 overflow-x-auto p-5 font-mono text-[13px] leading-relaxed whitespace-pre text-[#d4d4d4] md:border-r md:border-zinc-700">
          <div><span className={K}>import</span> {"{ NextRequest, NextResponse }"} <span className={K}>from</span> <span className={S}>&apos;next/server&apos;</span>;</div>
          <div><span className={K}>import</span> {"{ z }"} <span className={K}>from</span> <span className={S}>&apos;zod&apos;</span>;</div>
          <div className="mt-3"><span className={K}>export</span> <span className={B}>async function</span> <span className={F}>GET</span>(<span className={V}>request</span>: <span className={T}>NextRequest</span>) {"{"}</div>
          <div>  <span className={B}>const</span> <span className={V}>session</span> = <span className={K}>await</span> <span className={F}>auth</span>();</div>
          <div>  <span className={K}>if</span> (!<span className={V}>session</span>) {"{"}</div>
          <div>    <span className={K}>return</span> <span className={T}>NextResponse</span>.<span className={F}>json</span>({"{ error: "}<span className={S}>&apos;Unauthorised&apos;</span>{" }"}, {"{ status: "}<span className="text-[#b5cea8]">401</span>{" }"});</div>
          <div>  {"}"}</div>
          <div className="flex items-center">  <span className="text-[#6a9955]">{"// paginate results"}</span><span className="ml-0.5 inline-block h-4 w-0.5 animate-blink bg-[#d4d4d4]" /></div>
        </div>
        <div className="hidden p-4 text-xs text-zinc-400 md:block">
          <div className="mb-3 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Chat</div>
          <div className="mb-2.5 rounded-lg bg-[#2b2b2b] px-3 py-2.5 text-zinc-200">Should I use Route Handlers or Server Actions here?</div>
          <div className="px-1 leading-relaxed">
            For internal forms, <strong className="text-white">Server Actions</strong>: progressive enhancement, no manual
            fetch, built-in CSRF protection…
          </div>
        </div>
      </div>
    </div>
  );
}
