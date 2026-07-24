// components/EmployeeHome.tsx
// The employee's home INSIDE the app shell (V60) — a faithful port of the
// /team portal's assembled home. Same workspace registry, same widgets, same
// fallback floor; the only change is that tab-jumps became routes. Stat,
// ActivityFeed and TodayCard are replicated from the portal monolith on
// purpose: the monolith retires in V61 and takes its copies with it.
//
// CRM actions (Add lead / New order / follow-up work) still live in /team
// until V61 re-homes them — the cards below link there honestly rather than
// pretending. Nobody loses a feature mid-migration.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApi } from "@/lib/use-api";
import { assembleWorkspace, FALLBACK_CTX, type WorkspaceCtx } from "@/lib/workspace";
import { HomeCustomize } from "@/components/HomeCustomize";
import { Bell, Users2, IndianRupee, Sparkles, Users, ShoppingBag, TrendingUp, Plus, Clock, Loader2 } from "lucide-react";

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="dawn-card p-4 shadow-card">
      <Icon className="w-4 h-4 text-amber-deep mb-1" />
      <p className="text-xl font-bold text-navy">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function ActivityFeed() {
  const [items, setItems] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/team/activity").then((r) => r.json()).then((d) => { setItems(d.activity || []); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);
  if (!loaded || items.length === 0) return null;
  const LABELS: Record<string, string> = { "contact.create": "Added a lead", "contact.update": "Updated a contact", "order.create": "Created an order", "order.status": "Updated order status", "order.payment": "Recorded a payment", "message.send": "Sent a message" };
  return (
    <div className="dawn-card p-4">
      <p className="text-sm font-semibold text-navy mb-2 flex items-center gap-1.5"><Clock className="w-4 h-4 text-navy/40" /> Recent activity</p>
      <div className="space-y-2">
        {items.slice(0, 8).map((it, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-navy/70">{LABELS[it.action] || it.action}</span>
            <span className="text-xs text-muted">{new Date(it.at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TodayCard({ onGoToAttendance }: { onGoToAttendance: () => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    fetch("/api/team/attendance").then((r) => r.json()).then(setD).catch(() => {});
  }, []);
  if (!d || d.error || d.enabled === false) return null;
  const worked = Number(d.todayMinutes || 0);
  const hrs = Math.floor(worked / 60), mins = worked % 60;
  return (
    <button onClick={onGoToAttendance} className="dawn-card p-4 w-full text-left hover:border-amber/40 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="t-micro text-muted">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <p className="font-display font-semibold text-2xl text-navy mt-0.5">
            {worked > 0 ? `${hrs}h ${mins}m` : "Not started"}
          </p>
        </div>
        <span className={`pill ${d.punchedIn ? "pill-green" : worked > 0 ? "pill-grey" : "pill-amber"} shrink-0`}>
          {d.punchedIn ? "Punched in" : worked > 0 ? "Punched out" : "Not in yet"}
        </span>
      </div>
    </button>
  );
}

export function EmployeeHome() {
  const router = useRouter();
  const wsState = useApi<any>("/api/team/workspace");
  const dataState = useApi<any>("/api/team/data");
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const me = dataState.data?.me;
  const leads: any[] = dataState.data?.leads || [];
  const customers: any[] = dataState.data?.customers || [];
  const orders: any[] = dataState.data?.orders || [];
  const stats: any = dataState.data?.stats || {};
  const myScore: any = dataState.data?.myScore || null;
  const perms: string[] = me?.permissions || [];
  const can = (p: string) => perms.includes(p);

  // Same formula as the portal: fallback floor + whatever the workspace call
  // brought — nobody ever gets a blank home.
  const wsCtx: WorkspaceCtx = {
    ...FALLBACK_CTX,
    ...(wsState.data && !wsState.data.error ? wsState.data : {}),
    counts: { ...FALLBACK_CTX.counts, ...(wsState.data?.counts || {}) },
    hasScore: !!(myScore && !myScore.tooNew),
  };
  const assembled = assembleWorkspace(wsCtx, undefined, wsState.data?.prefs);

  if (dataState.loading && !dataState.data) {
    return <div className="p-10 flex items-center justify-center text-navy/40"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading your workspace…</div>;
  }
  if (dataState.error) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <div className="dawn-card p-8 text-center">
          <p className="text-sm text-muted mb-4">Couldn&apos;t load your workspace — check your connection.</p>
          <button onClick={dataState.retry} className="bg-navy text-white text-sm font-medium px-4 py-2 rounded-xl">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-3">
      <div className="pb-1">
        <p className="t-micro text-muted">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="font-display font-semibold text-xl text-navy">Hi, {me?.name?.split(" ")[0] || "there"}</h1>
      </div>

      {assembled.map((w) => {
        if (w.id === "today") {
          return <TodayCard key={w.id} onGoToAttendance={() => router.push("/dashboard/my-attendance")} />;
        }
        if (w.id === "approvals_count") {
          const n = wsCtx.counts.actionableApprovals;
          return (
            <button key={w.id} onClick={() => router.push("/dashboard/inbox")}
              className="w-full bg-amber/10 border border-amber/40 rounded-2xl p-4 flex items-center justify-between text-left hover:bg-amber/15">
              <div>
                <p className="text-sm font-semibold text-navy flex items-center gap-1.5"><Bell className="w-4 h-4 text-amber-deep" /> Waiting for your decision</p>
                <p className="text-xs text-muted mt-0.5">{n === 1 ? "1 request needs" : `${n} requests need`} your approval.</p>
              </div>
              <span className="text-2xl font-bold text-amber-deep shrink-0 ml-3">{n}</span>
            </button>
          );
        }
        if (w.id === "team_today") {
          return (
            <button key={w.id} onClick={() => router.push("/dashboard/my-team")}
              className="w-full bg-white border border-navy-line rounded-2xl p-4 flex items-center justify-between text-left hover:bg-surface">
              <div>
                <p className="text-sm font-semibold text-navy flex items-center gap-1.5"><Users2 className="w-4 h-4 text-navy/50" /> Team today</p>
                <p className="text-xs text-muted mt-0.5">
                  {wsCtx.counts.teamPresentToday} of {wsCtx.teamSize} punched in
                  {wsCtx.counts.teamOnLeaveToday > 0 ? ` · ${wsCtx.counts.teamOnLeaveToday} on leave` : ""}
                </p>
              </div>
              <span className="text-muted text-xs shrink-0 ml-3">Open →</span>
            </button>
          );
        }
        if (w.id === "payroll_run") {
          const n = wsCtx.counts.payrollDrafts;
          return (
            <button key={w.id} onClick={() => router.push("/dashboard/payroll-run")}
              className="w-full bg-white border border-navy-line rounded-2xl p-4 flex items-center justify-between text-left hover:bg-surface">
              <div>
                <p className="text-sm font-semibold text-navy flex items-center gap-1.5"><IndianRupee className="w-4 h-4 text-amber-deep" /> Payroll</p>
                <p className="text-xs text-muted mt-0.5">{n > 0 ? `${n} draft ${n === 1 ? "payslip" : "payslips"} awaiting approval.` : "The run is clean — open it any time."}</p>
              </div>
              {n > 0 ? <span className="text-2xl font-bold text-amber-deep shrink-0 ml-3">{n}</span> : <span className="text-muted text-xs shrink-0 ml-3">Open →</span>}
            </button>
          );
        }
        if (w.id === "hr_pulse") {
          const j = wsCtx.counts.peopleJoiners, a = wsCtx.counts.peopleAnniversaries;
          const bits = [
            j > 0 ? `${j} joined this month` : "",
            a > 0 ? `${a} work ${a === 1 ? "anniversary" : "anniversaries"}` : "",
          ].filter(Boolean).join(" · ");
          return (
            <button key={w.id} onClick={() => router.push("/dashboard/people")}
              className="w-full bg-white border border-navy-line rounded-2xl p-4 flex items-center justify-between text-left hover:bg-surface">
              <div>
                <p className="text-sm font-semibold text-navy flex items-center gap-1.5"><Users2 className="w-4 h-4 text-amber-deep" /> People pulse</p>
                <p className="text-xs text-muted mt-0.5">{bits || "A quiet month — no joiners or anniversaries in your team."}</p>
              </div>
              <span className="text-muted text-xs shrink-0 ml-3">Open →</span>
            </button>
          );
        }
        if (w.id === "studio") {
          return (
            <button key={w.id} onClick={() => router.push("/dashboard/my-studio")}
              className="w-full bg-white border border-navy-line rounded-2xl p-4 flex items-center justify-between text-left hover:bg-surface">
              <div>
                <p className="text-sm font-semibold text-navy flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-amber-deep" /> Content studio</p>
                <p className="text-xs text-muted mt-0.5">Ideas, captions, and carousels from the account&apos;s real numbers.</p>
              </div>
              <span className="text-muted text-xs shrink-0 ml-3">Open →</span>
            </button>
          );
        }
        if (w.id === "my_score" && myScore && !myScore.tooNew) {
          return (
            <div key={w.id} className="bg-navy rounded-2xl p-4 text-white flex items-center justify-between mb-3">
              <div>
                <p className="text-[12px] uppercase tracking-wide text-white/50">My score this month</p>
                <p className="text-xs text-white/60 mt-0.5">{myScore.isTop ? "🏆 Top of the team right now" : myScore.rank ? `Ranked #${myScore.rank}` : "Keep going"}</p>
              </div>
              <p className="text-3xl font-bold text-amber">{myScore.score}<span className="text-sm text-white/40 font-normal">/100</span></p>
            </div>
          );
        }
        if (w.id === "crm_stats") {
          return (
            <div key={w.id} className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="My leads" value={stats.leads ?? leads.length} icon={Users} />
                <Stat label="My customers" value={stats.customers ?? customers.length} icon={Users} />
                <Stat label="My orders" value={stats.orders ?? orders.length} icon={ShoppingBag} />
              </div>
              {stats.revenue != null && (
                <div className="bg-navy rounded-2xl p-5 text-white flex items-center justify-between">
                  <div><p className="text-xs text-white/50 uppercase tracking-wide">My collected revenue</p><p className="text-2xl font-bold text-amber">₹{stats.revenue}</p></div>
                  <TrendingUp className="w-8 h-8 text-white/20" />
                </div>
              )}
              <div className="flex gap-2">
                {can("leads") && <Link href="/team" className="flex-1 flex items-center justify-center gap-2 bg-white border border-navy-line rounded-xl py-3 text-sm font-medium text-navy hover:bg-surface"><Plus className="w-4 h-4" /> Add lead</Link>}
                {can("orders") && <Link href="/team" className="flex-1 flex items-center justify-center gap-2 bg-navy text-white rounded-xl py-3 text-sm font-medium hover:bg-navy-soft"><Plus className="w-4 h-4" /> New order</Link>}
              </div>
              {can("leads") && leads.filter((l: any) => l.follow_up_date && new Date(l.follow_up_date) <= new Date()).length > 0 && (
                <div className="bg-amber/10 border border-amber/30 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-navy mb-2 flex items-center gap-1.5"><Bell className="w-4 h-4 text-amber-deep" /> Follow-ups due</p>
                  <div className="space-y-1.5">
                    {leads.filter((l: any) => l.follow_up_date && new Date(l.follow_up_date) <= new Date()).slice(0, 5).map((l: any) => {
                      const overdue = new Date(l.follow_up_date) < new Date(new Date().toDateString());
                      return (
                        <div key={l.id} className="flex items-center justify-between text-sm">
                          <span className="min-w-0">
                            <span className="text-navy">{l.name}</span>
                            <span className={`ml-2 text-[12px] ${overdue ? "text-red-600 font-semibold" : "text-muted"}`}>{overdue ? "Overdue · " : "Today · "}{new Date(l.follow_up_date).toLocaleDateString()}</span>
                          </span>
                          {l.phone && <a href={`https://wa.me/${(l.phone || "").replace(/[^0-9]/g, "")}`} target="_blank" className="text-emerald-600 text-xs font-medium shrink-0 ml-2">Message →</a>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="t-micro text-muted mt-2">Work these in the <Link href="/team" className="underline">team portal</Link> — moving here in the next update.</p>
                </div>
              )}
            </div>
          );
        }
        return null;
      })}

      <ActivityFeed />
      <button onClick={() => setCustomizeOpen(true)}
        className="w-full text-center t-micro text-muted hover:text-navy py-1">
        Customize this home
      </button>
      {customizeOpen && (
        <HomeCustomize
          prefs={wsState.data?.prefs || {}}
          onClose={() => setCustomizeOpen(false)}
          onSaved={() => wsState.retry()}
        />
      )}
    </div>
  );
}
