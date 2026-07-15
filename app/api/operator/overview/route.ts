// app/api/operator/overview/route.ts
// The operator's view of every business using Dawn.
//
// PRIVACY WALL (hard rule, not a setting): this endpoint may return COUNTS,
// DATES and the business's own name/email — never customer content. No
// contact names, no phone numbers, no order details, no revenue. Every fetch
// below selects only `uid` (+ flags needed to count honestly). If you edit
// this file, keep it that way.

import { NextResponse } from "next/server";
import { isOperator } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

const DAY = 86400000;

// Engagement score 0–100: how alive is this business on Dawn?
//   Recency 50 · setup depth 30 · usage volume 20. Counts only — never content.
function engagementScore(b: { lastActive: number | null; contacts: number; orders: number; employees: number; ig: boolean }): number {
  const now = Date.now();
  let recency = 0;
  if (b.lastActive) {
    const days = (now - b.lastActive) / DAY;
    recency = days <= 1 ? 50 : days <= 7 ? 40 : days <= 14 ? 25 : days <= 30 ? 10 : 0;
  }
  const setup = (b.contacts > 0 ? 10 : 0) + (b.orders > 0 ? 10 : 0) + (b.employees > 0 ? 5 : 0) + (b.ig ? 5 : 0);
  const volume = Math.min(20, Math.round(Math.min(b.contacts, 50) / 50 * 10 + Math.min(b.orders, 50) / 50 * 10));
  return Math.min(100, recency + setup + volume);
}

function statusOf(b: { lastActive: number | null; contacts: number; orders: number }): string {
  const hasData = b.contacts > 0 || b.orders > 0;
  if (!hasData) return "never_started";
  if (!b.lastActive) return "no_signal"; // tracking started after their last visit
  const days = (Date.now() - b.lastActive) / DAY;
  if (days <= 7) return "active";
  if (days <= 21) return "cooling";
  return "churning";
}

export async function GET() {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  try {
    const [users, settings, ig, contacts, sales, employees] = await Promise.all([
      fetch(`${url}/rest/v1/dawn_users?select=uid,email,created_at,last_active_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/settings?select=uid,business_name`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/ig_connections?select=uid`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      // COUNT SOURCES — uid + the flags needed to count honestly, nothing else.
      fetch(`${url}/rest/v1/contacts?select=uid,is_demo`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?select=uid,is_demo`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/employees?select=uid,is_demo,is_owner`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);

    const nameByUid: Record<string, string> = {};
    for (const s of Array.isArray(settings) ? settings : []) if (s.business_name) nameByUid[s.uid] = s.business_name;
    const igSet = new Set((Array.isArray(ig) ? ig : []).map((r: any) => r.uid));

    // Real usage only: demo rows and the auto-created owner record don't count.
    const count = (rows: any[], uid: string, extra?: (r: any) => boolean) =>
      (Array.isArray(rows) ? rows : []).filter((r) => r.uid === uid && r.is_demo !== true && (!extra || extra(r))).length;

    const now = Date.now();
    const businesses = (Array.isArray(users) ? users : []).map((u: any) => {
      const lastActive = u.last_active_at ? new Date(u.last_active_at).getTime() : null;
      const b = {
        uid: u.uid,
        name: nameByUid[u.uid] || null,
        email: u.email,
        signedUp: u.created_at,
        daysSinceSignup: Math.floor((now - new Date(u.created_at).getTime()) / DAY),
        lastActive: u.last_active_at || null,
        daysQuiet: lastActive ? Math.floor((now - lastActive) / DAY) : null,
        ig: igSet.has(u.uid),
        contacts: count(contacts, u.uid),
        orders: count(sales, u.uid),
        employees: count(employees, u.uid, (r) => r.is_owner !== true),
      };
      const status = statusOf({ lastActive, contacts: b.contacts, orders: b.orders });
      const score = engagementScore({ lastActive, contacts: b.contacts, orders: b.orders, employees: b.employees, ig: b.ig });
      return { ...b, status, score };
    }).sort((a: any, b: any) => b.score - a.score);

    // Health strip
    const inLast = (d: string, days: number) => now - new Date(d).getTime() <= days * DAY;
    const total = businesses.length;
    const activated = businesses.filter((b: any) => b.contacts > 0 || b.orders > 0).length;
    const signupsByMonth: Record<string, number> = {};
    for (const b of businesses) {
      const k = String(b.signedUp).slice(0, 7);
      signupsByMonth[k] = (signupsByMonth[k] || 0) + 1;
    }

    return NextResponse.json({
      health: {
        total,
        newWeek: businesses.filter((b: any) => inLast(b.signedUp, 7)).length,
        newMonth: businesses.filter((b: any) => inLast(b.signedUp, 30)).length,
        activated,
        activationRate: total > 0 ? Math.round((activated / total) * 100) : 0,
        active: businesses.filter((b: any) => b.status === "active").length,
        cooling: businesses.filter((b: any) => b.status === "cooling").length,
        churning: businesses.filter((b: any) => b.status === "churning").length,
        neverStarted: businesses.filter((b: any) => b.status === "never_started").length,
        igConnected: businesses.filter((b: any) => b.ig).length,
        growth: Object.entries(signupsByMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, n]) => ({ month, n })),
      },
      businesses,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load." }, { status: 500 });
  }
}
