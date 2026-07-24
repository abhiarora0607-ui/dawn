// app/api/pulse/route.ts
// The business command centre. One call, everything an owner needs to see at
// 9am — ranked by what costs money if it goes unnoticed.
//
// Design rule: every number here is ACTIONABLE. If seeing it doesn't change
// what the owner does today, it doesn't belong on this screen.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";
import { touchActive } from "@/lib/touch";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }

const DAY = 86400000;
const OPEN_STAGES = ["New Lead", "Contacted", "Negotiating"];

// How long a lead can sit untouched before it's "going cold". Tuned per stage:
// a brand-new lead should be contacted fast; a negotiation can breathe longer.
const STALE_DAYS: Record<string, number> = { "New Lead": 3, "Contacted": 7, "Negotiating": 14 };

function startOfMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
function startOfPrevMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(); }

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });

  try {
    await touchActive(url, key, uid);
    const [contacts, sales, expenses, employees, tasks, activities, settingsRow] = await Promise.all([
      // full-scan: pulse counters over the book
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&deleted_at=is.null&select=id,name,phone,stage,employee_id,follow_up_date,created_at,instagram_handle,source`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${uid}&deleted_at=is.null&select=id,contact_id,employee_id,total,amount_paid,balance,status,order_status,date,items`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      // full-scan: money math needs every row
      fetch(`${url}/rest/v1/expenses?uid=eq.${uid}&deleted_at=is.null&select=amount,date,category`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name,status,is_owner`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      // full-scan: pulse counters over tasks
      fetch(`${url}/rest/v1/tasks?uid=eq.${uid}&select=id,title,due_date,done,employee_id`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/activities?uid=eq.${uid}&select=contact_id,created_at&order=created_at.desc&limit=500`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/business_settings?uid=eq.${uid}&select=revenue_target&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    const revenueTarget = Array.isArray(settingsRow) && settingsRow[0]?.revenue_target ? Number(settingsRow[0].revenue_target) : null;
    // Public menu views this week — the "your showcase is working" number.
    let menuViews7d = 0;
    try {
      const vc = await fetch(`${url}/rest/v1/events?uid=eq.${uid}&kind=eq.pricelist_view&created_at=gte.${new Date(Date.now() - 7 * 86400000).toISOString()}&select=id&limit=1`, { headers: { ...H(key), Prefer: "count=exact" }, cache: "no-store" });
      menuViews7d = Number(vc.headers.get("content-range")?.split("/")[1] || 0);
    } catch {}

    const C = Array.isArray(contacts) ? contacts : [];
    const S = (Array.isArray(sales) ? sales : []).filter((s: any) => s.order_status !== "Cancelled");
    const E = Array.isArray(expenses) ? expenses : [];
    const EMP = Array.isArray(employees) ? employees : [];
    const T = Array.isArray(tasks) ? tasks : [];
    const A = Array.isArray(activities) ? activities : [];

    const empName = (id: string) => EMP.find((e: any) => e.id === id)?.name || "Unassigned";
    const now = Date.now();
    const todayISO = new Date().toISOString().slice(0, 10);

    // Last time anything happened on each contact — the basis for "going cold".
    const lastTouch: Record<string, number> = {};
    for (const a of A) {
      const t = new Date(a.created_at).getTime();
      if (!lastTouch[a.contact_id] || t > lastTouch[a.contact_id]) lastTouch[a.contact_id] = t;
    }
    for (const s of S) {
      if (!s.contact_id) continue;
      const t = new Date(s.date).getTime();
      if (!lastTouch[s.contact_id] || t > lastTouch[s.contact_id]) lastTouch[s.contact_id] = t;
    }

    // ---------------------------------------------------------------- MONEY
    const monthStart = startOfMonth();
    const prevStart = startOfPrevMonth();
    const inMonth = (d: string, from: number, to = Infinity) => { const t = new Date(d).getTime(); return t >= from && t < to; };

    const revenueMTD = S.filter((s: any) => inMonth(s.date, monthStart)).reduce((a: number, s: any) => a + (Number(s.amount_paid) || 0), 0);
    const revenuePrev = S.filter((s: any) => inMonth(s.date, prevStart, monthStart)).reduce((a: number, s: any) => a + (Number(s.amount_paid) || 0), 0);
    const expensesMTD = E.filter((e: any) => inMonth(e.date, monthStart)).reduce((a: number, e: any) => a + (Number(e.amount) || 0), 0);
    const profitMTD = revenueMTD - expensesMTD;
    const revenueTrend = revenuePrev > 0 ? Math.round(((revenueMTD - revenuePrev) / revenuePrev) * 100) : null;

    // Uncollected cash — the most expensive thing to not look at.
    const unpaid = S.filter((s: any) => Number(s.balance) > 0)
      .map((s: any) => ({
        id: s.id,
        contactId: s.contact_id,
        name: C.find((c: any) => c.id === s.contact_id)?.name || "Walk-in",
        phone: C.find((c: any) => c.id === s.contact_id)?.phone || "",
        balance: Number(s.balance),
        daysOld: Math.floor((now - new Date(s.date).getTime()) / DAY),
        owner: empName(s.employee_id),
      }))
      .sort((a: any, b: any) => b.daysOld - a.daysOld);
    const totalOwed = unpaid.reduce((a: number, u: any) => a + u.balance, 0);

    // ------------------------------------------------------- LEADS GOING COLD
    // A lead nobody has touched past its stage's patience window.
    const stale = C.filter((c: any) => OPEN_STAGES.includes(c.stage))
      .map((c: any) => {
        const last = lastTouch[c.id] || new Date(c.created_at).getTime();
        const idle = Math.floor((now - last) / DAY);
        return { ...c, idleDays: idle, threshold: STALE_DAYS[c.stage] ?? 7, owner: empName(c.employee_id) };
      })
      .filter((c: any) => c.idleDays >= c.threshold)
      .sort((a: any, b: any) => b.idleDays - a.idleDays);

    // ------------------------------------------------------------- OVERDUE
    const overdueFollowUps = C.filter((c: any) => OPEN_STAGES.includes(c.stage) && c.follow_up_date && c.follow_up_date < todayISO)
      .map((c: any) => ({ id: c.id, name: c.name, phone: c.phone, date: c.follow_up_date, owner: empName(c.employee_id), daysLate: Math.floor((now - new Date(c.follow_up_date).getTime()) / DAY) }))
      .sort((a: any, b: any) => b.daysLate - a.daysLate);

    const overdueTasks = T.filter((t: any) => !t.done && t.due_date && t.due_date < todayISO)
      .map((t: any) => ({ id: t.id, title: t.title, date: t.due_date, owner: empName(t.employee_id), daysLate: Math.floor((now - new Date(t.due_date).getTime()) / DAY) }))
      .sort((a: any, b: any) => b.daysLate - a.daysLate);

    // Today's agenda — follow-ups and tasks due right now.
    const dueToday = [
      ...C.filter((c: any) => OPEN_STAGES.includes(c.stage) && c.follow_up_date === todayISO).map((c: any) => ({ kind: "Follow-up", label: c.name, id: c.id, phone: c.phone, owner: empName(c.employee_id) })),
      ...T.filter((t: any) => !t.done && t.due_date === todayISO).map((t: any) => ({ kind: "Task", label: t.title, id: t.id, phone: "", owner: empName(t.employee_id) })),
    ];

    // Orders stuck in fulfilment — the source of angry customers.
    const stuckOrders = S.filter((s: any) => (s.order_status || "Placed") !== "Delivered")
      .map((s: any) => ({
        id: s.id,
        name: C.find((c: any) => c.id === s.contact_id)?.name || "Walk-in",
        status: s.order_status || "Placed",
        daysOld: Math.floor((now - new Date(s.date).getTime()) / DAY),
        total: Number(s.total),
        owner: empName(s.employee_id),
      }))
      .filter((s: any) => s.daysOld >= 3)
      .sort((a: any, b: any) => b.daysOld - a.daysOld);

    // ---------------------------------------------------------------- TEAM
    const team = EMP.filter((e: any) => e.status === "active").map((e: any) => {
      const mine = C.filter((c: any) => c.employee_id === e.id);
      const myOrders = S.filter((s: any) => s.employee_id === e.id);
      const won = mine.filter((c: any) => c.stage === "Customer (Won)").length;
      const closed = mine.filter((c: any) => ["Customer (Won)", "Lost"].includes(c.stage)).length;
      const revenue = myOrders.reduce((a: number, s: any) => a + (Number(s.amount_paid) || 0), 0);
      return {
        id: e.id, name: e.name,
        revenue,
        leads: mine.filter((c: any) => OPEN_STAGES.includes(c.stage)).length,
        won,
        orders: myOrders.length,
        // Conversion measured against DECIDED leads, not all leads — an employee
        // with many open leads shouldn't be punished for deals still in play.
        conversion: closed > 0 ? Math.round((won / closed) * 100) : null,
        stale: stale.filter((c: any) => c.employee_id === e.id).length,
        overdue: overdueFollowUps.filter((f: any) => f.owner === e.name).length + overdueTasks.filter((t: any) => t.owner === e.name).length,
        pending: myOrders.reduce((a: number, s: any) => a + (Number(s.balance) || 0), 0),
      };
    }).sort((a: any, b: any) => b.revenue - a.revenue);

    const ranked = team.filter((t: any) => t.orders > 0 || t.leads > 0);
    const topPerformer = ranked[0] || null;
    // "Needs attention" is not the lowest revenue — it's the person with the
    // most neglected work. That's the actionable signal.
    const needsAttention = [...team].sort((a: any, b: any) => (b.stale + b.overdue) - (a.stale + a.overdue))[0] || null;

    // ------------------------------------------------------------ CUSTOMERS
    const customers = C.filter((c: any) => c.stage === "Customer (Won)");
    const custStats = customers.map((c: any) => {
      const mine = S.filter((s: any) => s.contact_id === c.id);
      const spend = mine.reduce((a: number, s: any) => a + (Number(s.amount_paid) || 0), 0);
      const last = mine.length ? Math.max(...mine.map((s: any) => new Date(s.date).getTime())) : new Date(c.created_at).getTime();
      return { id: c.id, name: c.name, phone: c.phone, spend, orders: mine.length, daysSince: Math.floor((now - last) / DAY) };
    });
    const bestCustomers = [...custStats].sort((a, b) => b.spend - a.spend).slice(0, 5);
    // Customers who bought once and vanished — the cheapest revenue in the business.
    const atRisk = custStats.filter((c) => c.daysSince >= 45 && c.orders > 0).sort((a, b) => b.spend - a.spend).slice(0, 5);
    const repeatRate = customers.length ? Math.round((custStats.filter((c) => c.orders > 1).length / customers.length) * 100) : 0;
    const avgOrderValue = S.length ? Math.round(S.reduce((a: number, s: any) => a + Number(s.total), 0) / S.length) : 0;

    // ------------------------------------------------------------- PIPELINE
    const pipeline = OPEN_STAGES.map((st) => ({ stage: st, count: C.filter((c: any) => c.stage === st).length }));
    const wonCount = C.filter((c: any) => c.stage === "Customer (Won)").length;
    const lostCount = C.filter((c: any) => c.stage === "Lost").length;
    const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : null;

    // What's actually killing deals — the Lost reasons, counted.
    const newThisWeek = C.filter((c: any) => now - new Date(c.created_at).getTime() < 7 * DAY).length;

    // Best lead source, by how many became customers (not by volume).
    const sources: Record<string, { total: number; won: number }> = {};
    for (const c of C) {
      const s = c.source || "Other";
      sources[s] = sources[s] || { total: 0, won: 0 };
      sources[s].total++;
      if (c.stage === "Customer (Won)") sources[s].won++;
    }
    const bestSource = Object.entries(sources)
      .filter(([, v]) => v.total >= 2)
      .map(([name, v]) => ({ name, total: v.total, won: v.won, rate: Math.round((v.won / v.total) * 100) }))
      .sort((a, b) => b.rate - a.rate)[0] || null;

    return NextResponse.json({
      menuViews7d,
      money: { revenueMTD, expensesMTD, profitMTD, revenueTrend, totalOwed, avgOrderValue, revenueTarget, targetPct: revenueTarget ? Math.min(100, Math.round((revenueMTD / revenueTarget) * 100)) : null },
      attention: {
        unpaid: unpaid.slice(0, 8),
        unpaidCount: unpaid.length,
        stale: stale.slice(0, 8),
        staleCount: stale.length,
        overdueFollowUps: overdueFollowUps.slice(0, 8),
        overdueFollowUpCount: overdueFollowUps.length,
        overdueTasks: overdueTasks.slice(0, 8),
        overdueTaskCount: overdueTasks.length,
        stuckOrders: stuckOrders.slice(0, 8),
        stuckOrderCount: stuckOrders.length,
        dueToday,
      },
      team: { all: team, topPerformer, needsAttention },
      customers: { best: bestCustomers, atRisk, repeatRate, total: customers.length },
      pipeline: { stages: pipeline, winRate, newThisWeek, bestSource },
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load the dashboard." }, { status: 500 });
  }
}
