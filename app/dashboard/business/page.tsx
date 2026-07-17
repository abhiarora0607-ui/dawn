"use client";

// The business command centre. Ordered by what costs money if ignored:
// money owed → work neglected → team → customers → pipeline health.

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useSettings, money } from "@/lib/use-settings";
import { OnboardingCard } from "@/components/OnboardingCard";
import {
  Loader2, TrendingUp, TrendingDown, Wallet, AlertTriangle, Clock, Snowflake,
  Truck, Trophy, Users, Target, Phone, MessageCircle, ArrowRight, CheckSquare, Flame,
} from "lucide-react";

export default function BusinessDashboard() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { currency } = useSettings();

  const [sc, setSc] = useState<any>(null);
  useEffect(() => {
    Promise.all([
      fetch("/api/pulse").then((r) => r.json()),
      fetch("/api/scores").then((r) => r.json()),
    ]).then(([res, scores]) => { setD(res); setSc(scores); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <DashboardShell><DashTopbar pageTitle="Business" /><div className="p-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div></DashboardShell>;
  if (!d || d.error) return <DashboardShell><DashTopbar pageTitle="Business" /><div className="p-12 text-center text-muted">Couldn&apos;t load your dashboard.</div></DashboardShell>;

  const m = d.money, a = d.attention, t = d.team, c = d.customers, p = d.pipeline;
  const needsAction = a.unpaidCount + a.staleCount + a.overdueFollowUpCount + a.overdueTaskCount + a.stuckOrderCount;

  return (
    <DashboardShell>
      <DashTopbar pageTitle="Business" />
      <div className="w-full max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-10 py-6 sm:py-8 space-y-6">

        <OnboardingCard />

        {/* ---------------------------------------------------------- MONEY */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Money label="Revenue this month" value={money(m.revenueMTD, currency)} trend={m.revenueTrend} icon={TrendingUp} />
          <Money label="Expenses" value={money(m.expensesMTD, currency)} icon={Wallet} />
          <Money label="Profit" value={money(m.profitMTD, currency)} accent={m.profitMTD >= 0 ? "good" : "bad"} icon={m.profitMTD >= 0 ? TrendingUp : TrendingDown} />
          <Link href="/dashboard/orders" className="block">
            <Money label="Money owed to you" value={money(m.totalOwed, currency)} accent={m.totalOwed > 0 ? "warn" : undefined} sub={m.totalOwed > 0 ? `across ${a.unpaidCount} order(s)` : "all collected"} icon={AlertTriangle} />
          </Link>
        </section>

        {m.revenueTarget && (
          <div className="dawn-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-navy">Monthly revenue goal</p>
              <p className="text-sm text-muted"><span className="font-bold text-navy">{money(m.revenueMTD, currency)}</span> of {money(m.revenueTarget, currency)} · {m.targetPct}%</p>
            </div>
            <div className="h-2.5 bg-navy-line rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${m.targetPct >= 100 ? "bg-emerald-500" : "bg-amber-deep"}`} style={{ width: `${m.targetPct}%` }} />
            </div>
            {m.targetPct >= 100 && <p className="text-xs text-emerald-600 font-medium mt-1.5">🎉 Goal reached this month!</p>}
          </div>
        )}

        {/* ------------------------------------------------- NEEDS ATTENTION */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-lg text-navy flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-deep" /> Needs attention
            </h2>
            {needsAction === 0 && <span className="text-xs text-emerald-600 font-medium">All clear</span>}
          </div>

          {needsAction === 0 ? (
            <div className="bg-white rounded-2xl border border-navy-line p-8 text-center">
              <p className="text-sm text-navy font-medium">Nothing is slipping.</p>
              <p className="text-xs text-muted mt-1">No overdue follow-ups, no cold leads, no uncollected money, no stuck orders.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {a.unpaidCount > 0 && (
                <Panel title="Money to collect" count={a.unpaidCount} icon={Wallet} tone="warn" href="/dashboard/orders">
                  {a.unpaid.map((u: any) => (
                    <Row key={u.id} main={u.name} meta={`${money(u.balance, currency)} · ${u.daysOld}d old · ${u.owner}`} phone={u.phone} urgent={u.daysOld > 14} />
                  ))}
                </Panel>
              )}

              {a.staleCount > 0 && (
                <Panel title="Leads going cold" count={a.staleCount} icon={Snowflake} tone="warn" href="/dashboard/attention">
                  {a.stale.map((s: any) => (
                    <Row key={s.id} main={s.name} meta={`${s.idleDays}d untouched · ${s.stage} · ${s.owner}`} phone={s.phone} urgent={s.idleDays >= s.threshold * 2} href={`/dashboard/contacts/${s.id}`} />
                  ))}
                </Panel>
              )}

              {a.overdueFollowUpCount > 0 && (
                <Panel title="Overdue follow-ups" count={a.overdueFollowUpCount} icon={Clock} tone="bad" href="/dashboard/attention">
                  {a.overdueFollowUps.map((f: any) => (
                    <Row key={f.id} main={f.name} meta={`${f.daysLate}d late · ${f.owner}`} phone={f.phone} urgent href={`/dashboard/contacts/${f.id}`} />
                  ))}
                </Panel>
              )}

              {a.stuckOrderCount > 0 && (
                <Panel title="Orders not delivered" count={a.stuckOrderCount} icon={Truck} tone="warn" href="/dashboard/orders">
                  {a.stuckOrders.map((o: any) => (
                    <Row key={o.id} main={o.name} meta={`${o.status} · ${o.daysOld}d · ${money(o.total, currency)}`} urgent={o.daysOld > 7} />
                  ))}
                </Panel>
              )}

              {a.overdueTaskCount > 0 && (
                <Panel title="Overdue tasks" count={a.overdueTaskCount} icon={CheckSquare} tone="bad" href="/dashboard/team-work">
                  {a.overdueTasks.map((t: any) => (
                    <Row key={t.id} main={t.title} meta={`${t.daysLate}d late · ${t.owner}`} urgent />
                  ))}
                </Panel>
              )}

              {a.dueToday.length > 0 && (
                <Panel title="Due today" count={a.dueToday.length} icon={Target} tone="ok">
                  {a.dueToday.map((x: any, i: number) => (
                    <Row key={i} main={x.label} meta={`${x.kind} · ${x.owner}`} phone={x.phone} />
                  ))}
                </Panel>
              )}
            </div>
          )}
        </section>

        {/* ----------------------------------------------------------- TEAM */}
        {t.all.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-lg text-navy">Team</h2>
              <Link href="/dashboard/performance" className="text-xs font-medium text-amber-deep flex items-center gap-1">Full report <ArrowRight className="w-3 h-3" /></Link>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              {sc?.top && (
                <Link href={`/dashboard/employees/${sc.top.employeeId}`} className="block bg-navy rounded-2xl p-5 text-white hover:opacity-95">
                  <p className="text-[10px] uppercase tracking-wide text-white/50 flex items-center gap-1.5 mb-1"><Trophy className="w-3.5 h-3.5 text-amber" /> Top performer · {sc.month}</p>
                  <p className="text-lg font-semibold">{sc.top.name}</p>
                  <p className="text-sm text-amber font-bold">Score {sc.top.score}/100</p>
                  <p className="text-xs text-white/50 mt-1">{money(sc.top.breakdown?.revenue || 0, currency)} collected · {sc.top.breakdown?.won || 0} won this month</p>
                </Link>
              )}
              {sc?.bottom && (
                <Link href={`/dashboard/employees/${sc.bottom.employeeId}`} className="block bg-white rounded-2xl border border-red-200 p-5 hover:bg-red-50/30">
                  <p className="text-[10px] uppercase tracking-wide text-red-500 flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3.5 h-3.5" /> Needs support</p>
                  <p className="text-lg font-semibold text-navy">{sc.bottom.name}</p>
                  <p className="text-sm text-red-600 font-medium">Score {sc.bottom.score}/100</p>
                  <p className="text-xs text-muted mt-1">{sc.bottom.breakdown?.coldLeads || 0} cold lead(s) · {(sc.bottom.breakdown?.overdueFollowUps || 0) + (sc.bottom.breakdown?.overdueTasks || 0)} overdue</p>
                </Link>
              )}
            </div>

            <div className="dawn-card overflow-hidden">
              <div className="overflow-x-auto dawn-scroll">
                <table className="w-full text-sm">
                  <thead className="bg-surface border-b border-navy-line">
                    <tr>
                      {["Person", "Score", "Collected", "Open leads", "Won", "Close rate", "Cold", "Overdue"].map((h) => (
                        <th key={h} className="text-left font-semibold text-navy/70 text-[11px] uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.all.map((e: any) => (
                      <tr key={e.id} className="border-b border-navy-line/60 last:border-0">
                        <td className="px-4 py-3 font-medium text-navy whitespace-nowrap"><Link href={`/dashboard/employees/${e.id}`} className="hover:text-amber-deep hover:underline">{e.name}</Link></td>
                        <td className="px-4 py-3">{(() => { const row = sc?.scores?.find((x: any) => x.employeeId === e.id); if (!row) return <span className="text-navy/30">—</span>; if (row.tooNew) return <span className="text-[10px] text-muted">too new</span>; if (!row.eligible) return <span className="text-navy/30">—</span>; return <span className={`font-bold ${row.score >= 70 ? "text-emerald-600" : row.score >= 40 ? "text-navy" : "text-red-600"}`}>{row.score}</span>; })()}</td>
                        <td className="px-4 py-3 text-navy">{money(e.revenue, currency)}</td>
                        <td className="px-4 py-3 text-navy">{e.leads}</td>
                        <td className="px-4 py-3 text-navy">{e.won}</td>
                        <td className="px-4 py-3 text-navy">{e.conversion != null ? `${e.conversion}%` : "—"}</td>
                        <td className={`px-4 py-3 font-medium ${e.stale > 0 ? "text-amber-deep" : "text-navy/30"}`}>{e.stale || "—"}</td>
                        <td className={`px-4 py-3 font-medium ${e.overdue > 0 ? "text-red-600" : "text-navy/30"}`}>{e.overdue || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------ CUSTOMERS */}
        <section className="grid md:grid-cols-2 gap-3">
          <div className="dawn-card p-5">
            <h3 className="font-semibold text-navy mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-amber-deep" /> Best customers</h3>
            {c.best.length === 0 ? <p className="text-sm text-muted">No customers yet.</p> : (
              <div className="space-y-2">
                {c.best.map((b: any, i: number) => (
                  <div key={b.id} className="flex items-center justify-between text-sm">
                    <span className="text-navy flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-muted w-4">{i + 1}</span>
                      <Link href={`/dashboard/contacts/${b.id}`} className="truncate hover:text-amber-deep">{b.name}</Link>
                    </span>
                    <span className="text-navy font-semibold shrink-0 ml-2">{money(b.spend, currency)} <span className="text-[10px] font-normal text-muted">· {b.orders} order(s)</span></span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-4 mt-4 pt-3 border-t border-navy-line">
              <Mini label="Customers" value={String(c.total)} />
              <Mini label="Repeat rate" value={`${c.repeatRate}%`} />
              <Mini label="Avg order" value={money(m.avgOrderValue, currency)} />
            </div>
          </div>

          <div className="dawn-card p-5">
            <h3 className="font-semibold text-navy mb-1 flex items-center gap-2"><Clock className="w-4 h-4 text-amber-deep" /> Customers going quiet</h3>
            <p className="text-xs text-muted mb-3">Bought before, nothing in 45+ days. The cheapest sale you can make.</p>
            {c.atRisk.length === 0 ? <p className="text-sm text-muted">Everyone&apos;s been active recently.</p> : (
              <div className="space-y-2">
                {c.atRisk.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <Link href={`/dashboard/contacts/${r.id}`} className="text-navy truncate hover:text-amber-deep">{r.name}</Link>
                    <span className="text-xs text-muted shrink-0 ml-2">
                      {r.daysSince}d ago · {money(r.spend, currency)}
                      {r.phone && <a href={`https://wa.me/${r.phone.replace(/[^0-9]/g, "")}`} target="_blank" className="ml-2 text-emerald-600 font-medium">Message</a>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------- PIPELINE */}
        <section className="dawn-card p-5">
          <h3 className="font-semibold text-navy mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-amber-deep" /> Pipeline</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {p.stages.map((s: any) => (
              <div key={s.stage} className="bg-surface rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-navy">{s.count}</p>
                <p className="text-[10px] text-muted uppercase tracking-wide">{s.stage}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-3 border-t border-navy-line">
            <Mini label="Win rate" value={p.winRate != null ? `${p.winRate}%` : "—"} />
            <Mini label="New this week" value={String(p.newThisWeek)} />
            {p.bestSource && <Mini label="Best source" value={`${p.bestSource.name} (${p.bestSource.rate}%)`} />}
          </div>
        </section>

      </div>
    </DashboardShell>
  );
}

function Money({ label, value, trend, sub, accent, icon: Icon }: any) {
  const color = accent === "bad" ? "text-red-600" : accent === "warn" ? "text-amber-deep" : accent === "good" ? "text-emerald-600" : "text-navy";
  return (
    <div className="dawn-stat h-full">
      <span className="absolute top-0 left-0 h-0.5 w-full bg-gradient-to-r from-amber-deep/50 to-amber/25" />
      <div className="flex items-start justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted font-semibold">{label}</p>
        <Icon className="w-4 h-4 text-navy/20" />
      </div>
      <p className={`text-2xl font-bold mt-1.5 leading-none ${color}`}>{value}</p>
      {trend != null && (
        <p className={`text-[11px] font-medium mt-1.5 ${trend >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs last month
        </p>
      )}
      {sub && <p className="text-[11px] text-muted mt-1">{sub}</p>}
    </div>
  );
}

function Panel({ title, count, icon: Icon, tone, href, children }: any) {
  const border = tone === "bad" ? "border-red-200" : tone === "warn" ? "border-amber/40" : "border-navy-line";
  const badge = tone === "bad" ? "bg-red-50 text-red-600" : tone === "warn" ? "bg-amber/15 text-amber-deep" : "bg-navy/5 text-navy/60";
  return (
    <div className={`dawn-card ${border} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-navy text-sm flex items-center gap-1.5"><Icon className="w-4 h-4 text-navy/40" /> {title}</h3>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>{count}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
      {href && count > 3 && <Link href={href} className="text-[11px] font-medium text-amber-deep mt-3 inline-flex items-center gap-1">See all <ArrowRight className="w-3 h-3" /></Link>}
    </div>
  );
}

function Row({ main, meta, phone, urgent, href }: any) {
  const wa = (phone || "").replace(/[^0-9]/g, "");
  const body = (
    <>
      <span className={`text-sm truncate ${urgent ? "text-red-600 font-medium" : "text-navy"}`}>{main}</span>
      <span className="text-[11px] text-muted shrink-0 ml-2">{meta}</span>
    </>
  );
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-navy-line/40 last:border-0">
      {href ? <Link href={href} className="flex items-center justify-between flex-1 min-w-0 hover:opacity-70">{body}</Link> : <div className="flex items-center justify-between flex-1 min-w-0">{body}</div>}
      {wa && <a href={`https://wa.me/${wa}`} target="_blank" className="p-1 text-emerald-600 shrink-0"><MessageCircle className="w-3.5 h-3.5" /></a>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] uppercase tracking-wide text-muted">{label}</p><p className="text-sm font-semibold text-navy">{value}</p></div>;
}
