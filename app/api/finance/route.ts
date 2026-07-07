// app/api/finance/route.ts
// Computes the finance dashboard: revenue, expenses, profit, pending,
// active leads, conversion rate, plus chart series.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ available: false });

  try {
    const [sales, expenses, contacts] = await Promise.all([
      fetch(`${url}/rest/v1/sales?uid=eq.${uid}&select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/expenses?uid=eq.${uid}&select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&select=stage,source,created_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);

    const S = Array.isArray(sales) ? sales : [];
    const E = Array.isArray(expenses) ? expenses : [];
    const C = Array.isArray(contacts) ? contacts : [];

    const now = new Date();
    const thisMonth = (d: string) => { const x = new Date(d); return x.getMonth() === now.getMonth() && x.getFullYear() === now.getFullYear(); };

    const revenueMonth = S.filter((s) => thisMonth(s.date)).reduce((a, s) => a + (Number(s.total) || 0), 0);
    const revenueAll = S.reduce((a, s) => a + (Number(s.total) || 0), 0);
    const expensesMonth = E.filter((e) => thisMonth(e.date)).reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const pendingTotal = S.reduce((a, s) => a + (Number(s.balance) || 0), 0);
    const profitMonth = revenueMonth - expensesMonth;

    const activeLeads = C.filter((c) => c.stage && !["Customer (Won)", "Lost"].includes(c.stage)).length;
    const customers = C.filter((c) => c.stage === "Customer (Won)").length;
    const conversionRate = C.length > 0 ? Math.round((customers / C.length) * 100) : 0;

    // Revenue over last 6 months
    const revByMonth: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString("default", { month: "short" });
      const val = S.filter((s) => { const x = new Date(s.date); return x.getMonth() === d.getMonth() && x.getFullYear() === d.getFullYear(); }).reduce((a, s) => a + (Number(s.total) || 0), 0);
      revByMonth.push({ label, value: val });
    }

    // Top items
    const itemTotals: Record<string, number> = {};
    for (const s of S) for (const it of s.items || []) itemTotals[it.name] = (itemTotals[it.name] || 0) + (Number(it.unitPrice) || 0) * (Number(it.qty) || 1);
    const topItems = Object.entries(itemTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));

    // Leads by source
    const sourceCounts: Record<string, number> = {};
    for (const c of C) sourceCounts[c.source || "Other"] = (sourceCounts[c.source || "Other"] || 0) + 1;
    const leadsBySource = Object.entries(sourceCounts).map(([name, value]) => ({ name, value }));

    return NextResponse.json({
      available: true,
      cards: { revenueMonth, revenueAll, expensesMonth, profitMonth, pendingTotal, activeLeads, customers, conversionRate },
      charts: { revByMonth, topItems, leadsBySource },
    });
  } catch {
    return NextResponse.json({ available: false });
  }
}
