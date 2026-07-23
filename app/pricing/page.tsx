"use client";

// Public pricing — rendered from the live plans table, so the operator's
// pricing cockpit is the single source of truth. Change a price in the
// console and this page changes; no deploy, no drift.

import { useEffect, useState } from "react";
import Link from "next/link";
import { DawnLogo } from "@/components/DawnLogo";
import { PublicFooter } from "@/components/PublicFooter";
import { Check, X, ArrowRight, Loader2, Sunrise } from "lucide-react";

const AREA_ROWS: { key: string; label: string; detail: string }[] = [
  { key: "crm", label: "CRM & Business", detail: "Contacts & lead pipeline · Orders & payments · Finance and profit · Team portal & scoring · Public price list & receipts" },
  { key: "instagram_ai", label: "Instagram & AI", detail: "Daily AI briefing · Content ideas & captions · Carousels & calendar · Brand voice · Competitor watch" },
];

export default function Pricing() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [trialDays, setTrialDays] = useState(14);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public-plans").then((r) => r.json()).then((d) => {
      setPlans(d.plans || []); setTrialDays(d.trialDays || 14); setLoading(false);
    }).catch(() => { setLoadErr("Couldn't load this page — check your connection."); setLoading(false); });
  }, []);

  return (
    <>
      <main className="min-h-screen bg-cream">
        <header className="sticky top-0 z-50 backdrop-blur-md bg-cream/80 border-b border-navy-line">
          <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
            {loadErr && <p className="t-small text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{loadErr} <button onClick={() => location.reload()} className="underline font-medium">Try again</button></p>}
            <Link href="/"><DawnLogo className="h-10" /></Link>
            <Link href="/signin" className="text-sm font-medium bg-navy text-white px-4 py-2 rounded-xl hover:bg-navy-soft">Start free trial</Link>
          </div>
        </header>

        <section className="max-w-6xl mx-auto px-5 sm:px-6 pt-14 pb-6 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-deep bg-white border border-amber/20 px-3 py-1.5 rounded-full mb-5">
            <Sunrise className="w-3.5 h-3.5" /> {trialDays} days free — full access, no card
          </span>
          <h1 className="font-display font-semibold text-4xl sm:text-5xl text-navy tracking-tight">Buy the half you need.<br className="hidden sm:block" /> Or both.</h1>
          <p className="text-navy/60 mt-4 max-w-lg mx-auto">Dawn is two products in one: an AI manager for your Instagram, and a full CRM for your business. Take one, or take everything for less than both.</p>

          <div className="flex justify-center mt-8">
            <div className="flex bg-white border border-navy-line rounded-xl p-0.5">
              <button onClick={() => setCycle("monthly")} className={`px-5 py-2 rounded-lg text-sm font-medium ${cycle === "monthly" ? "bg-navy text-white" : "text-navy/60"}`}>Monthly</button>
              <button onClick={() => setCycle("yearly")} className={`px-5 py-2 rounded-lg text-sm font-medium ${cycle === "yearly" ? "bg-navy text-white" : "text-navy/60"}`}>
                Yearly <span className={cycle === "yearly" ? "text-amber" : "text-amber-deep"}>· 2 months free</span>
              </button>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-5 sm:px-6 pb-16">
          {loading ? (
            <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>
          ) : plans.length === 0 ? (
            <p className="text-center text-navy/50 py-16">Pricing is being updated — please check back shortly.</p>
          ) : (
            <div className="grid md:grid-cols-3 gap-4 items-stretch">
              {plans.map((p: any, i: number) => {
                const price = Number(cycle === "yearly" ? p.price_yearly : p.price_monthly) || 0;
                const best = Object.values(p.features || {}).filter(Boolean).length > 1;
                return (
                  <div key={p.id} className={`relative bg-white rounded-2xl border p-6 flex flex-col ${best ? "border-amber shadow-[0_8px_30px_rgba(255,158,67,0.15)]" : "border-navy-line shadow-[0_2px_10px_rgba(22,35,63,0.04)]"}`}>
                    {best && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[12px] font-bold tracking-wide text-white bg-amber-deep px-3 py-0.5 rounded-full">BEST VALUE</span>}
                    <p className="font-display font-semibold text-xl text-navy">{p.name}</p>
                    <p className="text-sm text-navy/50 mt-0.5 min-h-[40px]">{p.tagline}</p>
                    <p className="mt-4 mb-1">
                      <span className="text-4xl font-bold text-navy">₹{price.toLocaleString()}</span>
                      <span className="text-sm text-navy/50">/{cycle === "yearly" ? "year" : "month"}</span>
                    </p>
                    <p className="text-[12px] text-navy/40 mb-5">{p.max_seats ? `Up to ${p.max_seats} seat${p.max_seats > 1 ? "s" : ""}` : "Unlimited team members"}</p>

                    <div className="space-y-3 flex-1">
                      {AREA_ROWS.map((a) => {
                        const on = !!p.features?.[a.key];
                        return (
                          <div key={a.key} className={on ? "" : "opacity-40"}>
                            <p className={`text-sm font-semibold flex items-center gap-2 ${on ? "text-navy" : "text-navy/50 line-through"}`}>
                              {on ? <Check className="w-4 h-4 text-emerald-500 shrink-0" /> : <X className="w-4 h-4 shrink-0" />} {a.label}
                            </p>
                            {on && <p className="text-[12px] text-navy/45 leading-relaxed mt-1 pl-6">{a.detail}</p>}
                          </div>
                        );
                      })}
                    </div>

                    <Link href="/signin" className={`mt-6 w-full flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-semibold ${best ? "bg-amber-deep text-white hover:bg-amber-deep/90" : "bg-navy text-white hover:bg-navy-soft"}`}>
                      Start {trialDays}-day free trial <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-12 max-w-2xl mx-auto space-y-5 text-sm">
            <Faq q={`What happens after the ${trialDays} days?`} a="Nothing is charged automatically. When the trial ends you choose a plan to keep working — and everything you built stays safe and exportable either way." />
            <Faq q="Can I switch plans later?" a="Yes, any time from Settings → Billing. And if you're already paying, a price change never affects the period you've paid for." />
            <Faq q="Is there a contract or cancellation fee?" a="No. Cancel whenever you like; you keep access until the end of the period you paid for. See our refunds policy." />
            <Faq q="Do I need a card to start?" a="No card to start the trial." />
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="bg-white border border-navy-line rounded-xl p-4">
      <p className="font-semibold text-navy">{q}</p>
      <p className="text-navy/60 mt-1 leading-relaxed">{a}</p>
    </div>
  );
}
