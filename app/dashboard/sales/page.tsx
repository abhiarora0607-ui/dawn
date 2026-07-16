"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { ToastProvider, useToast } from "@/components/Toast";
import { Loader2, TrendingUp, Wallet, Clock, Users, Plus, X, Receipt, ExternalLink, Trash2 } from "lucide-react";

import { useSettings, money } from "@/lib/use-settings";

function Card({ label, value, icon: Icon, tone = "navy", trend }: { label: string; value: string; icon: any; tone?: string; trend?: number | null }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-line p-4 shadow-card">
      <div className="flex items-center gap-1.5 mb-1"><Icon className="w-4 h-4 text-amber-deep" /><span className="text-xs text-muted">{label}</span></div>
      <p className={`text-xl font-bold ${tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : "text-navy"}`}>{value}</p>
      {trend != null && (
        <p className={`text-[11px] font-medium ${trend >= 0 ? "text-emerald-600" : "text-red-600"}`}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs prev</p>
      )}
    </div>
  );
}

function CashFlowChart({ data, currency }: { data: { label: string; in: number; out: number }[]; currency: string }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => Math.max(d.in, d.out)));
  // Keep the axis readable: cap visible bars to a sample if very long.
  const show = data.length > 31 ? data.filter((_, i) => i % Math.ceil(data.length / 31) === 0) : data;
  return (
    <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-navy">Money in vs out</p>
        <div className="flex gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> In</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Out</span>
        </div>
      </div>
      <div className="flex items-end gap-1 h-40 overflow-x-auto dawn-scroll">
        {show.map((d, i) => (
          <div key={i} className="flex-1 min-w-[16px] flex flex-col items-center gap-0.5 group relative">
            <div className="flex items-end gap-0.5 h-36 w-full justify-center">
              <div className="w-1/2 bg-emerald-500 rounded-t" style={{ height: `${(d.in / max) * 100}%` }} />
              <div className="w-1/2 bg-red-400 rounded-t" style={{ height: `${(d.out / max) * 100}%` }} />
            </div>
            <span className="text-[9px] text-muted whitespace-nowrap">{d.label}</span>
            <div className="absolute bottom-full mb-1 hidden group-hover:block bg-navy text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10">
              in {currency}{d.in} · out {currency}{d.out}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpenseModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ amount: "", category: "Inventory", note: "", date: new Date().toISOString().slice(0, 10), recurring: false });
  const [saving, setSaving] = useState(false);
  const cats = ["Inventory", "Marketing", "Packaging", "Shipping", "Tools", "Rent", "Salaries", "Other"];

  async function save() {
    if (!f.amount || Number(f.amount) < 0) { toast("Enter a valid amount.", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      if (res.ok) { toast("Expense added"); onAdded(); onClose(); } else toast("Failed", "error");
    } catch { toast("Network error", "error"); }
    setSaving(false);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-5 animate-rise">
        <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-navy">Add expense</h3><button onClick={onClose} className="p-1.5 text-navy/40"><X className="w-5 h-5" /></button></div>
        <div className="space-y-3">
          <input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="Amount" className="inp" />
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="inp">{cats.map((c) => <option key={c}>{c}</option>)}</select>
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="inp" />
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (optional)" className="inp" />
          <label className="flex items-center gap-2 text-sm text-navy cursor-pointer">
            <input type="checkbox" checked={f.recurring} onChange={(e) => setF({ ...f, recurring: e.target.checked })} /> Repeat monthly (recurring expense)
          </label>
          <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl disabled:opacity-60">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Add expense</button>
        </div>
        <style jsx>{`.inp{width:100%;padding:0.6rem 0.75rem;border:1px solid #E4E8F0;border-radius:0.75rem;font-size:0.875rem;color:#16233F;outline:none}.inp:focus{border-color:#FF9E43}`}</style>
      </div>
    </div>
  );
}

function SalesInner() {
  const { data } = useBrief();
  const { currency } = useSettings();
  const { toast } = useToast();
  const [fin, setFin] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "sales" | "expenses">("overview");
  const [expModal, setExpModal] = useState(false);
  const [range, setRange] = useState("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function load() {
    setLoading(true);
    let q = `/api/finance?range=${range}`;
    if (range === "custom" && customFrom && customTo) q += `&from=${customFrom}&to=${customTo}`;
    fetch(q).then((r) => r.json()).then((f) => { setFin(f); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range, customFrom, customTo]);

  async function addPayment(saleId: string, balance: number) {
    const amt = prompt(`Add payment (balance ${currency}${balance}):`);
    if (!amt) return;
    await fetch("/api/sales", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: saleId, addPayment: Number(amt), method: "cash" }) });
    toast("Payment recorded"); load();
  }
  async function delExpense(id: string) {
    await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
    toast("Expense deleted"); load();
  }

  const c = fin?.cards;
  const mg = fin?.margin;
  const sales = fin?.lists?.sales || [];
  const expenses = fin?.lists?.expenses || [];

  const RANGES = [
    { k: "today", l: "Today" }, { k: "week", l: "Week" }, { k: "month", l: "Month" },
    { k: "last_month", l: "Last month" }, { k: "quarter", l: "90 days" }, { k: "year", l: "Year" }, { k: "custom", l: "Custom" },
  ];

  // Group a dated list by day for readable, running-total sections.
  function groupByDay(rows: any[], amountFn: (r: any) => number) {
    const groups: Record<string, { rows: any[]; total: number }> = {};
    for (const r of rows) {
      const day = new Date(r.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
      const g = (groups[day] = groups[day] || { rows: [], total: 0 });
      g.rows.push(r); g.total += amountFn(r);
    }
    return Object.entries(groups);
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Finance" />
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div><h1 className="font-display font-semibold text-2xl text-navy">Finance</h1><p className="text-muted text-sm mt-1">{fin?.range?.label || "Your money"}, at a glance.</p></div>
          <button onClick={() => setExpModal(true)} className="flex items-center gap-2 border border-navy-line text-navy font-medium px-4 py-2 rounded-xl hover:bg-surface shrink-0 text-sm"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">Expense</span></button>
        </div>

        {/* Date range control — everything below obeys it */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 dawn-scroll">
          {RANGES.map((r) => (
            <button key={r.k} onClick={() => setRange(r.k)} className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border ${range === r.k ? "bg-navy text-white border-navy" : "bg-white text-navy/60 border-navy-line"}`}>{r.l}</button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-navy-line text-navy" />
            <span className="text-muted">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-3 py-2 rounded-xl border border-navy-line text-navy" />
          </div>
        )}

        <div className="flex gap-2 bg-white p-1 rounded-xl border border-navy-line w-fit">
          {(["overview", "sales", "expenses"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`text-sm font-medium px-4 py-2 rounded-lg capitalize transition-colors ${tab === t ? "bg-navy text-white" : "text-muted"}`}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading…</div>
        ) : !fin?.available ? (
          <Empty label="No finance data yet" sub="Record an order or an expense to see your numbers." />
        ) : tab === "overview" ? (
          <div className="space-y-4">
            {fin.missingCost?.length > 0 && (
              <div className="bg-amber/10 border border-amber/40 rounded-2xl p-4">
                <p className="text-sm font-semibold text-navy flex items-center gap-1.5"><Wallet className="w-4 h-4 text-amber-deep" /> {fin.missingCost.length} item(s) have no cost set</p>
                <p className="text-xs text-muted mt-1">Margin and profit are incomplete until these have a cost.</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {fin.missingCost.slice(0, 6).map((it: any) => (
                    <Link key={it.id} href="/dashboard/price-list" className="text-[11px] font-medium bg-white border border-amber/40 text-navy px-2 py-1 rounded-lg hover:border-amber">{it.name}</Link>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Card label="Revenue" value={money(c?.revenue || 0, currency)} icon={TrendingUp} tone="green" trend={c?.revenueTrend} />
              <Card label="Gross margin" value={mg?.marginPct != null ? `${mg.marginPct}%` : "—"} icon={TrendingUp} tone={(mg?.marginPct ?? 0) >= 0 ? "green" : "red"} />
              <Card label="Profit" value={money(c?.profit || 0, currency)} icon={TrendingUp} tone={(c?.profit ?? 0) >= 0 ? "green" : "red"} trend={c?.profitTrend} />
              <Card label="Cost of goods" value={money(mg?.cogs || 0, currency)} icon={Wallet} />
              <Card label="Other expenses" value={money(mg?.opex || 0, currency)} icon={Wallet} tone="red" />
              <Card label="Owed to you" value={money(c?.pendingTotal || 0, currency)} icon={Clock} />
            </div>

            {fin.forecast != null && fin.forecast > (c?.revenue || 0) && (
              <div className="bg-navy/5 border border-navy-line rounded-2xl p-4 text-sm text-navy">
                At your current pace, {fin.range.label.toLowerCase()} is on track for about <span className="font-bold">{money(fin.forecast, currency)}</span> in revenue.
              </div>
            )}

            <CashFlowChart data={fin.cashflow} currency={currency} />

            {/* Receivables aging */}
            {c?.pendingTotal > 0 && (
              <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
                <p className="text-sm font-semibold text-navy mb-3">Money owed, by age</p>
                <div className="grid grid-cols-4 gap-2">
                  {[["0–7 days", fin.aging.d0_7, "text-navy"], ["8–30", fin.aging.d8_30, "text-amber-deep"], ["31–60", fin.aging.d31_60, "text-orange-600"], ["60+", fin.aging.d60plus, "text-red-600"]].map(([lab, val, col]: any) => (
                    <div key={lab} className="text-center bg-surface rounded-xl p-2">
                      <p className={`text-sm font-bold ${col}`}>{money(val, currency)}</p>
                      <p className="text-[10px] text-muted">{lab}</p>
                    </div>
                  ))}
                </div>
                {fin.aging.d60plus > 0 && <p className="text-[11px] text-red-500 mt-2">{money(fin.aging.d60plus, currency)} is over 60 days old — chase it or write it off.</p>}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              {fin.charts?.topItems?.length > 0 && (
                <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
                  <p className="text-sm font-semibold text-navy mb-3">Top items</p>
                  <div className="space-y-2">
                    {fin.charts.topItems.map((it: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-navy/75 truncate">{it.name} <span className="text-[10px] text-muted">×{it.units}</span></span>
                        <span className="font-semibold text-navy shrink-0 ml-2">{money(it.value, currency)}{it.marginPct != null && <span className="text-[10px] font-normal text-emerald-600 ml-1">{it.marginPct}%</span>}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {fin.charts?.expenseByCategory?.length > 0 && (
                <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
                  <p className="text-sm font-semibold text-navy mb-3">Where the money goes</p>
                  <div className="space-y-2">
                    {fin.charts.expenseByCategory.map((cat: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm"><span className="text-navy/75">{cat.name}</span><span className="font-semibold text-navy">{money(cat.value, currency)}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : tab === "sales" ? (
          sales.length === 0 ? <Empty label="No sales in this period" sub="Try a wider date range." /> : (
            <div className="space-y-4">
              {groupByDay(sales, (s) => Number(s.amount_paid) || 0).map(([day, g]) => (
                <div key={day}>
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <p className="text-xs font-semibold text-navy/70 uppercase tracking-wide">{day}</p>
                    <p className="text-xs font-semibold text-emerald-600">+{money(g.total, currency)}</p>
                  </div>
                  <div className="grid gap-2">
                    {g.rows.map((s: any) => (
                      <div key={s.id} className="bg-white rounded-xl border border-navy-line p-4 shadow-card">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-navy text-sm">{money(Number(s.total), currency)} <span className="text-xs font-normal text-muted">· {(s.items || []).length} item(s)</span></p>
                            <p className="text-xs text-muted">{s.payment_method || "—"}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${s.status === "paid" ? "bg-emerald-50 text-emerald-700" : s.status === "partial" ? "bg-amber/10 text-amber-deep" : "bg-red-50 text-red-600"}`}>{s.status}</span>
                            <a href={`/receipt/${s.share_token || s.id}?owner=1`} target="_blank" className="p-1.5 text-navy/40 hover:text-navy" title="Receipt"><Receipt className="w-4 h-4" /></a>
                          </div>
                        </div>
                        {Number(s.balance) > 0 && (
                          <button onClick={() => addPayment(s.id, Number(s.balance))} className="mt-2 text-xs font-medium text-amber-deep">+ Add payment (balance {money(Number(s.balance), currency)})</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          expenses.length === 0 ? <Empty label="No expenses in this period" sub="Try a wider date range." /> : (
            <div className="space-y-4">
              {groupByDay(expenses, (e) => Number(e.amount) || 0).map(([day, g]) => (
                <div key={day}>
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <p className="text-xs font-semibold text-navy/70 uppercase tracking-wide">{day}</p>
                    <p className="text-xs font-semibold text-red-600">−{money(g.total, currency)}</p>
                  </div>
                  <div className="grid gap-2">
                    {g.rows.map((e: any) => (
                      <div key={e.id} className="bg-white rounded-xl border border-navy-line p-3 shadow-card flex items-center justify-between">
                        <div><p className="font-semibold text-navy text-sm">{e.category}{e.recurring ? <span className="ml-1.5 text-[10px] text-amber-deep">↻ monthly</span> : null}{e.source === "order" ? <span className="ml-1.5 text-[10px] text-navy/40">cost of goods</span> : null}</p><p className="text-xs text-muted">{e.note || ""}</p></div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-red-600">−{money(Number(e.amount), currency)}</span>
                          {e.source !== "order" && e.source !== "salary" && <button onClick={() => delExpense(e.id)} className="p-1.5 text-navy/40 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
      {expModal && <ExpenseModal onClose={() => setExpModal(false)} onAdded={load} />}
    </DashboardShell>
  );
}

function Empty({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-line p-12 text-center shadow-card">
      <h2 className="text-lg font-semibold text-navy mb-2">{label}</h2>
      <p className="text-muted text-sm max-w-sm mx-auto">{sub}</p>
    </div>
  );
}

export default function Sales() {
  return <ToastProvider><SalesInner /></ToastProvider>;
}
