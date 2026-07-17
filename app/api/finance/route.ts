// app/api/finance/route.ts
// The finance engine. Everything is computed within a chosen date range, and
// compared against the previous equivalent period, so a number always has
// context. Revenue = money actually collected; cancelled orders are excluded.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { touchActive } from "@/lib/touch";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

const DAY = 86400000;

// Resolve a named range (or a custom from/to) into a window and the previous
// equivalent window of the same length, for comparison.
function resolveRange(range: string, fromStr?: string | null, toStr?: string | null) {
  const now = new Date();
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
  let from: number, to: number, label: string;

  switch (range) {
    case "today": from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); to = endToday; label = "Today"; break;
    case "week": from = endToday - 6 * DAY; to = endToday; label = "Last 7 days"; break;
    case "last_month": {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      from = d.getTime(); to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).getTime(); label = "Last month"; break;
    }
    case "quarter": from = endToday - 89 * DAY; to = endToday; label = "Last 90 days"; break;
    case "year": from = new Date(now.getFullYear(), 0, 1).getTime(); to = endToday; label = "This year"; break;
    case "custom": {
      from = fromStr ? new Date(fromStr).getTime() : endToday - 30 * DAY;
      to = toStr ? new Date(toStr + "T23:59:59").getTime() : endToday;
      label = "Custom"; break;
    }
    case "month":
    default: from = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); to = endToday; label = "This month"; break;
  }
  const span = to - from;
  const prevTo = from - 1;
  const prevFrom = from - span - 1;
  return { from, to, prevFrom, prevTo, label, span };
}

function pctChange(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export async function GET(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ available: false });

  const p = new URL(req.url).searchParams;
  const range = p.get("range") || "month";
  const { from, to, prevFrom, prevTo, label } = resolveRange(range, p.get("from"), p.get("to"));

  try {
    await touchActive(url, key, uid);
    const [salesRaw, expenses, contacts, items] = await Promise.all([
      fetch(`${url}/rest/v1/sales?uid=eq.${uid}&deleted_at=is.null&select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/expenses?uid=eq.${uid}&deleted_at=is.null&select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&deleted_at=is.null&select=stage,source,created_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/catalog_items?uid=eq.${uid}&deleted_at=is.null&select=id,name,price,cost,type,is_active`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);

    // Cancelled orders never count toward money.
    const S = (Array.isArray(salesRaw) ? salesRaw : []).filter((s: any) => s.order_status !== "Cancelled");
    const E = Array.isArray(expenses) ? expenses : [];
    const C = Array.isArray(contacts) ? contacts : [];
    const I = Array.isArray(items) ? items : [];

    const t = (d: string) => new Date(d).getTime();
    const inRange = (d: string, a: number, b: number) => { const x = t(d); return x >= a && x <= b; };

    // Products with no cost silently make margin look like 100%.
    const missingCost = I.filter((it: any) => it.is_active && it.type === "product" && (it.cost == null || Number(it.cost) === 0))
      .map((it: any) => ({ id: it.id, name: it.name }));

    // ---- window aggregates (a reusable computation for cur & prev) ----
    function windowStats(a: number, b: number) {
      const sales = S.filter((s: any) => inRange(s.date, a, b));
      const exp = E.filter((e: any) => inRange(e.date, a, b));
      const revenue = sales.reduce((x: number, s: any) => x + (Number(s.amount_paid) || 0), 0);
      const cogs = exp.filter((e: any) => e.source === "order").reduce((x: number, e: any) => x + (Number(e.amount) || 0), 0);
      const opex = exp.filter((e: any) => e.source !== "order").reduce((x: number, e: any) => x + (Number(e.amount) || 0), 0);
      return { revenue, cogs, opex, expenses: cogs + opex, profit: revenue - cogs - opex, orders: sales.length };
    }
    const cur = windowStats(from, to);
    const prev = windowStats(prevFrom, prevTo);

    const grossMargin = cur.revenue - cur.cogs;
    const marginPct = cur.revenue > 0 ? Math.round((grossMargin / cur.revenue) * 100) : null;

    // Pending is always "as of now" — money owed doesn't belong to a period.
    const pendingTotal = S.reduce((x: number, s: any) => x + (Number(s.balance) || 0), 0);

    // Receivables aging — how old is the money you're owed.
    const now = Date.now();
    const aging = { d0_7: 0, d8_30: 0, d31_60: 0, d60plus: 0 };
    for (const s of S) {
      const bal = Number(s.balance) || 0;
      if (bal <= 0) continue;
      const age = Math.floor((now - t(s.date)) / DAY);
      if (age <= 7) aging.d0_7 += bal;
      else if (age <= 30) aging.d8_30 += bal;
      else if (age <= 60) aging.d31_60 += bal;
      else aging.d60plus += bal;
    }

    // Expense breakdown by category, within range (operating expenses only).
    const catTotals: Record<string, number> = {};
    for (const e of E.filter((x: any) => inRange(x.date, from, to) && x.source !== "order")) {
      const cat = e.category || "Other";
      catTotals[cat] = (catTotals[cat] || 0) + (Number(e.amount) || 0);
    }
    const expenseByCategory = Object.entries(catTotals).map(([name, value]) => ({ name, value })).sort((x, y) => y.value - x.value);

    // Cash flow — money in vs out, bucketed sensibly for the range length.
    const spanDays = Math.ceil((to - from) / DAY);
    const buckets: { label: string; in: number; out: number }[] = [];
    if (spanDays <= 31) {
      // daily
      for (let d = from; d <= to; d += DAY) {
        const dayEnd = d + DAY - 1;
        const lab = new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
        buckets.push({
          label: lab,
          in: S.filter((s: any) => inRange(s.date, d, dayEnd)).reduce((x: number, s: any) => x + (Number(s.amount_paid) || 0), 0),
          out: E.filter((e: any) => inRange(e.date, d, dayEnd)).reduce((x: number, e: any) => x + (Number(e.amount) || 0), 0),
        });
      }
    } else {
      // monthly
      const start = new Date(from); start.setDate(1);
      for (let m = new Date(start); m.getTime() <= to; m.setMonth(m.getMonth() + 1)) {
        const mStart = new Date(m.getFullYear(), m.getMonth(), 1).getTime();
        const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59).getTime();
        buckets.push({
          label: new Date(mStart).toLocaleDateString(undefined, { month: "short" }),
          in: S.filter((s: any) => inRange(s.date, mStart, mEnd)).reduce((x: number, s: any) => x + (Number(s.amount_paid) || 0), 0),
          out: E.filter((e: any) => inRange(e.date, mStart, mEnd)).reduce((x: number, e: any) => x + (Number(e.amount) || 0), 0),
        });
      }
    }

    // Top items by revenue within range, with margin where cost is known.
    const costByName: Record<string, number> = {};
    for (const it of I) costByName[it.name] = Number(it.cost) || 0;
    const itemAgg: Record<string, { revenue: number; units: number; cost: number }> = {};
    for (const s of S.filter((x: any) => inRange(x.date, from, to))) {
      for (const it of s.items || []) {
        const a = (itemAgg[it.name] = itemAgg[it.name] || { revenue: 0, units: 0, cost: 0 });
        const qty = Number(it.qty) || 1;
        a.revenue += (Number(it.unitPrice) || 0) * qty;
        a.units += qty;
        a.cost += (costByName[it.name] || 0) * qty;
      }
    }
    const topItems = Object.entries(itemAgg).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 6).map(([name, v]) => ({
      name, value: v.revenue, units: v.units,
      marginPct: v.revenue > 0 && v.cost > 0 ? Math.round(((v.revenue - v.cost) / v.revenue) * 100) : null,
    }));

    // Simple run-rate: only meaningful for open-ended "to today" ranges.
    let forecast: number | null = null;
    if (["month", "year"].includes(range)) {
      const now2 = new Date();
      const daysElapsed = Math.max(1, Math.ceil((Date.now() - from) / DAY));
      const totalDays = range === "month"
        ? new Date(now2.getFullYear(), now2.getMonth() + 1, 0).getDate()
        : 365;
      forecast = Math.round((cur.revenue / daysElapsed) * totalDays);
    }

    // Lists filtered to the range, for the Sales & Expenses tabs.
    const salesList = S.filter((s: any) => inRange(s.date, from, to)).sort((a: any, b: any) => t(b.date) - t(a.date));
    const expenseList = E.filter((e: any) => inRange(e.date, from, to)).sort((a: any, b: any) => t(b.date) - t(a.date));

    const activeLeads = C.filter((c: any) => c.stage && !["Customer (Won)", "Lost"].includes(c.stage)).length;
    const customers = C.filter((c: any) => c.stage === "Customer (Won)").length;

    return NextResponse.json({
      available: true,
      range: { key: range, label, from, to },
      cards: {
        revenue: cur.revenue, expenses: cur.expenses, profit: cur.profit, pendingTotal,
        activeLeads, customers,
        revenueTrend: pctChange(cur.revenue, prev.revenue),
        profitTrend: pctChange(cur.profit, prev.profit),
        expenseTrend: pctChange(cur.expenses, prev.expenses),
      },
      margin: { cogs: cur.cogs, opex: cur.opex, grossMargin, marginPct },
      prev: { revenue: prev.revenue, profit: prev.profit, expenses: prev.expenses },
      forecast,
      aging,
      cashflow: buckets,
      charts: { topItems, expenseByCategory },
      missingCost,
      lists: { sales: salesList, expenses: expenseList },
    });
  } catch {
    return NextResponse.json({ available: false });
  }
}
