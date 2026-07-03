import BriefingDemo from "@/components/BriefingDemo";
import { DawnLogo } from "@/components/DawnLogo";
import { Sunrise, Brain, Eye, PenLine, Check } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-navy/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <DawnLogo className="h-7" />
          <a
            href="#waitlist"
            className="text-sm font-medium bg-navy text-white px-4 py-2 rounded-lg hover:bg-navy-soft transition-colors"
          >
            Join the waitlist
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: "var(--dawn-glow)" }}>
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-deep bg-amber/10 px-3 py-1.5 rounded-full mb-6">
              <Sunrise className="w-3.5 h-3.5" /> Your AI Instagram manager
            </span>
            <h1 className="text-5xl sm:text-6xl font-bold text-navy leading-[1.05] tracking-tight">
              Wake up knowing<br />what to do.
            </h1>
            <p className="mt-6 text-lg text-navy/60 leading-relaxed max-w-md">
              Every morning, Dawn reads your Instagram, tells you what changed, and hands you a plan of
              action. Not another dashboard — an AI that decides for you.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a
                href="#waitlist"
                className="inline-flex items-center justify-center bg-navy text-white font-medium px-6 py-3 rounded-xl hover:bg-navy-soft transition-colors"
              >
                Get early access
              </a>
              <a
                href="#how"
                className="inline-flex items-center justify-center border border-navy/15 text-navy font-medium px-6 py-3 rounded-xl hover:border-navy/30 transition-colors"
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 text-xs text-navy/40">Free while in beta · Built for creators, brands & agencies</p>
          </div>

          {/* Live product demo */}
          <div className="flex justify-center lg:justify-end">
            <BriefingDemo />
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-navy">Everyone shows you data.<br />Nobody tells you what to do.</h2>
        <p className="mt-5 text-navy/60 text-lg max-w-2xl mx-auto leading-relaxed">
          Schedulers post on time. Analytics tools show charts. AI writers spit out captions when you ask.
          You&apos;re still the one stitching it together at 11pm, guessing what actually moves the needle.
          Dawn closes that gap — it does the thinking, so you just act.
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="bg-surface py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-navy text-center mb-14">One AI that runs your morning</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Eye,
                title: "It watches everything",
                body: "Reach, followers, saves, DMs, and what your competitors are publicly posting — read and understood overnight.",
              },
              {
                icon: Brain,
                title: "It remembers you",
                body: "Your voice, your winning hooks, your offers and goals live in Dawn's memory, so every suggestion fits your brand.",
              },
              {
                icon: PenLine,
                title: "It tells you what to do",
                body: "A ranked plan each morning: which DMs to reply to, what to post, when, and the hook to use. You tap approve.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-7 border border-navy/5">
                <div className="w-11 h-11 rounded-xl bg-navy flex items-center justify-center mb-5">
                  <f.icon className="w-5 h-5 text-amber" />
                </div>
                <h3 className="font-semibold text-navy text-lg mb-2">{f.title}</h3>
                <p className="text-navy/60 text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-navy text-center mb-12">Built for people who live on Instagram</h2>
        <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {[
            "Agencies managing many client accounts",
            "D2C & e-commerce brands tracking real revenue",
            "Coaches and consultants building an audience",
            "Creators who want growth without the grind",
          ].map((t) => (
            <div key={t} className="flex items-center gap-3 bg-white border border-navy/10 rounded-xl px-5 py-4">
              <span className="w-6 h-6 rounded-full bg-amber/15 flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 text-amber-deep" />
              </span>
              <span className="text-navy font-medium text-sm">{t}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Waitlist CTA */}
      <section id="waitlist" className="bg-navy py-20">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <Sunrise className="w-10 h-10 text-amber mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-white">Start every day ahead.</h2>
          <p className="mt-4 text-white/60 text-lg">
            Dawn is in early access. Join the waitlist and be first to wake up to your briefing.
          </p>
          <form className="mt-8 flex flex-col sm:flex-row gap-3 max-w-md mx-auto" action="#" method="post">
            <input
              type="email"
              required
              placeholder="you@brand.com"
              className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/40 focus:outline-none focus:border-amber"
            />
            <button
              type="submit"
              className="bg-amber text-navy font-semibold px-6 py-3 rounded-xl hover:bg-amber-deep hover:text-white transition-colors"
            >
              Join waitlist
            </button>
          </form>
          <p className="mt-3 text-white/30 text-xs">No spam. Just your spot in line.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-navy/5 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <DawnLogo className="h-6" />
          <p className="text-navy/40 text-xs">© {new Date().getFullYear()} Dawn · Wake up knowing what to do.</p>
        </div>
      </footer>
    </main>
  );
}
