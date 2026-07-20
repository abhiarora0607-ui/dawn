"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { useSettings, money as fmtMoney } from "@/lib/use-settings";
import { Loader2, TrendingUp, Users, ShoppingBag, Trophy, Percent, Clock } from "lucide-react";

const WINDOWS = [
  { id: "day", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

export default function PerformancePage() {
  const { currency } = useSettings();
  const money = (n: number) => fmtMoney(n, currency);
  const [win, setWin] = useState("month");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sc, setSc] = useState<any>(null);
  const [scoreMonth, setScoreMonth] = useState<string>("");  // "" = live current month

  useEffect(() => {
    setLoading(true);
    fetch(`/api/employee-performance?window=${win}`).then((r) => r.json()).then((d) => { setRows(d.employees || []); setLoading(false); }).catch(() => setLoading(false));
  }, [win]);
  useEffect(() => {
    fetch(`/api/scores${scoreMonth ? `?month=${scoreMonth}` : ""}`).then((r) => r.json()).then(setSc).catch(() => {});
  }, [scoreMonth]);
  const scoreFor = (id: string) => sc?.scores?.find((x: any) => x.employeeId === id);

  const totals = rows.reduce((a, r) => ({
    revenue: a.revenue + r.revenue, orders: a.orders + r.orders,
    leads: a.leads + r.leads, customers: a.customers + r.customers,
  }), { revenue: 0, orders: 0, leads: 0, customers: 0 });

  const topRevenue = rows[0];

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="font-display font-semibold text-2xl text-navy">Team Performance</h1>
            <p className="text-muted text-sm mt-0.5">Compare how each team member is performing.</p>
          </div>
          <div className="flex gap-1 bg-white p-1 rounded-xl border border-navy-line overflow-x-auto">
            {WINDOWS.map((w) => (
              <button key={w.id} onClick={() => setWin(w.id)} className={`text-sm font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${win === w.id ? "bg-navy text-white" : "text-muted hover:text-navy"}`}>{w.label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/40" /></div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-navy-line p-12 text-center">
            <Users className="w-10 h-10 text-navy/20 mx-auto mb-3" />
            <p className="text-navy font-medium">No employees yet</p>
            <p className="text-muted text-sm mt-1">Add employees and assign them leads and orders to see performance here.</p>
          </div>
        ) : (
          <>
            {/* Team totals */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <TotalCard label="Team revenue" value={money(totals.revenue)} icon={TrendingUp} accent />
              <TotalCard label="Orders" value={String(totals.orders)} icon={ShoppingBag} />
              <TotalCard label="Leads" value={String(totals.leads)} icon={Users} />
              <TotalCard label="Customers" value={String(totals.customers)} icon={Users} />
            </div>

            {/* Monthly score ranking — the official record */}
            {sc?.scores?.length > 0 && (
              <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <p className="text-sm font-semibold text-navy">Monthly score {sc.live ? "(live)" : "(final)"} · {sc.month}</p>
                  <select value={scoreMonth} onChange={(e) => setScoreMonth(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border border-navy-line text-navy bg-white">
                    <option value="">This month (live)</option>
                    {(sc.frozenMonths || []).map((m: string) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  {sc.scores.map((row: any) => (
                    <Link key={row.employeeId} href={`/dashboard/employees/${row.employeeId}`} className="flex items-center justify-between gap-2 py-1.5 border-b border-navy-line/40 last:border-0 hover:bg-surface px-1 rounded">
                      <span className="text-sm text-navy flex items-center gap-2 min-w-0">
                        <span className="text-[12px] font-bold text-muted w-4 shrink-0">{row.rank ?? "—"}</span>
                        <span className="truncate">{row.name}</span>
                        {(row.isTop || sc.top?.employeeId === row.employeeId) && <Trophy className="w-3.5 h-3.5 text-amber-deep shrink-0" />}
                        {(row.isBottom || sc.bottom?.employeeId === row.employeeId) && <span className="text-[12px] font-bold uppercase bg-red-50 text-red-600 px-1.5 py-0.5 rounded shrink-0">needs support</span>}
                        {row.tooNew && <span className="text-[12px] text-muted shrink-0">too new to score</span>}
                      </span>
                      <span className={`text-sm font-bold shrink-0 ${row.score >= 70 ? "text-emerald-600" : row.score >= 40 ? "text-navy" : "text-red-600"}`}>{row.eligible || row.rank != null ? `${row.score}/100` : "—"}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {topRevenue && topRevenue.revenue > 0 && (
              <div className="bg-gradient-to-r from-amber/15 to-transparent border border-amber/30 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber/20 flex items-center justify-center"><Trophy className="w-5 h-5 text-amber-deep" /></div>
                <div><p className="text-xs text-muted uppercase tracking-wide">Top performer</p><p className="font-semibold text-navy">{topRevenue.name} — {money(topRevenue.revenue)}</p></div>
              </div>
            )}

            {/* Comparison table (desktop) */}
            <div className="hidden md:block bg-white rounded-2xl border border-navy-line overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface text-muted text-xs uppercase tracking-wide">
                    <th className="text-left font-semibold px-4 py-3">Employee</th>
                    <th className="text-right font-semibold px-4 py-3">Revenue</th>
                    <th className="text-right font-semibold px-4 py-3">Orders</th>
                    <th className="text-right font-semibold px-4 py-3">Leads</th>
                    <th className="text-right font-semibold px-4 py-3">Customers</th>
                    <th className="text-right font-semibold px-4 py-3">Conv.</th>
                    <th className="text-right font-semibold px-4 py-3">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-t border-navy-line hover:bg-surface/50">
                      <td className="px-4 py-3 font-medium text-navy">
                        <span className="inline-flex items-center gap-2">
                          {i === 0 && r.revenue > 0 && <Trophy className="w-3.5 h-3.5 text-amber-deep" />}
                          <Link href={`/dashboard/employees/${r.id}`} className="hover:text-amber-deep hover:underline">{r.name}</Link>
                          {r.status !== "active" && <span className="text-[12px] text-muted">(inactive)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-navy">{money(r.revenue)}</td>
                      <td className="px-4 py-3 text-right text-navy/70">{r.orders} <span className="text-muted text-xs">({r.delivered} done)</span></td>
                      <td className="px-4 py-3 text-right text-navy/70">{r.leads}</td>
                      <td className="px-4 py-3 text-right text-navy/70">{r.customers}</td>
                      <td className="px-4 py-3 text-right"><span className={`font-medium ${r.conversion >= 40 ? "text-emerald-600" : r.conversion >= 20 ? "text-amber-deep" : "text-navy/50"}`}>{r.conversion}%</span></td>
                      <td className="px-4 py-3 text-right text-navy/70">{money(r.pendingAmount)} <span className="text-muted text-xs">({r.pendingOrders})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards (mobile) */}
            <div className="md:hidden grid gap-3">
              {rows.map((r, i) => (
                <div key={r.id} className="bg-white rounded-2xl border border-navy-line p-4 shadow-card">
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-2 font-semibold text-navy">{i === 0 && r.revenue > 0 && <Trophy className="w-4 h-4 text-amber-deep" />}<Link href={`/dashboard/employees/${r.id}`} className="hover:text-amber-deep hover:underline">{r.name}</Link></span>
                    <span className="font-bold text-navy">{money(r.revenue)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <Mini label="Orders" value={r.orders} />
                    <Mini label="Leads" value={r.leads} />
                    <Mini label="Cust." value={r.customers} />
                    <Mini label="Conv." value={`${r.conversion}%`} />
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-navy-line text-xs text-muted">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {r.pendingOrders} pending</span>
                    <span>{money(r.pendingAmount)} to collect</span>
                  </div>
                </div>
              ))}
            </div>

            <TeamActivity />

            <p className="text-xs text-muted text-center">Revenue counts payments collected. Conversion = customers ÷ total contacts assigned. Pending = undelivered orders and uncollected balances.</p>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function TotalCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "bg-navy border-navy text-white" : "bg-white border-navy-line"}`}>
      <Icon className={`w-4 h-4 mb-1 ${accent ? "text-amber" : "text-amber-deep"}`} />
      <p className={`text-xl font-bold ${accent ? "text-amber" : "text-navy"}`}>{value}</p>
      <p className={`text-xs ${accent ? "text-white/50" : "text-muted"}`}>{label}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: any }) {
  return <div><p className="font-bold text-navy text-sm">{value}</p><p className="text-[12px] text-muted">{label}</p></div>;
}

function TeamActivity() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/audit").then((r) => r.json()).then((d) => { setLogs(d.logs || []); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);
  const LABELS: Record<string, string> = {
    "contact.create": "added a lead", "contact.update": "updated a contact",
    "order.create": "created an order", "order.status": "updated an order status",
    "order.payment": "recorded a payment", "message.send": "sent a message",
    "employee_account.create": "login created", "employee_account.update": "login updated",
  };
  if (!loaded || logs.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
      <h2 className="font-semibold text-navy mb-3">Recent team activity</h2>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {logs.map((l, i) => (
          <div key={i} className="flex items-center justify-between text-sm border-b border-navy-line/60 last:border-0 pb-2 last:pb-0">
            <span className="text-navy"><span className="font-medium">{l.actor}</span> <span className="text-navy/60">{LABELS[l.action] || l.action}</span></span>
            <span className="text-xs text-muted shrink-0 ml-3">{new Date(l.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted mt-3">Every employee action is logged automatically — this is your accountability trail.</p>
    </div>
  );
}
