"use client";

// The employee's leave. Three things they actually want: what they have, how
// to ask for time off, and how to cash in what they won't use.
//
// The application form shows every type's balance in the dropdown itself, so
// nobody applies for days they don't have and then waits three days to find
// out. When a balance is short, the form says exactly what will be unpaid
// before they send it — surprises about pay are the worst kind.

import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, Check, X, CalendarDays, Wallet, AlertTriangle, Clock,
} from "lucide-react";
import { istDate } from "@/lib/attendance";

export function TeamLeave() {
  const [d, setD] = useState<any>(null);
  const [view, setView] = useState<"balances" | "apply" | "encash">("balances");

  function load() { fetch("/api/team/leave").then((r) => r.json()).then(setD).catch(() => {}); }
  useEffect(() => { load(); }, []);

  if (!d) return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  if (d.error) return <p className="text-sm text-muted py-8 text-center">{d.error}</p>;
  if (!d.enabled) return <p className="text-sm text-muted py-8 text-center">Leave isn&apos;t switched on for this business yet.</p>;

  const pending = (d.requests || []).filter((r: any) => r.status === "pending");

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {([["balances", "My leave"], ["apply", "Apply"], ["encash", "Encash"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${view === k ? "bg-navy text-white border-navy" : "text-navy/60 border-navy-line"}`}>
            {label}{k === "balances" && pending.length > 0 ? ` · ${pending.length}` : ""}
          </button>
        ))}
      </div>

      {view === "balances" && <Balances d={d} onChange={load} />}
      {view === "apply" && <Apply d={d} onDone={() => { load(); setView("balances"); }} />}
      {view === "encash" && <Encash />}
    </div>
  );
}

/* -------------------------------------------------------------- balances */

function Balances({ d, onChange }: { d: any; onChange: () => void }) {
  async function cancel(id: string) {
    await fetch("/api/team/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", id }) });
    onChange();
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {d.types.filter((t: any) => !t.infinite).map((t: any) => (
          <div key={t.code} className="dawn-card p-3.5">
            <p className="text-xs text-muted truncate">{t.label}</p>
            <p className="font-display font-semibold text-2xl text-navy mt-0.5">
              {t.available}
              <span className="text-sm font-normal text-muted"> {t.available === 1 ? "day" : "days"}</span>
            </p>
            {t.carriedIn > 0 && <p className="text-[11px] text-sky-600 mt-0.5">{t.carriedIn} carried over</p>}
            {!t.bookable && <p className="text-[11px] text-amber-deep mt-0.5">Needs your date of birth</p>}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted text-center">Unpaid leave is always available if you run out.</p>

      {d.requests?.length > 0 && (
        <div className="dawn-card overflow-hidden">
          <p className="text-xs font-semibold text-navy px-4 pt-3.5 pb-1">Your requests</p>
          {d.requests.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-navy-line/40">
              <div className="min-w-0">
                <p className="text-sm text-navy font-medium truncate">
                  {r.code === "unpaid" ? "Unpaid Leave" : (d.types.find((t: any) => t.code === r.code)?.label || r.code)}
                  <span className="font-normal text-muted"> · {r.days} {r.days === 1 ? "day" : "days"}</span>
                </p>
                <p className="text-[11px] text-muted">
                  {new Date(r.from_date).toLocaleDateString()}
                  {r.to_date !== r.from_date && ` – ${new Date(r.to_date).toLocaleDateString()}`}
                  {r.is_unpaid_fallback && <span className="text-amber-deep"> · partly unpaid</span>}
                </p>
              </div>
              <span className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  r.status === "approved" ? "bg-emerald-50 text-emerald-700"
                  : r.status === "rejected" ? "bg-red-50 text-red-600"
                  : r.status === "cancelled" ? "bg-slate-100 text-slate-400"
                  : "bg-amber/15 text-amber-deep"}`}>{r.status}</span>
                {r.status === "pending" && <button onClick={() => cancel(r.id)} className="text-navy/30 hover:text-red-500"><X className="w-4 h-4" /></button>}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- apply */

function Apply({ d, onDone }: { d: any; onDone: () => void }) {
  const [from, setFrom] = useState(istDate());
  const [to, setTo] = useState(istDate());
  const [code, setCode] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string | null>(null);

  // Working days between the dates, so the count on screen matches what the
  // request will actually cost.
  const dayCount = useMemo(() => {
    if (!from || !to || to < from) return 0;
    let n = 0;
    let cur = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();
    while (cur <= end && n < 400) {
      const wd = new Date(cur).getUTCDay();
      if (!(d.weeklyOffs || []).includes(wd)) n++;
      cur += 86400000;
    }
    return halfDay && n === 1 ? 0.5 : n;
  }, [from, to, halfDay, d.weeklyOffs]);

  const chosen = d.types.find((t: any) => t.code === code);
  const shortfall = chosen && !chosen.infinite ? Math.max(0, dayCount - chosen.available) : 0;

  async function submit() {
    setErr(""); setBusy(true);
    const res = await fetch("/api/team/leave", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, from, to, halfDay, reason }),
    });
    const out = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(out.error || "Couldn't send that."); return; }
    setDone(out.note || "Sent to your manager.");
  }

  if (done) {
    return (
      <div className="dawn-card p-6 text-center">
        <span className="w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3"><Check className="w-5 h-5 text-emerald-600" /></span>
        <p className="font-semibold text-navy">Leave requested</p>
        <p className="text-sm text-muted mt-1">{done}</p>
        <button onClick={onDone} className="text-xs text-amber-deep underline mt-3">Back to my leave</button>
      </div>
    );
  }

  return (
    <div className="dawn-card p-5 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="text-xs text-muted">From</span>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} className="inp mt-1" /></label>
        <label className="block"><span className="text-xs text-muted">To</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="inp mt-1" /></label>
      </div>

      <div className="flex items-center justify-between bg-surface rounded-xl px-3 py-2">
        <span className="text-sm text-navy font-medium">{dayCount} {dayCount === 1 ? "day" : "days"}</span>
        {from === to && (
          <label className="flex items-center gap-1.5 text-xs text-navy">
            <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} /> Half day
          </label>
        )}
      </div>
      <p className="text-[11px] text-muted -mt-1">Weekly offs and holidays in between don&apos;t count.</p>

      <label className="block">
        <span className="text-xs text-muted">Type of leave</span>
        <select value={code} onChange={(e) => setCode(e.target.value)} className="inp mt-1">
          <option value="">Select…</option>
          {d.types.map((t: any) => (
            <option key={t.code} value={t.code} disabled={!t.bookable}>
              {t.label} · {t.balanceLabel}{!t.bookable ? " (needs date of birth)" : ""}
            </option>
          ))}
        </select>
      </label>

      {shortfall > 0 && (
        <p className="text-xs text-amber-deep flex items-start gap-1.5 bg-amber/5 border border-amber/20 rounded-xl px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          You have {chosen.available} {chosen.available === 1 ? "day" : "days"} left, so {shortfall} of these will be unpaid. The days are still recorded.
        </p>
      )}

      <label className="block">
        <span className="text-xs text-muted">Reason (optional)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Family function out of town" className="inp mt-1 resize-none" />
      </label>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button onClick={submit} disabled={busy || !code || dayCount <= 0} className="w-full bg-navy text-white font-semibold py-3 rounded-xl disabled:opacity-50">
        {busy ? "Sending…" : "Request leave"}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- encash */

function Encash() {
  const [d, setD] = useState<any>(null);
  const [code, setCode] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  function load() { fetch("/api/team/encash").then((r) => r.json()).then(setD).catch(() => {}); }
  useEffect(() => { load(); }, []);

  async function submit() {
    setErr(""); setBusy(true);
    const res = await fetch("/api/team/encash", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, days: Number(days) }),
    });
    const out = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(out.error || "Couldn't send that."); return; }
    setSent(true); setDays(""); load();
  }

  if (!d) return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-navy/30" /></div>;

  const estimate = code && days ? Math.round(d.perDay * Number(days)) : 0;

  return (
    <div className="dawn-card p-5 space-y-3">
      <div>
        <p className="font-semibold text-navy text-sm flex items-center gap-1.5"><Wallet className="w-4 h-4 text-amber-deep" /> Cash in unused leave</p>
        <p className="text-xs text-muted mt-0.5">Once your manager approves, it&apos;s added to your next salary.</p>
      </div>

      {sent && <p className="text-sm text-emerald-600">Request sent. You&apos;ll see it below once it&apos;s decided.</p>}

      {d.options?.length === 0 ? (
        <p className="text-sm text-muted">You don&apos;t have any leave that can be encashed right now.</p>
      ) : (
        <>
          <label className="block">
            <span className="text-xs text-muted">Which leave?</span>
            <select value={code} onChange={(e) => setCode(e.target.value)} className="inp mt-1">
              <option value="">Select…</option>
              {d.options.map((o: any) => <option key={o.code} value={o.code}>{o.label} · {o.available} available</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted">How many days?</span>
            <input type="number" step="0.5" min="0.5" value={days} onChange={(e) => setDays(e.target.value)} className="inp mt-1" />
          </label>
          {estimate > 0 && (
            <p className="text-sm text-navy bg-surface rounded-xl px-3 py-2">
              About <strong>₹{estimate.toLocaleString()}</strong>
              <span className="text-muted text-xs"> · based on ₹{d.perDay}/day. Your manager confirms the final amount.</span>
            </p>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button onClick={submit} disabled={busy || !code || !days} className="w-full bg-navy text-white font-semibold py-3 rounded-xl disabled:opacity-50">
            {busy ? "Sending…" : "Request encashment"}
          </button>
        </>
      )}

      {d.requests?.length > 0 && (
        <div className="pt-3 border-t border-navy-line">
          <p className="text-xs font-semibold text-navy mb-2">Your requests</p>
          {d.requests.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between text-xs py-1">
              <span className="text-navy">{r.label} · {r.days} {r.days === 1 ? "day" : "days"}</span>
              <span className={`font-medium ${r.status === "paid" ? "text-emerald-600" : r.status === "approved" ? "text-sky-600" : r.status === "rejected" ? "text-red-500" : "text-amber-deep"}`}>
                {r.status === "approved" ? "approved · next salary" : r.status === "paid" ? `paid ${r.paid_in_month || ""}` : r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
