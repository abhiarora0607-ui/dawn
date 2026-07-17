"use client";

// Settings → Billing: the owner's plan, trial countdown, plan catalogue with a
// monthly/yearly toggle, mock checkout (clearly badged TEST MODE), payment
// history, and polite cancel/resume.

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { ToastProvider, useToast } from "@/components/Toast";
import { Loader2, Check, CreditCard, Sparkles, ShieldCheck, X } from "lucide-react";

const FEATURE_LABELS: Record<string, string> = {
  team: "Employee portal & team work",
  scoring: "Monthly team scoring",
  csv_import: "CSV contact import",
  item_analytics: "Item sales analytics",
  ai: "AI briefing & suggestions",
};

function Inner() {
  const { toast } = useToast();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [checkout, setCheckout] = useState<any>(null); // plan being bought
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<any>(null);

  function load() {
    fetch("/api/billing").then((r) => r.json()).then((res) => { setD(res); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function pay() {
    setPaying(true);
    try {
      const res = await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: checkout.id, cycle }) });
      const out = await res.json();
      await new Promise((r) => setTimeout(r, 1100)); // gateway feel
      if (out.ok) { setPaid(out); load(); } else toast(out.error || "Payment failed", "error");
    } catch { toast("Payment failed", "error"); }
    setPaying(false);
  }

  async function cancelOrResume(action: "cancel" | "resume") {
    await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    toast(action === "cancel" ? "Will not renew — access continues till period end" : "Auto-renew resumed");
    load();
  }

  if (loading) return <div className="p-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  if (!d || d.error) return <div className="p-12 text-center text-muted">Couldn&apos;t load billing.</div>;

  const e = d.ent;
  const statusLine =
    e.effective === "complimentary" ? "Complimentary — full access, on the house" :
    e.effective === "trialing" ? `Free trial — ${e.daysLeft} day${e.daysLeft === 1 ? "" : "s"} left (full access)` :
    e.effective === "grace" ? `Trial ended — ${e.daysLeft} day${e.daysLeft === 1 ? "" : "s"} of grace before read-only` :
    e.effective === "expired" ? "Read-only — your data is safe; upgrade to continue" :
    `${e.planName} · renews ${e.periodEnd ? new Date(e.periodEnd).toLocaleDateString() : ""}${e.cancelAtPeriodEnd ? " · will not renew" : ""}`;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-10 py-6 sm:py-8 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy">Billing</h1>
          <p className="text-muted text-sm mt-1">Your plan, payments and upgrades.</p>
        </div>
        {e.testMode && <span className="text-[10px] font-bold tracking-widest text-amber-deep bg-amber/10 border border-amber/30 px-2.5 py-1 rounded-full">TEST MODE — no real money</span>}
      </div>

      {/* Current state */}
      <div className={`dawn-card p-5 ${e.effective === "expired" ? "border-red-200" : e.effective === "grace" ? "border-amber/40" : ""}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-navy flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-amber" /></span>
            <div>
              <p className="font-semibold text-navy">{e.effective === "trialing" ? "Trial (Pro features)" : e.planName}</p>
              <p className="text-sm text-muted">{statusLine}</p>
            </div>
          </div>
          {(e.effective === "active") && (
            e.cancelAtPeriodEnd
              ? <button onClick={() => cancelOrResume("resume")} className="text-sm font-medium text-emerald-700 border border-emerald-200 px-3.5 py-2 rounded-xl hover:bg-emerald-50">Resume auto-renew</button>
              : <button onClick={() => cancelOrResume("cancel")} className="text-sm font-medium text-navy/60 border border-navy-line px-3.5 py-2 rounded-xl hover:bg-surface">Cancel at period end</button>
          )}
        </div>
      </div>

      {/* Cycle toggle */}
      <div className="flex items-center justify-center gap-2">
        <div className="flex bg-white border border-navy-line rounded-xl p-0.5">
          <button onClick={() => setCycle("monthly")} className={`px-4 py-2 rounded-lg text-sm font-medium ${cycle === "monthly" ? "bg-navy text-white" : "text-muted"}`}>Monthly</button>
          <button onClick={() => setCycle("yearly")} className={`px-4 py-2 rounded-lg text-sm font-medium ${cycle === "yearly" ? "bg-navy text-white" : "text-muted"}`}>Yearly <span className={cycle === "yearly" ? "text-amber" : "text-amber-deep"}>· 2 months free</span></button>
        </div>
      </div>

      {/* Plans */}
      <div className="grid sm:grid-cols-3 gap-3 items-stretch">
        {d.plans.map((p: any, i: number) => {
          const price = Number(cycle === "yearly" ? p.price_yearly : p.price_monthly) || 0;
          const isCurrent = e.planId === p.id && e.effective === "active";
          const popular = i === 1;
          return (
            <div key={p.id} className={`dawn-card p-5 flex flex-col ${popular ? "border-amber/50 relative" : ""}`}>
              {popular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-wide text-white bg-amber-deep px-3 py-0.5 rounded-full">POPULAR</span>}
              <p className="font-display font-semibold text-lg text-navy">{p.name}</p>
              <p className="text-xs text-muted">{p.tagline}</p>
              <p className="mt-3 mb-1"><span className="text-3xl font-bold text-navy">₹{price}</span><span className="text-sm text-muted">/{cycle === "yearly" ? "yr" : "mo"}</span></p>
              <p className="text-[11px] text-muted mb-3">{p.max_seats ? `Up to ${p.max_seats} seat${p.max_seats > 1 ? "s" : ""}` : "Unlimited seats"}</p>
              <div className="space-y-1.5 flex-1">
                {Object.entries(FEATURE_LABELS).map(([k, label]) => {
                  const on = !!p.features?.[k];
                  return (
                    <p key={k} className={`text-[13px] flex items-center gap-2 ${on ? "text-navy" : "text-navy/30 line-through"}`}>
                      {on ? <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />} {label}
                    </p>
                  );
                })}
              </div>
              <button
                onClick={() => setCheckout(p)}
                disabled={isCurrent}
                className={`mt-4 w-full py-2.5 rounded-xl text-sm font-semibold ${isCurrent ? "bg-surface text-navy/40" : popular ? "bg-amber-deep text-white hover:bg-amber-deep/90" : "bg-navy text-white hover:bg-navy-soft"}`}
              >
                {isCurrent ? "Current plan" : `Choose ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Payment history */}
      {d.payments.length > 0 && (
        <div className="dawn-card overflow-hidden">
          <p className="dawn-section-title text-sm px-4 pt-4 pb-2"><CreditCard className="w-4 h-4 text-navy/40" /> Payment history</p>
          {d.payments.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 border-b border-navy-line/40 last:border-0 text-sm">
              <div>
                <p className="font-medium text-navy">{p.plan_name} · {p.billing_cycle}</p>
                <p className="text-[11px] text-muted">{new Date(p.created_at).toLocaleDateString()} · {p.reference}{p.gateway === "mock" && " · test"}</p>
              </div>
              <span className="font-semibold text-navy">₹{Number(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---- checkout modal ---- */}
      {checkout && (
        <div className="fixed inset-0 bg-navy/40 flex items-center justify-center z-50 p-4" onClick={() => !paying && !paid && setCheckout(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5" onClick={(ev) => ev.stopPropagation()}>
            {paid ? (
              <div className="text-center py-4">
                <span className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3"><Check className="w-7 h-7 text-emerald-600" /></span>
                <p className="font-display font-semibold text-lg text-navy">Payment successful</p>
                <p className="text-sm text-muted mt-1">{paid.planName} is active. Ref: {paid.reference}</p>
                <button onClick={() => { setCheckout(null); setPaid(null); }} className="mt-5 bg-navy text-white px-6 py-2.5 rounded-xl font-medium w-full">Done</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-display font-semibold text-lg text-navy">Checkout</p>
                  {d.ent.testMode && <span className="text-[9px] font-bold tracking-widest text-amber-deep bg-amber/10 border border-amber/30 px-2 py-0.5 rounded-full">TEST MODE</span>}
                </div>
                <div className="bg-surface rounded-xl p-4 text-sm space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted">Plan</span><span className="font-medium text-navy">{checkout.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Billing</span><span className="font-medium text-navy capitalize">{cycle}</span></div>
                  <div className="flex justify-between border-t border-navy-line pt-1.5 mt-1.5"><span className="font-semibold text-navy">Total</span><span className="font-bold text-navy">₹{Number(cycle === "yearly" ? checkout.price_yearly : checkout.price_monthly) || 0}</span></div>
                </div>
                <button onClick={pay} disabled={paying} className="mt-4 w-full flex items-center justify-center gap-2 bg-navy text-white font-semibold py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
                  {paying ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <><Sparkles className="w-4 h-4 text-amber" /> Proceed to pay</>}
                </button>
                <p className="text-[10px] text-muted text-center mt-2.5">Test gateway — no real money moves. Real payments arrive with Razorpay.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <ToastProvider>
      <DashboardShell>
        <DashTopbar pageTitle="Billing" />
        <Inner />
      </DashboardShell>
    </ToastProvider>
  );
}
