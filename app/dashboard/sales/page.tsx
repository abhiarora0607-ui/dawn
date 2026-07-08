"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { ToastProvider, useToast } from "@/components/Toast";
import { Loader2, TrendingUp, Wallet, Clock, Users, Plus, X, Receipt, ExternalLink, Trash2 } from "lucide-react";

import { useSettings, money } from "@/lib/use-settings";

function Card({ label, value, icon: Icon, tone = "navy" }: { label: string; value: string; icon: any; tone?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-line p-4 shadow-card">
      <div className="flex items-center gap-1.5 mb-1"><Icon className="w-4 h-4 text-amber-deep" /><span className="text-xs text-muted">{label}</span></div>
      <p className={`text-xl font-bold ${tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : "text-navy"}`}>{value}</p>
    </div>
  );
}

function RevenueChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
      <p className="text-sm font-semibold text-navy mb-4">Revenue (6 months)</p>
      <div className="flex items-end justify-between gap-2 h-32">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="w-full bg-amber/20 rounded-t-lg relative" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 4 : 0 }}>
              <div className="absolute inset-0 bg-amber rounded-t-lg" style={{ opacity: 0.85 }} />
            </div>
            <span className="text-[10px] text-muted">{d.label}</span>
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
  const { currency } = useSettings();
  const { data } = useBrief();
  const { toast } = useToast();
  const [fin, setFin] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "sales" | "expenses">("overview");
  const [expModal, setExpModal] = useState(false);

  function load() {
    Promise.all([
      fetch("/api/finance").then((r) => r.json()),
      fetch("/api/sales").then((r) => r.json()),
      fetch("/api/expenses").then((r) => r.json()),
    ]).then(([f, s, e]) => { setFin(f); setSales(s.sales || []); setExpenses(e.expenses || []); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

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

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Sales" />
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div><h1 className="font-display font-semibold text-2xl text-navy">Sales &amp; finance</h1><p className="text-muted text-sm mt-1">Your money, at a glance.</p></div>
          <button onClick={() => setExpModal(true)} className="flex items-center gap-2 border border-navy-line text-navy font-medium px-4 py-2 rounded-xl hover:bg-surface shrink-0 text-sm"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">Expense</span></button>
        </div>

        <div className="flex gap-2 bg-white p-1 rounded-xl border border-navy-line w-fit">
          {(["overview", "sales", "expenses"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`text-sm font-medium px-4 py-2 rounded-lg capitalize transition-colors ${tab === t ? "bg-navy text-white" : "text-muted"}`}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading…</div>
        ) : tab === "overview" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Card label="Revenue (month)" value={money(c?.revenueMonth || 0, currency)} icon={TrendingUp} tone="green" />
              <Card label="Expenses (month)" value={money(c?.expensesMonth || 0, currency)} icon={Wallet} tone="red" />
              <Card label="Profit (month)" value={money(c?.profitMonth || 0, currency)} icon={TrendingUp} tone={c?.profitMonth >= 0 ? "green" : "red"} />
              <Card label="Pending" value={money(c?.pendingTotal || 0, currency)} icon={Clock} />
              <Card label="Active leads" value={String(c?.activeLeads || 0)} icon={Users} />
              <Card label="Conversion" value={`${c?.conversionRate || 0}%`} icon={TrendingUp} />
            </div>
            {fin?.charts?.revByMonth && <RevenueChart data={fin.charts.revByMonth} />}
            {fin?.charts?.topItems?.length > 0 && (
              <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
                <p className="text-sm font-semibold text-navy mb-3">Top-selling items</p>
                <div className="space-y-2">
                  {fin.charts.topItems.map((it: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm"><span className="text-navy/75">{it.name}</span><span className="font-semibold text-navy">{money(it.value, currency)}</span></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : tab === "sales" ? (
          sales.length === 0 ? <Empty label="No sales yet" sub="Record a sale by converting a lead to a customer." /> : (
            <div className="grid gap-2">
              {sales.map((s) => (
                <div key={s.id} className="bg-white rounded-xl border border-navy-line p-4 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy text-sm">{money(Number(s.total), currency)} <span className="text-xs font-normal text-muted">· {(s.items || []).length} item(s)</span></p>
                      <p className="text-xs text-muted">{new Date(s.date).toLocaleDateString()} · {s.payment_method}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${s.status === "paid" ? "bg-emerald-50 text-emerald-700" : s.status === "partial" ? "bg-amber/10 text-amber-deep" : "bg-red-50 text-red-600"}`}>{s.status}</span>
                      <a href={`/receipt/${s.id}?owner=1`} target="_blank" className="p-1.5 text-navy/40 hover:text-navy" title="Receipt"><Receipt className="w-4 h-4" /></a>
                    </div>
                  </div>
                  {Number(s.balance) > 0 && (
                    <button onClick={() => addPayment(s.id, Number(s.balance))} className="mt-2 text-xs font-medium text-amber-deep">+ Add payment (balance {money(Number(s.balance), currency)})</button>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          expenses.length === 0 ? <Empty label="No expenses logged" sub="Track costs to see real profit." /> : (
            <div className="grid gap-2">
              {expenses.map((e) => (
                <div key={e.id} className="bg-white rounded-xl border border-navy-line p-3 shadow-card flex items-center justify-between">
                  <div><p className="font-semibold text-navy text-sm">{e.category}{e.recurring ? <span className="ml-1.5 text-[10px] text-amber-deep">↻ monthly</span> : null}</p><p className="text-xs text-muted">{new Date(e.date).toLocaleDateString()}{e.note ? ` · ${e.note}` : ""}</p></div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-red-600">−{money(Number(e.amount), currency)}</span>
                    <button onClick={() => delExpense(e.id)} className="p-1.5 text-navy/40 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
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
