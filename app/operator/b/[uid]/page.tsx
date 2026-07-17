"use client";

// One business, from above — usage shape and your private notes. Still zero
// customer content: counts, dates, and an activity sparkline only.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Loader2, ArrowLeft, Instagram, MessageCircle, Mail, Trash2, StickyNote,
} from "lucide-react";

export default function BusinessDetail() {
  const params = useParams();
  const uid = decodeURIComponent(params.uid as string);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [authed, setAuthed] = useState(true);
  const [bill, setBill] = useState<any>(null);       // this business's subscription
  const [allPlans, setAllPlans] = useState<any[]>([]);
  const [planPick, setPlanPick] = useState("");
  const [acting, setActing] = useState(false);

  function load() {
    fetch(`/api/operator/business?uid=${encodeURIComponent(uid)}`).then(async (r) => {
      if (r.status === 401) { setAuthed(false); return; }
      setD(await r.json()); setLoading(false);
    }).catch(() => setLoading(false));
  }
  function loadBilling() {
    fetch("/api/operator/billing").then((r) => r.json()).then((b) => {
      if (b?.subs) setBill(b.subs.find((s: any) => s.uid === uid) || null);
    }).catch(() => {});
    fetch("/api/operator/plans").then((r) => r.json()).then((p) => setAllPlans((p.plans || []).filter((x: any) => x.is_active))).catch(() => {});
  }
  useEffect(() => { load(); loadBilling(); /* eslint-disable-next-line */ }, [uid]);

  async function billingAct(action: string, extra: any = {}) {
    setActing(true);
    await fetch("/api/operator/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, action, ...extra }) });
    setActing(false); loadBilling();
  }

  async function addNote() {
    if (!note.trim()) return;
    await fetch("/api/operator/business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, note }) });
    setNote(""); load();
  }
  async function delNote(id: string) {
    await fetch(`/api/operator/business?id=${id}`, { method: "DELETE" });
    load();
  }

  if (!authed) return <Wrap><p className="text-center text-muted py-20">Session expired. <Link href="/operator" className="text-amber-deep">Sign in</Link>.</p></Wrap>;
  if (loading) return <Wrap><div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div></Wrap>;
  if (!d || d.error) return <Wrap><p className="text-center text-muted py-20">Couldn&apos;t load.</p></Wrap>;

  const maxWeek = Math.max(1, ...(d.weeks || []));
  const wa = (d.whatsapp || "").replace(/[^0-9]/g, "");

  return (
    <Wrap>
      <Link href="/operator" className="flex items-center gap-1.5 text-sm text-muted hover:text-navy mb-5"><ArrowLeft className="w-4 h-4" /> All businesses</Link>

      <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-2xl text-navy flex items-center gap-2">
              {d.name || "Unnamed business"}
              {d.instagram?.length > 0 && <Instagram className="w-5 h-5 text-navy/30" />}
            </h1>
            <p className="text-sm text-muted mt-1">
              {d.businessType || "—"} · joined {d.signedUp ? new Date(d.signedUp).toLocaleDateString() : "—"}
              {d.daysQuiet != null ? ` · last seen ${d.daysQuiet === 0 ? "today" : `${d.daysQuiet}d ago`}` : " · no activity signal yet"}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" className="p-2 rounded-lg bg-emerald-500 text-white" title="WhatsApp"><MessageCircle className="w-4 h-4" /></a>}
            {d.email && <a href={`mailto:${d.email}`} className="p-2 rounded-lg border border-navy-line text-navy" title="Email"><Mail className="w-4 h-4" /></a>}
          </div>
        </div>
        {(d.email || d.phone) && <p className="text-xs text-muted mt-2">{[d.email, d.phone].filter(Boolean).join(" · ")}</p>}
      </div>

      {/* Usage counts */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[["Contacts", d.counts.contacts], ["Orders", d.counts.orders], ["Employees", d.counts.employees], ["Tasks", d.counts.tasks]].map(([l, v]: any) => (
          <div key={l} className="bg-white rounded-2xl border border-navy-line p-4 shadow-card text-center">
            <p className="text-xl font-bold text-navy">{v}</p>
            <p className="text-[10px] text-muted uppercase tracking-wide">{l}</p>
          </div>
        ))}
      </div>

      {/* Activity shape */}
      <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card mb-4">
        <p className="text-sm font-semibold text-navy mb-3">Activity, last 12 weeks</p>
        <div className="flex items-end gap-1 h-20">
          {(d.weeks || []).map((n: number, i: number) => (
            <div key={i} className="flex-1 bg-amber/70 rounded-t" style={{ height: `${(n / maxWeek) * 100}%`, minHeight: n > 0 ? 3 : 0 }} title={`${n} events`} />
          ))}
        </div>
        <p className="text-[10px] text-muted mt-1">Event volume only — never what the events were.</p>
      </div>

      {/* Instagram */}
      {d.instagram?.length > 0 && (
        <div className="bg-white rounded-2xl border border-navy-line p-4 shadow-card mb-4">
          <p className="text-sm font-semibold text-navy mb-2">Instagram</p>
          {d.instagram.map((g: any, i: number) => (
            <p key={i} className="text-xs text-muted">Connected {new Date(g.connectedAt).toLocaleDateString()} · {g.live ? "token active" : "disconnected (link kept)"}</p>
          ))}
        </div>
      )}

      {/* Your private notes */}
      {/* Billing — plan, trial, and the operator's sales levers */}
      <div className="dawn-card p-5">
        <p className="text-sm font-semibold text-navy mb-3">Billing</p>
        {!bill ? (
          <p className="text-xs text-muted">No subscription row yet — it appears on their first visit after V25, or use an action below to create one.</p>
        ) : (
          <p className="text-sm text-navy mb-1">
            <span className={`font-semibold ${bill.status === "complimentary" ? "text-emerald-600" : bill.status === "active" ? "text-navy" : "text-amber-deep"}`}>{bill.status}</span>
            <span className="text-muted"> · {bill.planName} · {bill.cycle}</span>
            {bill.trialEndsAt && bill.status === "trialing" && <span className="text-muted"> · trial ends {new Date(bill.trialEndsAt).toLocaleDateString()}</span>}
            {bill.periodEnd && bill.status !== "trialing" && <span className="text-muted"> · period ends {new Date(bill.periodEnd).toLocaleDateString()}</span>}
            {bill.hasPaid && <span className="text-emerald-600"> · has paid</span>}
            {bill.cancelAtPeriodEnd && <span className="text-red-500"> · cancelling</span>}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button disabled={acting} onClick={() => billingAct("extend_trial", { days: 7 })} className="text-xs font-medium border border-navy-line text-navy px-3 py-1.5 rounded-lg hover:bg-surface disabled:opacity-50">Extend trial +7d</button>
          <button disabled={acting} onClick={() => billingAct("complimentary")} className="text-xs font-medium border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50 disabled:opacity-50">Mark complimentary</button>
          <span className="flex items-center gap-1.5">
            <select value={planPick} onChange={(e) => setPlanPick(e.target.value)} className="text-xs border border-navy-line rounded-lg px-2 py-1.5 text-navy bg-white">
              <option value="">Change plan…</option>
              {allPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {planPick && <button disabled={acting} onClick={() => { billingAct("change_plan", { planId: planPick }); setPlanPick(""); }} className="text-xs font-medium bg-navy text-white px-3 py-1.5 rounded-lg disabled:opacity-50">Apply</button>}
          </span>
          <button disabled={acting} onClick={() => billingAct("cancel")} className="text-xs font-medium border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50">Cancel</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
        <p className="text-sm font-semibold text-navy flex items-center gap-1.5 mb-3"><StickyNote className="w-4 h-4 text-amber-deep" /> Your notes on this business</p>
        <div className="flex gap-2 mb-3">
          <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder="Called them, they want X…" className="flex-1 px-3 py-2 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
          <button onClick={addNote} className="bg-navy text-white px-4 rounded-xl text-sm hover:bg-navy-soft">Save</button>
        </div>
        {d.notes?.length === 0 ? <p className="text-xs text-muted">No notes yet.</p> : (
          <div className="space-y-2">
            {d.notes.map((n: any) => (
              <div key={n.id} className="flex items-start justify-between gap-2 text-sm border-b border-navy-line/40 last:border-0 pb-2">
                <div className="min-w-0"><p className="text-navy">{n.note}</p><p className="text-[10px] text-muted">{new Date(n.created_at).toLocaleString()}</p></div>
                <button onClick={() => delNote(n.id)} className="p-1 text-navy/30 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted text-center mt-6 pb-6">Counts, dates and your notes only — their customers&apos; data never reaches this screen.</p>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen dawn-app-bg"><div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">{children}</div></div>;
}
