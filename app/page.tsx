import BriefingDemo from "@/components/BriefingDemo";
import WaitlistForm from "@/components/WaitlistForm";
import { DawnLogo } from "@/components/DawnLogo";
import { Sunrise, Brain, Eye, PenLine, Check, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-cream">
      {/* Nav */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-cream/80 border-b border-navy-line">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <DawnLogo className="h-7" />
          <div className="flex items-center gap-2 sm:gap-4">
            <a href="/pricing" className="text-sm font-medium text-navy/70 hover:text-navy px-2 py-2">Pricing</a>
            <a href="#waitlist" className="text-sm font-medium bg-navy text-white px-4 py-2 rounded-xl hover:bg-navy-soft transition-colors">
              Join the waitlist
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: "var(--dawn-hero)" }}>
        <div className="absolute inset-0" style={{ background: "var(--dawn-glow)" }} />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-16 sm:pt-20 pb-16 sm:pb-24 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-deep bg-white/70 border border-amber/20 px-3 py-1.5 rounded-full mb-6 shadow-sm">
              <Sunrise className="w-3.5 h-3.5" /> Your AI Instagram manager
            </span>
            <h1 className="font-display font-semibold text-navy leading-[1.02] tracking-tight text-[2.75rem] sm:text-6xl">
              Wake up<br />knowing<br /><span className="text-amber-deep">what to do.</span>
            </h1>
            <p className="mt-6 text-lg text-muted leading-relaxed max-w-md">
              Every morning, Dawn reads your Instagram and your sales, tells you what changed, and hands you a plan. Plus a built-in CRM to manage leads, orders, and money — all in one place.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a href="#waitlist" className="inline-flex items-center justify-center bg-navy text-white font-medium px-6 py-3.5 rounded-2xl hover:bg-navy-soft transition-colors shadow-card">
                Get early access
              </a>
              <a href="/dashboard" className="inline-flex items-center justify-center bg-white/60 border border-navy-line text-navy font-medium px-6 py-3.5 rounded-2xl hover:bg-white transition-colors">
                Try it free
              </a>
            </div>
            <p className="mt-4 text-xs text-muted">Free 14-day trial · Built for creators, brands &amp; agencies</p>
          </div>

          <div className="flex justify-center lg:justify-end animate-rise-slow">
            <BriefingDemo />
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="max-w-4xl mx-auto px-5 sm:px-6 py-20 sm:py-24 text-center">
        <p className="text-xs font-semibold text-amber-deep uppercase tracking-[0.2em] mb-4">The gap</p>
        <h2 className="font-display font-semibold text-navy text-3xl sm:text-[2.5rem] leading-tight">
          Everyone shows you data.<br />Nobody tells you what to do.
        </h2>
        <p className="mt-6 text-muted text-lg max-w-2xl mx-auto leading-relaxed">
          Schedulers post on time. Analytics tools show charts. AI writers spit out captions when you ask. You&apos;re still the one stitching it together at 11pm, guessing what actually moves the needle. Dawn closes that gap — it does the thinking, so you just act.
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="bg-surface-warm py-20 sm:py-24 border-y border-navy-line">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-amber-deep uppercase tracking-[0.2em] mb-4">How it works</p>
            <h2 className="font-display font-semibold text-navy text-3xl sm:text-[2.5rem]">One AI that runs your morning</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 stagger">
            {[
              { icon: Eye, title: "It watches everything", body: "Reach, followers, saves, DMs, and what your competitors are publicly posting — read and understood overnight." },
              { icon: Brain, title: "It remembers you", body: "Your voice, your winning hooks, your offers and goals live in Dawn's memory, so every suggestion fits your brand." },
              { icon: PenLine, title: "It runs your business", body: "A built-in CRM: track leads through your pipeline, record orders, manage employees, and see revenue, expenses, and profit — no spreadsheets." },
            ].map((f) => (
              <div key={f.title} className="bg-cream rounded-2xl p-7 border border-navy-line shadow-card hover:shadow-card-hover transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-navy flex items-center justify-center mb-5">
                  <f.icon className="w-5 h-5 text-amber" />
                </div>
                <h3 className="font-semibold text-navy text-lg mb-2">{f.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="max-w-5xl mx-auto px-5 sm:px-6 py-20 sm:py-24">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold text-amber-deep uppercase tracking-[0.2em] mb-4">Who it's for</p>
          <h2 className="font-display font-semibold text-navy text-3xl sm:text-[2.5rem]">Built for people who live on Instagram</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {[
            "Agencies managing many client accounts",
            "D2C & e-commerce brands tracking real revenue",
            "Coaches and consultants building an audience",
            "Creators who want growth without the grind",
          ].map((t) => (
            <div key={t} className="flex items-center gap-3 bg-cream border border-navy-line rounded-2xl px-5 py-4 shadow-card">
              <span className="w-6 h-6 rounded-full bg-amber/15 flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 text-amber-deep" />
              </span>
              <span className="text-navy font-medium text-sm">{t}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Waitlist CTA */}
      <section id="waitlist" className="relative bg-navy py-20 sm:py-24 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-amber/10 rounded-full blur-3xl" />
        <div className="relative max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <Sunrise className="w-10 h-10 text-amber mx-auto mb-6 animate-float" />
          <h2 className="font-display font-semibold text-white text-3xl sm:text-[2.5rem]">Start every day ahead.</h2>
          <p className="mt-4 text-white/60 text-lg">
            Dawn is in early access. Join the waitlist and be first to wake up to your briefing.
          </p>
          <WaitlistForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-navy-line py-8 bg-cream">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <DawnLogo className="h-6" />
          <p className="text-muted text-xs">© {new Date().getFullYear()} Dawn · Wake up knowing what to do.</p>
          <div className="flex gap-4 text-xs text-muted">
            <a href="/privacy" className="hover:text-navy">Privacy</a>
            <a href="/data-deletion" className="hover:text-navy">Data deletion</a>
            <a href="/dashboard" className="hover:text-navy">Open app</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
