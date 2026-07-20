"use client";

// Everything slipping through the cracks, in one place. This is the screen that
// pays for itself: leads dying of neglect, money nobody chased, promises broken.

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useSettings, money } from "@/lib/use-settings";
import { ToastProvider, useToast } from "@/components/Toast";
import { LostDialog } from "@/components/SharedModals";
import {
  Loader2, Snowflake, Clock, Wallet, Truck, MessageCircle, Phone, CalendarDays, X,
} from "lucide-react";

type Tab = "cold" | "overdue" | "unpaid" | "stuck";

export default function AttentionPage() {
  return <ToastProvider><Inner /></ToastProvider>;
}

function Inner() {
  const { toast } = useToast();
  const { currency } = useSettings();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("cold");
  const [snooze, setSnooze] = useState<any>(null);
  const [lostFor, setLostFor] = useState<any>(null);

  function load() {
    fetch("/api/pulse").then((r) => r.json()).then((res) => { setD(res); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  // Snoozing = setting a new follow-up date. It takes the lead off this list
  // by making a real commitment, not by hiding it.
  async function setFollowUp(id: string, days: number) {
    const dt = new Date(); dt.setDate(dt.getDate() + days);
    const res = await fetch("/api/contacts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, followUpDate: dt.toISOString().slice(0, 10) }),
    });
    if (res.ok) { toast(days === 0 ? "Follow up today" : `Follow up in ${days} day(s)`); setSnooze(null); load(); }
    else toast("Couldn't update", "error");
  }

  async function markLost(id: string, note: string) {
    const res = await fetch("/api/contacts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, stage: "Lost", lostNote: note, logStage: true }),
    });
    if (res.ok) { toast("Marked Lost"); setLostFor(null); load(); }
    else toast("Couldn't update", "error");
  }

  if (loading) return <DashboardShell><DashTopbar pageTitle="Attention" /><div className="p-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div></DashboardShell>;
  if (!d || d.error) return <DashboardShell><DashTopbar pageTitle="Attention" /><div className="p-12 text-center text-muted">Couldn&apos;t load.</div></DashboardShell>;

  const a = d.attention;
  const TABS = [
    { id: "cold" as Tab, label: "Going cold", count: a.staleCount, icon: Snowflake },
    { id: "overdue" as Tab, label: "Overdue", count: a.overdueFollowUpCount + a.overdueTaskCount, icon: Clock },
    { id: "unpaid" as Tab, label: "To collect", count: a.unpaidCount, icon: Wallet },
    { id: "stuck" as Tab, label: "Not delivered", count: a.stuckOrderCount, icon: Truck },
  ];

  return (
    <DashboardShell>
      <DashTopbar pageTitle="Attention" />
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
        <p className="text-sm text-muted">Everything slipping. Deal with it here, or it turns into lost money.</p>

        <div className="flex gap-1.5 overflow-x-auto pb-1 dawn-scroll">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border ${tab === t.id ? "bg-navy text-white border-navy" : "bg-white text-navy/60 border-navy-line"}`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
              {t.count > 0 && <span className={`text-[12px] font-bold px-1.5 rounded-full ${tab === t.id ? "bg-white/20" : "bg-amber/15 text-amber-deep"}`}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* ------------------------------------------------------ GOING COLD */}
        {tab === "cold" && (
          a.stale.length === 0 ? <Empty msg="No leads are going cold. Every open lead has been touched recently." />
          : <>
            <p className="text-xs text-muted">A lead untouched past its stage&apos;s window. New leads go cold in 3 days, contacted in 7, negotiating in 14.</p>
            <div className="grid gap-2">
              {a.stale.map((s: any) => (
                <div key={s.id} className="bg-white rounded-xl border border-navy-line p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/dashboard/contacts/${s.id}`} className="font-semibold text-navy text-sm hover:text-amber-deep">{s.name}</Link>
                      <p className="text-xs text-muted mt-0.5">{s.stage} · {s.owner}</p>
                      <p className={`text-xs font-medium mt-0.5 ${s.idleDays >= s.threshold * 2 ? "text-red-600" : "text-amber-deep"}`}>
                        {s.idleDays} days with no contact
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.phone && <a href={`https://wa.me/${s.phone.replace(/[^0-9]/g, "")}`} target="_blank" className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"><MessageCircle className="w-4 h-4" /></a>}
                      {s.phone && <a href={`tel:${s.phone}`} className="p-2 text-navy/50 hover:bg-navy/5 rounded-lg"><Phone className="w-4 h-4" /></a>}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-navy-line">
                    <button onClick={() => setSnooze(s)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-navy-line text-navy py-2 rounded-lg hover:bg-surface"><CalendarDays className="w-3.5 h-3.5" /> Set follow-up</button>
                    <button onClick={() => setLostFor(s)} className="flex-1 text-xs font-medium border border-navy-line text-red-600 py-2 rounded-lg hover:bg-red-50">Mark Lost</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* --------------------------------------------------------- OVERDUE */}
        {tab === "overdue" && (
          a.overdueFollowUps.length === 0 && a.overdueTasks.length === 0 ? <Empty msg="Nothing is overdue. Every promise has been kept." />
          : <div className="grid gap-2">
            {a.overdueFollowUps.map((f: any) => (
              <div key={f.id} className="bg-white rounded-xl border border-red-200 p-4 shadow-card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/dashboard/contacts/${f.id}`} className="font-semibold text-navy text-sm hover:text-amber-deep">{f.name}</Link>
                  <p className="text-xs text-red-600 font-medium">Follow-up {f.daysLate} day(s) late · {f.owner}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setFollowUp(f.id, 0)} className="text-[12px] font-medium border border-navy-line text-navy px-2.5 py-1.5 rounded-lg">Today</button>
                  {f.phone && <a href={`https://wa.me/${f.phone.replace(/[^0-9]/g, "")}`} target="_blank" className="p-2 text-emerald-600 rounded-lg"><MessageCircle className="w-4 h-4" /></a>}
                </div>
              </div>
            ))}
            {a.overdueTasks.map((t: any) => (
              <div key={t.id} className="bg-white rounded-xl border border-red-200 p-4 shadow-card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-navy text-sm">{t.title}</p>
                  <p className="text-xs text-red-600 font-medium">Task {t.daysLate} day(s) late · {t.owner}</p>
                </div>
                <Link href="/dashboard/team-work" className="text-[12px] font-medium text-amber-deep shrink-0">Open</Link>
              </div>
            ))}
          </div>
        )}

        {/* ---------------------------------------------------------- UNPAID */}
        {tab === "unpaid" && (
          a.unpaid.length === 0 ? <Empty msg="Every rupee has been collected." />
          : <>
            <div className="bg-navy rounded-2xl p-5 text-white flex items-center justify-between">
              <div><p className="text-xs text-white/50 uppercase tracking-wide">Total outstanding</p><p className="text-2xl font-bold text-amber">{money(d.money.totalOwed, currency)}</p></div>
              <Wallet className="w-8 h-8 text-white/20" />
            </div>
            <div className="grid gap-2">
              {a.unpaid.map((u: any) => (
                <div key={u.id} className="bg-white rounded-xl border border-navy-line p-4 shadow-card flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy text-sm">{u.name}</p>
                    <p className="text-xs text-muted">{u.owner} · order {u.daysOld} day(s) old</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-bold ${u.daysOld > 14 ? "text-red-600" : "text-amber-deep"}`}>{money(u.balance, currency)}</span>
                    {u.phone && <a href={`https://wa.me/${u.phone.replace(/[^0-9]/g, "")}`} target="_blank" className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"><MessageCircle className="w-4 h-4" /></a>}
                  </div>
                </div>
              ))}
            </div>
            <Link href="/dashboard/orders" className="block text-center text-xs font-medium text-amber-deep">Record payments in Orders →</Link>
          </>
        )}

        {/* ----------------------------------------------------------- STUCK */}
        {tab === "stuck" && (
          a.stuckOrders.length === 0 ? <Empty msg="Every order is delivered." />
          : <div className="grid gap-2">
            {a.stuckOrders.map((o: any) => (
              <div key={o.id} className="bg-white rounded-xl border border-navy-line p-4 shadow-card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-navy text-sm">{o.name}</p>
                  <p className="text-xs text-muted">{o.owner} · {money(o.total, currency)}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[12px] font-bold uppercase bg-navy/5 text-navy/60 px-2 py-1 rounded">{o.status}</span>
                  <p className={`text-[12px] mt-1 ${o.daysOld > 7 ? "text-red-600 font-semibold" : "text-muted"}`}>{o.daysOld} days</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {snooze && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={() => setSnooze(null)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-5 animate-rise">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-navy">Follow up with {snooze.name}</h3>
              <button onClick={() => setSnooze(null)} className="p-1.5 text-navy/40"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-muted mb-4">Commit to a date and it leaves this list.</p>
            <div className="grid grid-cols-2 gap-2">
              {[{ l: "Today", d: 0 }, { l: "Tomorrow", d: 1 }, { l: "In 3 days", d: 3 }, { l: "Next week", d: 7 }].map((o) => (
                <button key={o.l} onClick={() => setFollowUp(snooze.id, o.d)} className="border border-navy-line text-navy text-sm font-medium py-2.5 rounded-xl hover:bg-surface">{o.l}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {lostFor && <LostDialog name={lostFor.name} onCancel={() => setLostFor(null)} onConfirm={(note) => markLost(lostFor.id, note)} />}
    </DashboardShell>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-line p-12 text-center shadow-card">
      <p className="text-sm text-navy font-medium">All clear</p>
      <p className="text-xs text-muted mt-1 max-w-sm mx-auto">{msg}</p>
    </div>
  );
}
