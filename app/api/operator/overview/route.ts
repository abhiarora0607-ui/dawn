// app/api/operator/overview/route.ts
// The operator's view of every business using Dawn.
//
// PRIVACY WALL (hard rule, not a setting): this endpoint may return COUNTS,
// DATES, usage shape, and the business's OWN name/email/phone (vendor contact
// info they gave Dawn) — never their customers' content. No contact names, no
// order details, no revenue. Every count source below selects only `uid` plus
// the flags needed to count honestly. Keep it that way.
//
// V16: businesses are derived from DATA THAT EXISTS (registry ∪ settings ∪
// contacts ∪ sales ∪ ig ownership) — the console can never show zero while a
// business breathes.

import { NextResponse } from "next/server";
import { isOperator } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

const DAY = 86400000;
const WEEK = 7 * DAY;

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
  if (!b.lastActive) return "no_signal";
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
    const [users, settings, ig, contacts, sales, employees, activities] = await Promise.all([
      fetch(`${url}/rest/v1/dawn_users?select=uid,email,created_at,last_active_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/business_settings?select=uid,business_name,phone,whatsapp,updated_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/ig_connections?select=ig_user_id,owner_uid,connected_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/contacts?select=uid,is_demo,created_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?select=uid,is_demo,date`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/employees?select=uid,is_demo,is_owner`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      // Usage SHAPE: uid + timestamp only — how much is happening, never what.
      fetch(`${url}/rest/v1/activities?select=uid,created_at&order=created_at.desc&limit=4000`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);

    const U = Array.isArray(users) ? users : [];
    const SET = Array.isArray(settings) ? settings : [];
    const IG = Array.isArray(ig) ? ig : [];
    const C = Array.isArray(contacts) ? contacts : [];
    const S = Array.isArray(sales) ? sales : [];
    const E = Array.isArray(employees) ? employees : [];
    const A = Array.isArray(activities) ? activities : [];

    // ------ the business universe: every uid that exists anywhere ------
    const uidSet = new Set<string>();
    for (const u of U) uidSet.add(u.uid);
    for (const s of SET) uidSet.add(s.uid);
    for (const c of C) if (c.is_demo !== true) uidSet.add(c.uid);
    for (const s of S) if (s.is_demo !== true) uidSet.add(s.uid);
    for (const g of IG) if (g.owner_uid) uidSet.add(g.owner_uid);

    const userByUid: Record<string, any> = {};
    for (const u of U) userByUid[u.uid] = u;
    const setByUid: Record<string, any> = {};
    for (const s of SET) setByUid[s.uid] = s;
    const igByUid: Record<string, any[]> = {};
    for (const g of IG) if (g.owner_uid) (igByUid[g.owner_uid] ||= []).push(g);

    const count = (rows: any[], uid: string, extra?: (r: any) => boolean) =>
      rows.filter((r) => r.uid === uid && (!extra || extra(r))).length;
    const countReal = (rows: any[], uid: string, extra?: (r: any) => boolean) =>
      rows.filter((r) => r.uid === uid && r.is_demo !== true && (!extra || extra(r))).length;

    // Weekly activity buckets (last 8 weeks) per uid — the usage sparkline.
    const now = Date.now();
    const weeksByUid: Record<string, number[]> = {};
    for (const a of A) {
      const age = now - new Date(a.created_at).getTime();
      const w = Math.floor(age / WEEK);
      if (w < 0 || w > 7) continue;
      const arr = (weeksByUid[a.uid] ||= [0, 0, 0, 0, 0, 0, 0, 0]);
      arr[7 - w]++; // oldest → newest
    }

    const businesses = Array.from(uidSet).map((uid) => {
      const u = userByUid[uid];
      const st = setByUid[uid];
      const igs = igByUid[uid] || [];
      const signedUp = u?.created_at || st?.updated_at || new Date().toISOString();
      const lastActive = u?.last_active_at ? new Date(u.last_active_at).getTime() : null;
      const weeks = weeksByUid[uid] || [0, 0, 0, 0, 0, 0, 0, 0];
      const recent = weeks[6] + weeks[7];
      const prior = weeks[4] + weeks[5];

      const b: any = {
        uid,
        name: st?.business_name || null,
        email: u?.email || null,
        phone: st?.phone || null,
        whatsapp: st?.whatsapp || st?.phone || null,
        signedUp,
        daysSinceSignup: Math.max(0, Math.floor((now - new Date(signedUp).getTime()) / DAY)),
        lastActive: u?.last_active_at || null,
        daysQuiet: lastActive ? Math.floor((now - lastActive) / DAY) : null,
        ig: igs.length > 0,
        igCount: igs.length,
        contacts: count(C, uid),
        orders: count(S, uid),
        employees: count(E, uid, (r) => r.is_owner !== true),
        realContacts: countReal(C, uid),
        realOrders: countReal(S, uid),
        weeks,
        growingFast: prior >= 3 && recent >= prior * 1.5,
      };
      // A business whose data is entirely seeded demo content — real usage is zero.
      b.demoOnly = (b.contacts > 0 || b.orders > 0) && b.realContacts === 0 && b.realOrders === 0;
      b.status = statusOf({ lastActive, contacts: b.realContacts, orders: b.realOrders });
      b.score = engagementScore({ lastActive, contacts: b.realContacts, orders: b.realOrders, employees: b.employees, ig: b.ig });
      // A business with data that no Instagram (and no email) can reopen.
      b.unclaimedLegacy = (b.contacts > 0 || b.orders > 0 || !!st) && !b.ig && !b.email;
      return b;
    }).sort((a: any, b: any) => b.score - a.score);

    // ------ attention lists: who to talk to today ------
    const churnRisk = businesses.filter((b: any) => (b.status === "cooling" || b.status === "churning") && b.daysQuiet != null && b.daysQuiet >= 14 && (b.contacts > 0 || b.orders > 0)).slice(0, 8);
    const neverStarted = businesses.filter((b: any) => b.status === "never_started" && b.daysSinceSignup >= 3).slice(0, 8);
    const powerUsers = businesses.filter((b: any) => b.score >= 60).slice(0, 5);
    const growing = businesses.filter((b: any) => b.growingFast).slice(0, 5);

    const inLast = (d: string, days: number) => now - new Date(d).getTime() <= days * DAY;
    const total = businesses.length;
    const activated = businesses.filter((b: any) => b.realContacts > 0 || b.realOrders > 0).length;
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
        unclaimed: businesses.filter((b: any) => b.unclaimedLegacy).length,
        growth: Object.entries(signupsByMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, n]) => ({ month, n })),
      },
      attention: { churnRisk, neverStarted, powerUsers, growing },
      businesses,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load." }, { status: 500 });
  }
}
