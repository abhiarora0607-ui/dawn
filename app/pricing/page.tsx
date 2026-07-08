"use client";

import { useState } from "react";
import Link from "next/link";
import { DawnLogo } from "@/components/DawnLogo";
import { Check, Sunrise, ArrowRight } from "lucide-react";

const PLANS = [
  {
    name: "Starter", tagline: "For creators finding their rhythm",
    monthly: 599, annual: 479, currency: "₹",
    features: [
      "Daily AI briefing on your account",
      "AI captions, hashtags & content ideas",
      "Weekly content calendar & carousels",
      "Brand voice & persona learning",
      "1 Instagram account",
    ],
    cta: "Start free trial", highlight: false,
  },
  {
    name: "Pro", tagline: "For brands serious about growth",
    monthly: 999, annual: 799, currency: "₹",
    features: [
      "Everything in Starter",
      "Auto comment & DM replies",
      "Competitor analysis & AI suggestions",
      "Image analysis & enhancement",
      "Priority AI processing",
      "1 Instagram account",
    ],
    cta: "Start free trial", highlight: true,
  },
  {
    name: "Agency", tagline: "For teams managing many accounts",
    monthly: 3499, annual: 2799, currency: "₹",
    features: [
      "Everything in Pro",
      "Up to 10 Instagram accounts",
      "Unified multi-account dashboard",
      "Client-ready reports",
      "Priority support",
    ],
    cta: "Start free trial", highlight: false,
  },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <main className="min-h-screen bg-cream">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-cream/80 border-b border-navy-line">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/"><DawnLogo className="h-10" /></Link>
          <Link href="/dashboard" className="text-sm font-medium bg-navy text-white px-4 py-2 rounded-xl hover:bg-navy-soft transition-colors">
            Open Dawn
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 sm:px-6 pt-16 pb-10 text-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-deep bg-white border border-amber/20 px-3 py-1.5 rounded-full mb-6 shadow-sm">
          <Sunrise className="w-3.5 h-3.5" /> Simple, flat pricing
        </span>
        <h1 className="font-display font-semibold text-navy text-4xl sm:text-5xl leading-tight">
          Pricing that never<br />punishes your growth.
        </h1>
        <p className="mt-5 text-muted text-lg max-w-xl mx-auto">
          Flat monthly plans — not per-follower, not per-contact. Every plan includes full AI. Start free, upgrade when you&apos;re ready.
        </p>

        <div className="mt-8 inline-flex items-center gap-3 bg-white border border-navy-line rounded-full p-1">
          <button onClick={() => setAnnual(false)} className={`text-sm font-medium px-5 py-2 rounded-full transition-colors ${!annual ? "bg-navy text-white" : "text-muted"}`}>Monthly</button>
          <button onClick={() => setAnnual(true)} className={`text-sm font-medium px-5 py-2 rounded-full transition-colors flex items-center gap-1.5 ${annual ? "bg-navy text-white" : "text-muted"}`}>
            Annual <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${annual ? "bg-amber text-navy" : "bg-amber/15 text-amber-deep"}`}>-20%</span>
          </button>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 sm:px-6 pb-20 grid md:grid-cols-3 gap-5">
        {PLANS.map((plan) => (
          <div key={plan.name} className={`relative rounded-3xl p-7 flex flex-col ${plan.highlight ? "bg-navy text-white shadow-glow ring-2 ring-amber" : "bg-white border border-navy-line shadow-card"}`}>
            {plan.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold uppercase tracking-wide bg-amber text-navy px-3 py-1 rounded-full">Most popular</span>
            )}
            <h3 className={`font-display font-semibold text-xl ${plan.highlight ? "text-white" : "text-navy"}`}>{plan.name}</h3>
            <p className={`text-sm mt-1 ${plan.highlight ? "text-white/60" : "text-muted"}`}>{plan.tagline}</p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className={`text-4xl font-bold ${plan.highlight ? "text-white" : "text-navy"}`}>{plan.currency}{annual ? plan.annual : plan.monthly}</span>
              <span className={`text-sm ${plan.highlight ? "text-white/50" : "text-muted"}`}>/mo</span>
            </div>
            {annual && <p className={`text-xs mt-1 ${plan.highlight ? "text-amber" : "text-amber-deep"}`}>billed annually</p>}

            <Link href={`/dashboard?trial=${plan.name.toLowerCase()}`} className={`mt-6 flex items-center justify-center gap-2 font-medium px-5 py-3 rounded-2xl transition-colors ${plan.highlight ? "bg-amber text-navy hover:bg-amber-glow" : "bg-navy text-white hover:bg-navy-soft"}`}>
              {plan.cta} <ArrowRight className="w-4 h-4" />
            </Link>
            <p className={`text-center text-xs mt-2 ${plan.highlight ? "text-white/40" : "text-muted"}`}>14 days free · no card needed</p>

            <div className="mt-6 space-y-3 pt-6 border-t border-white/10">
              {plan.features.map((f) => (
                <div key={f} className="flex items-start gap-2.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${plan.highlight ? "bg-amber/20" : "bg-amber/15"}`}>
                    <Check className={`w-3 h-3 ${plan.highlight ? "text-amber" : "text-amber-deep"}`} />
                  </span>
                  <span className={`text-sm ${plan.highlight ? "text-white/85" : "text-navy/75"}`}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="max-w-2xl mx-auto px-5 sm:px-6 pb-24 text-center">
        <h2 className="font-display font-semibold text-navy text-2xl mb-3">Questions?</h2>
        <p className="text-muted">Every plan starts with a 14-day free trial — no card required. You only pay when you&apos;re sure Dawn earns its place in your morning.</p>
      </section>

      <footer className="border-t border-navy-line py-8 bg-cream">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <DawnLogo className="h-9" />
          <p className="text-muted text-xs">© {new Date().getFullYear()} Dawn</p>
          <div className="flex gap-4 text-xs text-muted">
            <Link href="/privacy" className="hover:text-navy">Privacy</Link>
            <Link href="/pricing" className="hover:text-navy">Pricing</Link>
            <Link href="/dashboard" className="hover:text-navy">Open app</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
