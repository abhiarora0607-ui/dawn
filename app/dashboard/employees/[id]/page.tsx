"use client";

// The employee hub — everything one staff member owns, as related lists you
// can navigate into. Reachable by clicking an employee anywhere in the app.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useSettings, money } from "@/lib/use-settings";
import {
  Loader2, ArrowLeft, Users, ShoppingBag, TrendingUp, Clock, CheckSquare,
  Phone, MessageCircle, Wallet, AlertTriangle,
} from "lucide-react";

export default function EmployeeHub() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { currency } = useSettings();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/employee-detail?id=${id}`).then((r) => r.json()).then((res) => { setD(res); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <DashboardShell><DashTopbar pageTitle="Employee" /><div className="p-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div></DashboardShell>;
  if (!d || d.error) return <DashboardShell><DashTopbar pageTitle="Employee" /><div className="p-12 text-center text-muted">Couldn&apos;t load this employee.</div></DashboardShell>;

  const e = d.employee, s = d.stats;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <DashboardShell>
      <DashTopbar pageTitle="Employee" />
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
        <button onClick={() => router.push("/dashboard/employees")} className="flex items-center gap-1.5 text-sm text-muted hover:text-navy"><ArrowLeft className="w-4 h-4" /> Employees</button>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display font-semibold text-2xl text-navy flex items-center gap-2">
                {e.name}
                {e.is_owner && <span className="text-[9px] font-bold uppercase bg-amber/15 text-amber-deep px-1.5 py-0.5 rounded">You</span>}
              </h1>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm text-muted">
                {e.role && <span>{e.role}</span>}
                {e.phone && <span>{e.phone}</span>}
                {!e.is_owner && <span>· {currency}{e.monthly_salary}/mo</span>}
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${e.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-navy/5 text-navy/50"}`}>{e.status}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Performance snapshot */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Collected" value={money(s.revenue, currency)} icon={TrendingUp} tone="green" />
          <Stat label="Open leads" value={String(s.openLeads)} icon={Users} />
          <Stat label="Customers" value={String(s.customers)} icon={Users} />
          <Stat label="Close rate" value={s.conversion != null ? `${s.conversion}%` : "—"} icon={TrendingUp} />
        </div>
        {(s.overdueFollowUps > 0 || s.pending > 0) && (
          <div className="flex flex-wrap gap-3">
            {s.overdueFollowUps > 0 && <span className="text-xs font-medium text-red-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {s.overdueFollowUps} overdue follow-up(s)</span>}
            {s.pending > 0 && <span className="text-xs font-medium text-amber-deep flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> {money(s.pending, currency)} uncollected</span>}
          </div>
        )}

        {/* Related: contacts */}
        <Section title="Contacts" count={d.contacts.length} icon={Users}>
          {d.contacts.length === 0 ? <EmptyRow msg="No contacts assigned." /> : d.contacts.map((c: any) => {
            const overdue = c.follow_up_date && c.follow_up_date < today;
            const wa = (c.phone || "").replace(/[^0-9]/g, "");
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-navy-line/40 last:border-0 hover:bg-surface">
                <Link href={`/dashboard/contacts/${c.id}`} className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy truncate">{c.name}</p>
                  <p className="text-[11px] text-muted">{c.stage}{c.follow_up_date ? <span className={overdue ? "text-red-600 font-medium" : ""}> · follow up {new Date(c.follow_up_date).toLocaleDateString()}</span> : ""}</p>
                </Link>
                {wa && <a href={`https://wa.me/${wa}`} target="_blank" className="p-1.5 text-emerald-600 shrink-0"><MessageCircle className="w-4 h-4" /></a>}
              </div>
            );
          })}
        </Section>

        {/* Related: orders */}
        <Section title="Orders" count={d.orders.length} icon={ShoppingBag}>
          {d.orders.length === 0 ? <EmptyRow msg="No orders handled." /> : d.orders.map((o: any) => (
            <Link key={o.id} href={o.contact_id ? `/dashboard/contacts/${o.contact_id}` : "/dashboard/orders"} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-navy-line/40 last:border-0 hover:bg-surface">
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy truncate">{o.customerName}</p>
                <p className="text-[11px] text-muted">{new Date(o.date).toLocaleDateString()} · {o.order_status || "Placed"}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-navy">{money(Number(o.total), currency)}</p>
                <p className={`text-[10px] font-bold uppercase ${o.status === "paid" ? "text-emerald-600" : o.status === "partial" ? "text-amber-deep" : "text-red-500"}`}>{o.status}</p>
              </div>
            </Link>
          ))}
        </Section>

        {/* Related: open tasks */}
        <Section title="Open tasks" count={d.tasks.length} icon={CheckSquare}>
          {d.tasks.length === 0 ? <EmptyRow msg="No open tasks." /> : d.tasks.map((t: any) => {
            const overdue = t.due_date && t.due_date < today;
            return (
              <div key={t.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-navy-line/40 last:border-0">
                <p className="text-sm text-navy min-w-0 truncate">{t.title}</p>
                {t.due_date && <span className={`text-[11px] shrink-0 ${overdue ? "text-red-600 font-medium" : "text-muted"}`}>{overdue ? "overdue · " : ""}{new Date(t.due_date).toLocaleDateString()}</span>}
              </div>
            );
          })}
        </Section>

        {/* Related: salary history */}
        {!e.is_owner && (
          <Section title="Salary history" count={d.salaryHistory.length} icon={Wallet}>
            {d.salaryHistory.length === 0 ? <EmptyRow msg="No salary posted yet." /> : d.salaryHistory.map((sal: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-navy-line/40 last:border-0">
                <p className="text-sm text-navy">{new Date(sal.date).toLocaleDateString(undefined, { month: "long", year: "numeric" })}{sal.recurring ? <span className="ml-1.5 text-[10px] text-amber-deep">↻ monthly</span> : ""}</p>
                <span className="text-sm font-semibold text-navy">{money(Number(sal.amount), currency)}</span>
              </div>
            ))}
          </Section>
        )}
      </div>
    </DashboardShell>
  );
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-line p-4 shadow-card">
      <Icon className="w-4 h-4 text-amber-deep mb-1" />
      <p className={`text-lg font-bold ${tone === "green" ? "text-emerald-600" : "text-navy"}`}>{value}</p>
      <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
    </div>
  );
}

function Section({ title, count, icon: Icon, children }: { title: string; count: number; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-line shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="text-sm font-semibold text-navy flex items-center gap-1.5"><Icon className="w-4 h-4 text-navy/40" /> {title}</p>
        <span className="text-[10px] font-bold text-navy/40 bg-surface px-2 py-0.5 rounded-full">{count}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function EmptyRow({ msg }: { msg: string }) {
  return <p className="px-4 py-4 text-sm text-muted">{msg}</p>;
}
