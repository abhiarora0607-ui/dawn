"use client";

// The employee's side of attendance: one big button, their own history, and a
// way to fix a day they got wrong.
//
// The punch button asks the browser for a location. If the person refuses, the
// punch still goes through — it's simply recorded without a location. Refusing
// to record someone's shift because their phone wouldn't share GPS would turn
// a permissions dialog into a pay dispute.

import { useEffect, useState } from "react";
import {
  Loader2, LogIn, LogOut, Clock, AlertTriangle, MapPin,
  CalendarClock, Plus, X, Check, History,
} from "lucide-react";
import { fmtDuration, minutesToLabel, istMinutes, CLASS_LABEL, istDate } from "@/lib/attendance";

export function TeamAttendance() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "warn" | "err" } | null>(null);
  const [blockedHelp, setBlockedHelp] = useState(false);
  const [view, setView] = useState<"today" | "history" | "fix">("today");
  const [tick, setTick] = useState(0);

  function load() {
    fetch("/api/team/attendance").then((r) => r.json()).then(setD).catch(() => {});
  }
  useEffect(() => { load(); }, []);
  // Keep the running shift timer honest.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  async function punch() {
    setBusy(true); setMsg(null);
    // Ask for a coarse fix first. enableHighAccuracy demands GPS-grade
    // precision, which a laptop can't provide and a phone indoors often can't
    // either — the request then hangs until it times out and we lose the
    // location entirely. A wifi-level fix is usually plenty, and it arrives in
    // a second rather than eight.
    //
    // We pass the accuracy along too: the server needs to know whether a
    // position is trustworthy before it decides someone isn't at work.
    const getPos = (highAccuracy: boolean, timeout: number) =>
      new Promise<{ pos: GeolocationPosition | null; denied: boolean }>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ pos, denied: false }),
          (err) => resolve({ pos: null, denied: err.code === 1 }),
          { enableHighAccuracy: highAccuracy, timeout, maximumAge: 60000 },
        );
      });

    let coords: { lat: number | null; lng: number | null; accuracy: number | null; denied: boolean } =
      { lat: null, lng: null, accuracy: null, denied: false };
    if (navigator.geolocation) {
      let r = await getPos(false, 8000);
      // A refusal won't change on a second ask, so don't make them wait for it.
      if (!r.pos && !r.denied) r = await getPos(true, 8000);
      if (r.pos) {
        coords = { lat: r.pos.coords.latitude, lng: r.pos.coords.longitude, accuracy: r.pos.coords.accuracy ?? null, denied: false };
      } else {
        coords = { lat: null, lng: null, accuracy: null, denied: r.denied };
      }
    } else {
      coords.denied = true;
    }

    const res = await fetch("/api/team/attendance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(coords),
    });
    const out = await res.json();
    setBusy(false);

    if (!res.ok) {
      setMsg({ text: out.error || "Couldn't record that.", tone: "err" });
      // A blocked punch must never be a dead end — point them at the fix
      // request so a day they actually worked can still be recorded.
      if (out.blocked && out.canRegularize) setBlockedHelp(true);
      return;
    }
    if (out.flagged) setMsg({ text: `Recorded — but you're ${out.note?.replace("Punched ", "") || "away from the shop"}. Your manager will see this.`, tone: "warn" });
    else setMsg({ text: out.action === "in" ? "Punched in. Have a good shift." : "Punched out. See you tomorrow.", tone: "ok" });
    load();
  }

  if (!d) return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  if (d.error) return <p className="text-sm text-muted py-8 text-center">{d.error}</p>;
  if (d.exempt) return <p className="text-sm text-muted py-8 text-center">You&apos;re not required to mark attendance.</p>;
  if (!d.enabled) return <p className="text-sm text-muted py-8 text-center">Attendance isn&apos;t switched on for this business yet.</p>;

  const openMins = d.openSince ? Math.max(0, Math.round((Date.now() - new Date(d.openSince).getTime()) / 60000)) : 0;
  const totalToday = d.todayMinutes + (d.punchedIn ? openMins : 0);
  const pct = Math.min(100, Math.round((totalToday / (d.requiredHours * 60)) * 100));

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- PUNCH */}
      <div className="dawn-card p-5 text-center">
        <p className="text-xs uppercase tracking-wide text-muted font-semibold">
          {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </p>

        <p className="font-display font-semibold text-3xl text-navy mt-2">{fmtDuration(totalToday)}</p>
        <p className="text-sm text-muted">
          {d.punchedIn ? `On shift since ${minutesToLabel(istMinutes(d.openSince))}` : totalToday > 0 ? "worked today" : "not started yet"}
          {` · ${d.requiredHours}h expected`}
        </p>

        <div className="h-2 rounded-full bg-surface overflow-hidden my-4 max-w-xs mx-auto">
          <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-amber"}`} style={{ width: `${pct}%` }} />
        </div>

        <button onClick={punch} disabled={busy}
          className={`w-full max-w-xs mx-auto flex items-center justify-center gap-2 font-semibold py-4 rounded-2xl text-white transition-colors disabled:opacity-60 ${d.punchedIn ? "bg-amber-deep hover:bg-amber" : "bg-navy hover:bg-navy-soft"}`}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : d.punchedIn ? <LogOut className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
          {busy ? "Recording…" : d.punchedIn ? "Punch out" : "Punch in"}
        </button>

        {msg && (
          <p className={`text-sm mt-3 ${msg.tone === "err" ? "text-red-600" : msg.tone === "warn" ? "text-amber-deep" : "text-emerald-600"}`}>{msg.text}</p>
        )}
        {blockedHelp && (
          <div className="mt-3 bg-amber/5 border border-amber/30 rounded-xl px-3 py-2.5 text-left">
            <p className="text-xs text-navy">
              If you did work today, you can still record it: use <strong>Fix a day</strong> below and your manager will review it.
            </p>
            <button onClick={() => { setView("fix"); setBlockedHelp(false); }} className="text-xs font-semibold text-amber-deep underline mt-1">
              Open Fix a day
            </button>
          </div>
        )}

        {d.shopSet && !d.remote && (
          <p className="text-[12px] text-muted mt-3 flex items-center justify-center gap-1">
            <MapPin className="w-3 h-3" /> {d.enforceGeofence ? "You need to be at the shop to mark attendance." : "Marked from outside the shop? It still records, and your manager sees it."}
          </p>
        )}
        {d.remote && <p className="text-[12px] text-muted mt-3">You&apos;re set up to work remotely — punch from anywhere.</p>}
      </div>

      {/* today's sessions */}
      {d.todayLogs?.length > 0 && (
        <div className="dawn-card p-4">
          <p className="text-xs font-semibold text-navy mb-2">Today&apos;s sessions</p>
          <div className="space-y-1.5">
            {d.todayLogs.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between text-sm">
                <span className="text-navy">
                  {minutesToLabel(istMinutes(l.punch_in))} → {l.punch_out ? minutesToLabel(istMinutes(l.punch_out)) : <span className="text-amber-deep">still in</span>}
                </span>
                <span className="text-muted text-xs">
                  {l.punch_out ? fmtDuration(Math.round((new Date(l.punch_out).getTime() - new Date(l.punch_in).getTime()) / 60000)) : "—"}
                  {l.within_fence === false && <span className="text-amber-deep ml-1.5">off-site</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ SUB-VIEWS */}
      <div className="flex gap-1.5">
        {([["today", "Today"], ["history", "My attendance"], ["fix", "Fix a day"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${view === k ? "bg-navy text-white border-navy" : "text-navy/60 border-navy-line"}`}>{label}</button>
        ))}
      </div>

      {view === "history" && <History30 days={d.days} />}
      {view === "fix" && <FixDay onDone={load} />}
    </div>
  );
}

/* --------------------------------------------------------------- history */

function History30({ days }: { days: any[] }) {
  return (
    <div className="dawn-card overflow-hidden">
      {[...days].reverse().map((day: any) => {
        const c = day.classification;
        const isOff = c === "weekly_off" || c === "holiday" || c === "not_joined";
        return (
          <div key={day.work_date} className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-navy-line/40 last:border-0 ${isOff ? "bg-surface/40" : ""}`}>
            <span className="text-sm text-navy font-medium min-w-0">
              {new Date(`${day.work_date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              {day.holiday_name && <span className="text-[12px] text-sky-600 ml-1.5">{day.holiday_name}</span>}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {day.worked_minutes > 0 && <span className="text-xs text-muted">{fmtDuration(day.worked_minutes)}</span>}
              {day.late_minutes > 0 && <span className="text-[12px] text-amber-deep">{fmtDuration(day.late_minutes)} late</span>}
              <span className={`text-[12px] font-bold uppercase px-2 py-0.5 rounded border ${
                c === "full" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : c === "half" ? "bg-amber/15 text-amber-deep border-amber/30"
                : c === "absent" ? "bg-red-50 text-red-600 border-red-200"
                : c === "not_joined" ? "bg-transparent text-navy/20 border-transparent"
                : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                {CLASS_LABEL[c] || c}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ regularize */

function FixDay({ onDone }: { onDone: () => void }) {
  const [meta, setMeta] = useState<any>(null);
  const [date, setDate] = useState(istDate());
  const [rows, setRows] = useState([{ in: "", out: "" }]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [loadedFor, setLoadedFor] = useState("");

  function load(forDate?: string) {
    const d = forDate || date;
    fetch(`/api/team/regularize?date=${d}`).then((r) => r.json()).then((m) => {
      setMeta(m);
      // Start from what's actually recorded, so this is an edit rather than a
      // memory test. A day with two sessions arrives with both filled in.
      const existing = (m.dayLogs || []).filter((l: any) => l.in || l.out);
      setRows(existing.length ? existing.map((l: any) => ({ in: l.in, out: l.out })) : [{ in: "", out: "" }]);
      setLoadedFor(d);
    }).catch(() => {});
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  // Changing the date reloads that day's punches.
  useEffect(() => {
    if (loadedFor && loadedFor !== date) load(date);
    /* eslint-disable-next-line */
  }, [date]);

  async function submit() {
    setErr(""); setBusy(true);
    const res = await fetch("/api/team/regularize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, logs: rows.filter((r) => r.in && r.out), reason }),
    });
    const out = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(out.error || "Couldn't send that."); return; }
    setSent(true); setReason(""); load(date); onDone();
  }

  if (!meta) return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-navy/30" /></div>;

  if (sent) {
    return (
      <div className="dawn-card p-6 text-center">
        <span className="w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3"><Check className="w-5 h-5 text-emerald-600" /></span>
        <p className="font-semibold text-navy">Sent to your manager</p>
        <p className="text-sm text-muted mt-1">You&apos;ll see the day update once it&apos;s approved.</p>
        <button onClick={() => setSent(false)} className="text-xs text-amber-deep underline mt-3">Fix another day</button>
      </div>
    );
  }

  const noneLeft = meta.remaining <= 0;

  return (
    <div className="dawn-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-navy text-sm">Fix a day you missed</p>
        <span className={`text-[12px] font-medium px-2 py-1 rounded-full ${noneLeft ? "bg-red-50 text-red-600" : "bg-surface text-muted"}`}>
          {meta.remaining} of {meta.allowed} left this month
        </span>
      </div>

      {noneLeft ? (
        <p className="text-sm text-muted">You&apos;ve used all your requests this month. They reset on the 1st.</p>
      ) : (
        <>
          <label className="block">
            <span className="text-xs text-muted">Which day?</span>
            <input type="date" value={date} min={meta.earliestDate} max={istDate()} onChange={(e) => setDate(e.target.value)} className="inp mt-1" />
          </label>
          <p className="text-[12px] text-muted -mt-1">You can fix anything back to {new Date(meta.earliestDate).toLocaleDateString()}.</p>

          <div>
            <span className="text-xs text-muted">
              {(meta.dayLogs || []).length > 0
                ? "What times did you actually work? We've filled in what's recorded — correct it."
                : "What times did you actually work? Nothing is recorded for this day."}
            </span>
            <div className="space-y-2 mt-1.5">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="time" value={r.in} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, in: e.target.value } : x))} className="inp flex-1" />
                  <span className="text-muted text-sm">to</span>
                  <input type="time" value={r.out} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, out: e.target.value } : x))} className="inp flex-1" />
                  {rows.length > 1 && <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="btn-icon p-1.5 text-navy/30 hover:text-red-500"><X className="w-4 h-4" /></button>}
                </div>
              ))}
            </div>
            {rows.length < 6 && (
              <button onClick={() => setRows([...rows, { in: "", out: "" }])} className="flex items-center gap-1 text-xs font-medium text-amber-deep mt-2">
                <Plus className="w-3.5 h-3.5" /> Add another session
              </button>
            )}
          </div>

          <label className="block">
            <span className="text-xs text-muted">Why? Your manager reads this.</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Forgot to punch out before leaving" className="inp mt-1 resize-none" />
          </label>

          {err && <p className="text-sm text-red-600">{err}</p>}
          <button onClick={submit} disabled={busy || !reason.trim()} className="w-full bg-navy text-white font-semibold py-3 rounded-xl disabled:opacity-50">
            {busy ? "Sending…" : "Send request"}
          </button>
        </>
      )}

      {meta.requests?.length > 0 && (
        <div className="pt-3 border-t border-navy-line">
          <p className="text-xs font-semibold text-navy mb-2">Your recent requests</p>
          <div className="space-y-1">
            {meta.requests.slice(0, 5).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <span className="text-navy">{new Date(r.work_date).toLocaleDateString()}</span>
                <span className={`font-medium ${r.status === "approved" ? "text-emerald-600" : r.status === "rejected" ? "text-red-500" : "text-amber-deep"}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
