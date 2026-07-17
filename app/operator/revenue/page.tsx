"use client";

// The revenue console: MRR, conversion, the trial funnel with an "expiring
// soon" sales list, the plans manager (the pricing cockpit), and the payments
// ledger. Badged TEST MODE while money is mock — so fiction never reads as
// fact.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, IndianRupee, TrendingUp, Users, Clock, Pencil, Plus, ArrowLeft, Download, Flame } from "lucide-react";

const FEATURES = ["team", "scoring", "csv_import", "item_analytics", "ai"];
const FEATURE_SHORT: Record<string, string> = { team: "Team", scoring: "Scoring", csv_import: "CSV import", item_analytics: "Item analytics", ai: "AI" };

export default function RevenuePage() {
  const [d, setD] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<any>(null); // plan being edited (or {new:true})
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([
      fetch("/api/operator/billing").then((r) => r.json()),
      fetch("/api/operator/plans").then((r) => r.json()),
    ]).then(([bill, pl]) => {
      if (bill.error) { window.location.href = "/operator"; return; }
      setD(bill); setPlans(pl.plans || []); setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function savePlan() {
    setSaving(true);
    const body: any = {
      name: edit.name, tagline: edit.tagline,
      price_monthly: Number(edit.price_monthly) || 0, price_yearly: Number(edit.price_yearly) || 0,
      trial_days: Number(edit.trial_days) || 14,
      max_seats: edit.max_seats === "" || edit.max_seats == null ? null : Number(edit.max_seats),
      sort_order: Number(edit.sort_order) || 0, is_active: edit.is_active !== false,
      features: FEATURES.reduce((acc: any, f) => { acc[f] = !!edit.features?.[f]; return acc; }, {}),
    };
    if (!edit.new) body.id = edit.id;
    await fetch("/api/operator/plans", { method: edit.new ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false); setEdit(null); load();
  }

  function exportLedger() {
    const rows = [["date", "business", "plan", "cycle", "amount", "status", "gateway", "reference"]];
    for (const p of d.ledger) rows.push([new Date(p.at).toISOString().slice(0, 10), p.name || p.uid, p.planName, p.cycle, String(p.amount), p.status, p.gateway, p.reference]);
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "dawn-payments.csv"; a.click();
  }

  if (loading) return <div className="min-h-screen dawn-app-bg flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  if (!d) return null;
  const m = d.metrics;

  return (
    <div className="min-h-screen dawn-app-bg">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Link href="/operator" className="flex items-center gap-1.5 text-sm text-muted hover:text-navy mb-2"><ArrowLeft className="w-4 h-4" /> Console</Link>
            <h1 className="font-display font-semibold text-2xl text-navy">Revenue</h1>
          </div>
          {d.testMode && <span className="text-[10px] font-bold tracking-widest text-amber-deep bg-amber/10 border border-amber/30 px-3 py-1.5 rounded-full">TEST MODE — all money below is mock</span>}
        </div>

        {/* Headline metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="MRR" value={`₹${m.mrr.toLocaleString()}`} sub={`≈ ₹${m.arr.toLocaleString()}/yr${m.growthPct != null ? ` · ${m.growthPct >= 0 ? "+" : ""}${m.growthPct}% 4-wk` : ""}`} icon={IndianRupee} />
          <Stat label="Revenue to date" value={`₹${m.totalRevenue.toLocaleString()}`} sub={`ARPU ₹${m.arpu.toLocaleString()}/mo`} icon={TrendingUp} />
          <Stat label="Paying" value={String(m.paying)} sub={`${m.complimentary} complimentary · ${m.cancelled} cancelling`} icon={Users} />
          <Stat label="Trials" value={String(m.trialing)} sub={`${m.conversion}% convert · ${m.lapsedTrials} lapsed`} icon={Clock} />
        </div>

        {/* Expiring soon — the sales list */}
        {d.expiringSoon.length > 0 && (
          <div className="dawn-card p-4">
            <p className="dawn-section-title text-sm mb-2"><Flame className="w-4 h-4 text-amber-deep" /> Trials expiring within 7 days — reach out today</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {d.expiringSoon.map((t: any) => (
                <Link key={t.uid} href={`/operator/b/${encodeURIComponent(t.uid)}`} className="flex items-center justify-between bg-surface rounded-xl px-3 py-2.5 hover:bg-amber/5 text-sm">
                  <span className="font-medium text-navy truncate">{t.name || t.uid.slice(0, 14)}</span>
                  <span className={`shrink-0 font-semibold ${t.daysLeft <= 2 ? "text-red-600" : "text-amber-deep"}`}>{t.daysLeft}d left</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Plans manager */}
        <div className="dawn-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="dawn-section-title">Plans</p>
            <button onClick={() => setEdit({ new: true, name: "", tagline: "", price_monthly: 0, price_yearly: 0, trial_days: 14, max_seats: "", sort_order: plans.length + 1, is_active: true, features: {} })} className="flex items-center gap-1.5 text-sm font-medium text-amber-deep border border-amber/40 px-3 py-1.5 rounded-lg hover:bg-amber/5"><Plus className="w-4 h-4" /> New plan</button>
          </div>
          <div className="space-y-2">
            {plans.map((p) => {
              const counts = d.byPlan.find((x: any) => x.id === p.id);
              return (
                <div key={p.id} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${p.is_active ? "border-navy-line bg-white" : "border-navy-line/50 bg-surface opacity-60"}`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-navy text-sm">{p.name} <span className="font-normal text-muted">· ₹{p.price_monthly}/mo · ₹{p.price_yearly}/yr · {p.trial_days}d trial · {p.max_seats ?? "∞"} seats</span>{!p.is_active && <span className="text-red-500 text-xs"> · archived</span>}</p>
                    <p className="text-[11px] text-muted mt-0.5">{FEATURES.filter((f) => p.features?.[f]).map((f) => FEATURE_SHORT[f]).join(" · ") || "No extra features"}{counts ? ` — ${counts.active} paying, ${counts.trialing} trialing` : ""}</p>
                  </div>
                  <button onClick={() => setEdit({ ...p })} className="shrink-0 text-navy/50 hover:text-navy"><Pencil className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted mt-3">Price changes never touch existing subscribers — everyone keeps the price they bought at.</p>
        </div>

        {/* Ledger */}
        <div className="dawn-card overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="dawn-section-title text-sm">Payments ledger</p>
            {d.ledger.length > 0 && <button onClick={exportLedger} className="flex items-center gap-1.5 text-xs font-medium text-navy/60 hover:text-navy"><Download className="w-3.5 h-3.5" /> CSV</button>}
          </div>
          {d.ledger.length === 0 ? (
            <p className="px-4 pb-5 text-sm text-muted">No payments yet. When a business checks out, it lands here.</p>
          ) : d.ledger.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 border-t border-navy-line/40 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-navy truncate">{p.name || p.uid.slice(0, 14)} <span className="text-muted font-normal">· {p.planName} · {p.cycle}</span></p>
                <p className="text-[11px] text-muted">{new Date(p.at).toLocaleString()} · {p.reference}{p.gateway === "mock" && " · TEST"}</p>
              </div>
              <span className={`font-semibold shrink-0 ${p.status === "succeeded" ? "text-navy" : "text-red-600"}`}>₹{p.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] text-muted">Privacy wall unchanged: plans and payments only — never customer content.</p>
      </div>

      {/* ---- plan editor ---- */}
      {edit && (
        <div className="fixed inset-0 bg-navy/40 flex items-center justify-center z-50 p-4" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-5 max-h-[85vh] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
            <p className="font-display font-semibold text-lg text-navy mb-4">{edit.new ? "New plan" : `Edit ${edit.name}`}</p>
            <div className="space-y-3 text-sm">
              <label className="block"><span className="text-muted text-xs">Name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="inp mt-1" /></label>
              <label className="block"><span className="text-muted text-xs">Tagline</span><input value={edit.tagline || ""} onChange={(e) => setEdit({ ...edit, tagline: e.target.value })} className="inp mt-1" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-muted text-xs">₹ / month</span><input type="number" value={edit.price_monthly} onChange={(e) => setEdit({ ...edit, price_monthly: e.target.value })} className="inp mt-1" /></label>
                <label className="block"><span className="text-muted text-xs">₹ / year</span><input type="number" value={edit.price_yearly} onChange={(e) => setEdit({ ...edit, price_yearly: e.target.value })} className="inp mt-1" /></label>
                <label className="block"><span className="text-muted text-xs">Trial days</span><input type="number" value={edit.trial_days} onChange={(e) => setEdit({ ...edit, trial_days: e.target.value })} className="inp mt-1" /></label>
                <label className="block"><span className="text-muted text-xs">Max seats (blank = ∞)</span><input type="number" value={edit.max_seats ?? ""} onChange={(e) => setEdit({ ...edit, max_seats: e.target.value })} className="inp mt-1" /></label>
              </div>
              <div>
                <span className="text-muted text-xs">Features included</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {FEATURES.map((f) => (
                    <button key={f} onClick={() => setEdit({ ...edit, features: { ...edit.features, [f]: !edit.features?.[f] } })}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border ${edit.features?.[f] ? "bg-navy text-white border-navy" : "text-navy/60 border-navy-line"}`}>
                      {FEATURE_SHORT[f]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-navy"><input type="checkbox" checked={edit.is_active !== false} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Active (visible to buyers)</label>
            </div>
            <button onClick={savePlan} disabled={saving || !edit.name} className="mt-4 w-full bg-navy text-white font-semibold py-2.5 rounded-xl disabled:opacity-50">{saving ? "Saving…" : "Save plan"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, icon: Icon }: { label: string; value: string; sub: string; icon: any }) {
  return (
    <div className="dawn-stat">
      <span className="absolute top-0 left-0 h-0.5 w-full bg-gradient-to-r from-amber-deep/60 to-amber/30" />
      <div className="flex items-center gap-1.5 mb-1.5"><Icon className="w-4 h-4 text-amber-deep" /><span className="text-xs text-muted font-medium">{label}</span></div>
      <p className="text-2xl font-bold text-navy leading-none">{value}</p>
      <p className="text-[11px] text-muted mt-1.5">{sub}</p>
    </div>
  );
}
