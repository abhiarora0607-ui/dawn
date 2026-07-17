"use client";

// The Operator Console — Dawn's owner watching Dawn itself. Who signed up,
// who's thriving, who's fading. Shows usage shape only: counts, dates, and
// each business's own name — never anything inside their CRM.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, LogOut, Search, Users, TrendingUp, Instagram, Zap,
  AlertTriangle, Sprout, Star, Flame, MessageCircle, IndianRupee,
} from "lucide-react";

const STATUS: Record<string, { label: string; dot: string; badge: string }> = {
  active: { label: "Active", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  cooling: { label: "Cooling", dot: "bg-amber-400", badge: "bg-amber-50 text-amber-700" },
  churning: { label: "Churning", dot: "bg-red-500", badge: "bg-red-50 text-red-600" },
  never_started: { label: "Never started", dot: "bg-slate-300", badge: "bg-slate-100 text-slate-500" },
  no_signal: { label: "No signal yet", dot: "bg-slate-300", badge: "bg-slate-100 text-slate-500" },
};

export default function OperatorPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [d, setD] = useState<any>(null);

  function load() {
    fetch("/api/operator/overview").then(async (r) => {
      if (r.status === 401) { setAuthed(false); return; }
      const data = await r.json();
      setD(data); setAuthed(true);
    }).catch(() => setAuthed(false));
  }
  useEffect(() => { load(); }, []);

  if (authed === null) return <Shell><div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div></Shell>;
  if (authed === false) return <Shell><Login onDone={load} /></Shell>;
  return <Shell><Console d={d} onLogout={async () => { await fetch("/api/operator/auth", { method: "DELETE" }); setAuthed(false); }} /></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen dawn-app-bg">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</div>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(""); setBusy(true);
    const res = await fetch("/api/operator/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, passphrase }),
    });
    if (res.ok) { onDone(); return; }
    const data = await res.json().catch(() => ({}));
    setErr(data.error || "Couldn't sign in."); setBusy(false);
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <div className="dawn-card p-6">
        <h1 className="font-display font-semibold text-xl text-navy mb-1">Operator</h1>
        <p className="text-sm text-muted mb-5">Dawn&apos;s owner console. This door is yours alone.</p>
        <div className="space-y-3">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
          <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Passphrase" className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button onClick={submit} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Enter
          </button>
        </div>
      </div>
    </div>
  );
}

function exportCsv(businesses: any[]) {
  // Privacy wall holds in exports too: names/counts/dates only, no customer data.
  const head = ["Business", "Email", "Status", "Score", "Contacts", "Orders", "Employees", "Signed up", "Days quiet", "Instagram"];
  const rows = (businesses || []).map((b) => [
    b.name || "Unnamed", b.email || "", b.status, b.score, b.contacts, b.orders, b.employees,
    new Date(b.signedUp).toLocaleDateString(), b.daysQuiet ?? "", b.ig ? "yes" : "no",
  ]);
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `dawn-businesses-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function Console({ d, onLogout }: { d: any; onLogout: () => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("score");

  if (!d || d.error) return <p className="text-center text-muted py-20">Couldn&apos;t load.</p>;
  const h = d.health;
  const a = d.attention;

  let rows = (d.businesses || []).filter((b: any) =>
    (filter === "all" || b.status === filter) &&
    (!q || (b.name || "").toLowerCase().includes(q.toLowerCase()) || (b.email || "").toLowerCase().includes(q.toLowerCase()))
  );
  rows = [...rows].sort((a: any, b: any) =>
    sort === "score" ? b.score - a.score
    : sort === "newest" ? new Date(b.signedUp).getTime() - new Date(a.signedUp).getTime()
    : sort === "quiet" ? (b.daysQuiet ?? -1) - (a.daysQuiet ?? -1)
    : b.contacts + b.orders - (a.contacts + a.orders)
  );

  const maxGrowth = Math.max(1, ...(h.growth || []).map((g: any) => g.n));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy">Dawn Operator</h1>
          <p className="text-sm text-muted">Your product, from above. Usage shape only — never their data.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/operator/revenue" className="flex items-center gap-1.5 text-sm font-semibold text-amber-deep hover:text-amber-deep/80"><IndianRupee className="w-4 h-4" /> Revenue</Link>
          <button onClick={() => exportCsv(d.businesses)} className="text-sm text-navy/60 hover:text-navy">Export CSV</button>
          <button onClick={onLogout} className="flex items-center gap-1.5 text-sm text-muted hover:text-navy"><LogOut className="w-4 h-4" /> Sign out</button>
        </div>
      </div>

      {/* Health strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Businesses" value={String(h.total)} sub={`+${h.newWeek} this week · +${h.newMonth} this month`} icon={Users} />
        <Stat label="Activation" value={`${h.activationRate}%`} sub={`${h.activated} set up · ${h.neverStarted} never started`} icon={Zap} />
        <Stat label="Active now" value={String(h.active)} sub={`${h.cooling} cooling · ${h.churning} churning`} icon={TrendingUp} />
        <Stat label="Instagram" value={String(h.igConnected)} sub={`${h.total > 0 ? Math.round((h.igConnected / h.total) * 100) : 0}% connected`} icon={Instagram} />
      </div>

      {/* One-line read on the whole product */}
      {(() => {
        const biz = d.businesses || [];
        const avgScore = biz.length ? Math.round(biz.reduce((a: number, b: any) => a + b.score, 0) / biz.length) : 0;
        const reachOut = (a?.churnRisk?.length || 0) + (a?.neverStarted?.length || 0);
        const healthy = biz.filter((b: any) => b.score >= 60).length;
        return (
          <div className="dawn-card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-navy"><span className="font-bold">{avgScore}</span><span className="text-muted"> avg engagement</span></span>
            <span className="text-navy"><span className="font-bold">{healthy}</span><span className="text-muted"> thriving (60+)</span></span>
            {reachOut > 0
              ? <span className="text-amber-deep font-medium ml-auto flex items-center gap-1.5"><Flame className="w-4 h-4" /> {reachOut} business(es) worth reaching out to today</span>
              : <span className="text-emerald-600 font-medium ml-auto">Nobody needs urgent attention right now</span>}
          </div>
        );
      })()}

      {/* Growth + status mix */}
      <div className="grid md:grid-cols-2 gap-3">
        {h.growth?.length > 0 && (
          <div className="dawn-card p-5">
            <p className="text-sm font-semibold text-navy mb-3">Signups by month</p>
            <div className="flex items-end gap-2 h-28">
              {h.growth.map((g: any) => (
                <div key={g.month} className="flex-1 flex flex-col items-center gap-1 justify-end">
                  <span className="text-[10px] font-semibold text-navy">{g.n}</span>
                  <div className="w-full bg-gradient-to-t from-amber-deep to-amber rounded-t" style={{ height: `${Math.max(6, (g.n / maxGrowth) * 100)}%` }} />
                  <span className="text-[9px] text-muted">{g.month.slice(5)}/{g.month.slice(2, 4)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="dawn-card p-5">
          <p className="text-sm font-semibold text-navy mb-3">Where your businesses stand</p>
          {(() => {
            const segs = [
              { label: "Active", n: h.active, c: "bg-emerald-500" },
              { label: "Cooling", n: h.cooling, c: "bg-amber-400" },
              { label: "Churning", n: h.churning, c: "bg-red-500" },
              { label: "Never started", n: h.neverStarted, c: "bg-slate-300" },
            ];
            const tot = Math.max(1, segs.reduce((a, s) => a + s.n, 0));
            return (
              <>
                <div className="flex h-3 rounded-full overflow-hidden mb-3">
                  {segs.map((s) => s.n > 0 && <div key={s.label} className={s.c} style={{ width: `${(s.n / tot) * 100}%` }} title={`${s.label}: ${s.n}`} />)}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {segs.map((s) => (
                    <div key={s.label} className="flex items-center gap-1.5 text-xs">
                      <span className={`w-2.5 h-2.5 rounded-sm ${s.c}`} />
                      <span className="text-navy/70">{s.label}</span>
                      <span className="font-semibold text-navy ml-auto">{s.n}</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Who needs you today */}
      {a && (a.churnRisk?.length || a.neverStarted?.length || a.powerUsers?.length || a.growing?.length) ? (
        <div className="grid md:grid-cols-2 gap-3">
          {a.churnRisk?.length > 0 && (
            <AttnCard title="About to churn" icon={AlertTriangle} tone="bad" hint="Was active, now quiet. Reach out before they're gone.">
              {a.churnRisk.map((b: any) => <AttnRow key={b.uid} b={b} meta={`quiet ${b.daysQuiet}d`} />)}
            </AttnCard>
          )}
          {a.neverStarted?.length > 0 && (
            <AttnCard title="Signed up, never started" icon={Sprout} tone="warn" hint="Stuck at the empty state. A nudge converts them.">
              {a.neverStarted.map((b: any) => <AttnRow key={b.uid} b={b} meta={`${b.daysSinceSignup}d ago`} />)}
            </AttnCard>
          )}
          {a.powerUsers?.length > 0 && (
            <AttnCard title="Power users" icon={Star} tone="good" hint="Your happiest. Ask them what to build next.">
              {a.powerUsers.map((b: any) => <AttnRow key={b.uid} b={b} meta={`score ${b.score}`} />)}
            </AttnCard>
          )}
          {a.growing?.length > 0 && (
            <AttnCard title="Growing fast" icon={Flame} tone="good" hint="Usage climbing. Your success stories.">
              {a.growing.map((b: any) => <AttnRow key={b.uid} b={b} meta="rising" />)}
            </AttnCard>
          )}
        </div>
      ) : null}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-navy/30 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search businesses…" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy bg-white focus:outline-none focus:border-amber" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy bg-white">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="cooling">Cooling</option>
          <option value="churning">Churning</option>
          <option value="never_started">Never started</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy bg-white">
          <option value="score">By engagement</option>
          <option value="newest">Newest first</option>
          <option value="quiet">Quietest first</option>
          <option value="usage">Most usage</option>
        </select>
      </div>

      {/* Business list */}
      {rows.length === 0 ? (
        <div className="dawn-card p-12 text-center text-sm text-muted">No businesses match.</div>
      ) : (
        <div className="grid gap-2">
          {rows.map((b: any) => {
            const st = STATUS[b.status] || STATUS.no_signal;
            return (
              <Link href={`/operator/b/${encodeURIComponent(b.uid)}`} key={b.uid} className="block bg-white rounded-xl border border-navy-line p-4 shadow-card hover:border-amber/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy text-sm flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                      <span className="truncate">{b.name || "Unnamed business"}</span>
                      {b.ig && <Instagram className="w-3.5 h-3.5 text-navy/30 shrink-0" />}
                      {b.demoOnly && <span className="text-[9px] font-bold uppercase bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded shrink-0">demo</span>}
                      {b.unclaimedLegacy && <span className="text-[9px] font-bold uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">unclaimed</span>}
                    </p>
                    <p className="text-xs text-muted truncate">{b.email || "no email on file"} · joined {new Date(b.signedUp).toLocaleDateString()} ({b.daysSinceSignup}d ago)</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-lg font-bold ${b.score >= 60 ? "text-emerald-600" : b.score >= 30 ? "text-navy" : "text-red-500"}`}>{b.score}</p>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${st.badge}`}>{st.label}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-navy-line/50 text-[11px] text-muted">
                  <span>{b.demoOnly ? `${b.contacts} demo contact(s)` : `${b.contacts} contact(s)`}</span>
                  <span>{b.orders} order(s)</span>
                  <span>{b.employees} employee(s)</span>
                  <span>{b.daysQuiet != null ? `last seen ${b.daysQuiet === 0 ? "today" : `${b.daysQuiet}d ago`}` : "no activity signal yet"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted text-center pb-6">Counts and dates only. Customer content never reaches this screen — by design.</p>
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

function AttnCard({ title, icon: Icon, tone, hint, children }: any) {
  const border = tone === "bad" ? "border-red-200" : tone === "warn" ? "border-amber/40" : "border-emerald-200";
  return (
    <div className={`dawn-card ${border} p-4`}>
      <p className="text-sm font-semibold text-navy flex items-center gap-1.5 mb-0.5"><Icon className="w-4 h-4 text-navy/40" /> {title}</p>
      <p className="text-[11px] text-muted mb-3">{hint}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function AttnRow({ b, meta }: { b: any; meta: string }) {
  const wa = (b.whatsapp || "").replace(/[^0-9]/g, "");
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-navy-line/40 last:border-0">
      <Link href={`/operator/b/${encodeURIComponent(b.uid)}`} className="min-w-0 flex-1 hover:opacity-70">
        <span className="text-sm text-navy truncate block">{b.name || "Unnamed"} <span className="text-[11px] text-muted">· {meta}</span></span>
      </Link>
      {wa && <a href={`https://wa.me/${wa}`} target="_blank" onClick={(e) => e.stopPropagation()} className="p-1 text-emerald-600 shrink-0"><MessageCircle className="w-4 h-4" /></a>}
    </div>
  );
}
