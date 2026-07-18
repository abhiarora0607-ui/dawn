"use client";

// MONEY — one hero number (MRR), then lists. Renewals due, the plans cockpit,
// coupons, and the ledger. Everything financial lives here and nowhere else.

import { useEffect, useState } from "react";
import Link from "next/link";
import { OperatorGate } from "@/components/OperatorGate";
import { Hero, Empty } from "@/components/OperatorTabs";
import { Loader2, Download, MessageCircle, Pencil, Plus } from "lucide-react";

const FEATURES = ["crm", "instagram_ai"];
const FEATURE_SHORT: Record<string, string> = { crm: "CRM & Business", instagram_ai: "Instagram & AI" };

export default function MoneyPage() {
  return <OperatorGate testMode><Money /></OperatorGate>;
}

function Money() {
  const [d, setD] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [cpCode, setCpCode] = useState(""); const [cpKind, setCpKind] = useState("percent"); const [cpValue, setCpValue] = useState("");

  function load() {
    fetch("/api/operator/billing").then((r) => r.json()).then(setD).catch(() => {});
    fetch("/api/operator/plans").then((r) => r.json()).then((x) => setPlans(x.plans || [])).catch(() => {});
    fetch("/api/operator/coupons").then((r) => r.json()).then((x) => setCoupons(x.coupons || [])).catch(() => {});
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

  async function addCoupon() {
    if (!cpCode.trim()) return;
    await fetch("/api/operator/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: cpCode, kind: cpKind, value: Number(cpValue) || 0 }) });
    setCpCode(""); setCpValue(""); load();
  }
  async function toggleCoupon(code: string, active: boolean) {
    await fetch("/api/operator/coupons", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, is_active: active }) });
    setCoupons(coupons.map((c) => (c.code === code ? { ...c, is_active: active } : c)));
  }
  function exportLedger() {
    const rows = [["date", "business", "plan", "cycle", "amount", "invoice", "status", "gateway"]];
    for (const p of d.ledger) rows.push([new Date(p.at).toISOString().slice(0, 10), p.name || p.uid, p.planName, p.cycle, String(p.amount), p.invoice_no || "", p.status, p.gateway]);
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "dawn-payments.csv"; a.click();
  }

  if (!d) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  const m = d.metrics;

  const line = m.mrr > 0 ? `₹${m.mrr.toLocaleString()} a month` : "No revenue yet";
  const sub = m.mrr > 0
    ? `${m.paying} paying · ${m.trialing} on trial · ₹${m.totalRevenue.toLocaleString()} collected all time`
    : `${m.trialing} businesses on trial. The first sale starts here.`;

  return (
    <>
      <Hero line={line} sub={sub} />

      {/* Renewals due */}
      {d.renewalsSoon?.length > 0 && (
        <div className="dawn-card p-4">
          <p className="text-sm font-semibold text-navy mb-2">Renewals due this week</p>
          <div className="space-y-1.5">
            {d.renewalsSoon.map((t: any) => (
              <div key={t.uid} className="flex items-center justify-between bg-surface rounded-xl px-3 py-2.5 text-sm gap-2">
                <Link href={`/operator/b/${encodeURIComponent(t.uid)}`} className="min-w-0 truncate hover:text-emerald-700">
                  <span className="font-medium text-navy">{t.name || t.uid.slice(0, 14)}</span>
                  <span className="text-muted"> · {t.planName}</span>
                  {t.cancelAtPeriodEnd && <span className="text-red-500 text-xs"> · cancelling</span>}
                </Link>
                <span className="flex items-center gap-2 shrink-0">
                  {t.wa && <a href={`https://wa.me/${t.wa}?text=${encodeURIComponent(`Hi! Your Dawn plan renews in ${t.daysLeft} day${t.daysLeft === 1 ? "" : "s"}. Anything you'd like changed before then?`)}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-emerald-700 border border-emerald-200 px-2 py-1 rounded-lg hover:bg-emerald-50">Nudge</a>}
                  <span className="text-muted text-xs">{t.daysLeft}d</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plans */}
      <div className="dawn-card p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-navy">Plans</p>
          <button onClick={() => setEdit({ new: true, name: "", tagline: "", price_monthly: 0, price_yearly: 0, trial_days: 14, max_seats: "", sort_order: plans.length + 1, is_active: true, features: {} })}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-deep border border-amber/40 px-3 py-1.5 rounded-lg hover:bg-amber/5"><Plus className="w-4 h-4" /> New</button>
        </div>
        <div className="space-y-2">
          {[...plans].sort((a, b) => Number(b.is_active !== false) - Number(a.is_active !== false)).map((p) => {
            const counts = d.byPlan.find((x: any) => x.id === p.id);
            return (
              <div key={p.id} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${p.is_active ? "border-navy-line bg-white" : "border-navy-line/50 bg-surface opacity-60"}`}>
                <div className="min-w-0">
                  <p className="font-semibold text-navy text-sm">{p.name} <span className="font-normal text-muted">· ₹{p.price_monthly}/mo · ₹{p.price_yearly}/yr</span>{!p.is_active && <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded ml-1.5">RETIRED</span>}</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {FEATURES.filter((f) => p.features?.[f]).map((f) => FEATURE_SHORT[f]).join(" + ") || "No areas"}
                    {counts ? ` — ${counts.active} paying, ${counts.trialing} trialing` : ""}
                  </p>
                </div>
                <button onClick={() => setEdit({ ...p })} className="shrink-0 text-navy/50 hover:text-navy"><Pencil className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted mt-3">Editing a price never changes what existing subscribers pay.</p>
      </div>

      {/* Coupons */}
      <div className="dawn-card p-5">
        <p className="font-semibold text-navy mb-3">Coupons</p>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <label className="block text-xs text-muted">Code<input value={cpCode} onChange={(e) => setCpCode(e.target.value.toUpperCase())} placeholder="LAUNCH20" className="inp mt-1 w-36" /></label>
          <label className="block text-xs text-muted">Type
            <select value={cpKind} onChange={(e) => setCpKind(e.target.value)} className="inp mt-1 w-40">
              <option value="percent">% off</option><option value="flat">₹ off</option><option value="first_free">First period free</option>
            </select>
          </label>
          {cpKind !== "first_free" && <label className="block text-xs text-muted">Value<input type="number" value={cpValue} onChange={(e) => setCpValue(e.target.value)} className="inp mt-1 w-24" /></label>}
          <button onClick={addCoupon} className="bg-navy text-white text-sm font-medium px-4 py-2 rounded-xl">Create</button>
        </div>
        {coupons.length === 0 ? <p className="text-xs text-muted">No coupons yet.</p> : (
          <div className="space-y-1.5">
            {coupons.map((c) => (
              <div key={c.code} className="flex items-center justify-between text-sm border border-navy-line rounded-xl px-3 py-2">
                <span className={c.is_active ? "text-navy" : "text-navy/40 line-through"}>
                  <strong>{c.code}</strong> <span className="text-muted">· {c.kind === "first_free" ? "first period free" : c.kind === "flat" ? `₹${c.value} off` : `${c.value}% off`} · used {c.redeemed || 0}</span>
                </span>
                <button onClick={() => toggleCoupon(c.code, !c.is_active)} className="text-xs font-medium text-navy/50 hover:text-navy">{c.is_active ? "Disable" : "Enable"}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ledger */}
      <div className="dawn-card overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="font-semibold text-navy text-sm">Payments</p>
          {d.ledger.length > 0 && <button onClick={exportLedger} className="flex items-center gap-1.5 text-xs font-medium text-navy/60 hover:text-navy"><Download className="w-3.5 h-3.5" /> CSV</button>}
        </div>
        {d.ledger.length === 0 ? <p className="px-4 pb-5 text-sm text-muted">No payments yet.</p> : d.ledger.map((p: any) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-2.5 border-t border-navy-line/40 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-navy truncate">{p.name || p.uid.slice(0, 14)} <span className="text-muted font-normal">· {p.planName}</span></p>
              <p className="text-[11px] text-muted">{new Date(p.at).toLocaleDateString()} · {p.invoice_no || p.reference}{p.gateway === "mock" && " · test"}</p>
            </div>
            <span className="font-semibold text-navy shrink-0">₹{p.amount.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* plan editor */}
      {edit && (
        <div className="fixed inset-0 bg-navy/40 flex items-center justify-center z-50 p-4" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                <span className="text-muted text-xs">Areas included</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {FEATURES.map((f) => (
                    <button key={f} onClick={() => setEdit({ ...edit, features: { ...edit.features, [f]: !edit.features?.[f] } })}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border ${edit.features?.[f] ? "bg-navy text-white border-navy" : "text-navy/60 border-navy-line"}`}>{FEATURE_SHORT[f]}</button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-navy"><input type="checkbox" checked={edit.is_active !== false} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>
            </div>
            <button onClick={savePlan} disabled={saving || !edit.name} className="mt-4 w-full bg-navy text-white font-semibold py-2.5 rounded-xl disabled:opacity-50">{saving ? "Saving…" : "Save plan"}</button>
          </div>
        </div>
      )}
    </>
  );
}
