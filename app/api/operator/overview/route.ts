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
import { healthOf, buildWorklist } from "@/lib/operator-health";

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
    // Prefer precomputed stats (fast, scales to thousands). Fall back to live
    // counting only when the summary table is empty (before the first cron run).
    const statsRows = await fetch(`${url}/rest/v1/business_stats?select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
    const statsByUid: Record<string, any> = {};
    for (const s of Array.isArray(statsRows) ? statsRows : []) statsByUid[s.uid] = s;
    // V30 — the precomputed summary is a SCALE optimisation, not a default.
    // It's written once a night by the overnight cron, so using it means the
    // console shows yesterday's numbers: a business that added contacts and
    // orders this morning reads as "never started". At small scale the live
    // queries cost nothing, so only fall back to the summary once the live
    // path would actually hurt. Below the threshold: always live, always true.
    const STATS_THRESHOLD = 150;
    const useStats = Object.keys(statsByUid).length >= STATS_THRESHOLD;
    // When the summary IS used, say so — staleness must never be invisible.
    const countsAsOf = useStats
      ? (Object.values(statsByUid).map((r: any) => r.updated_at).filter(Boolean).sort().pop() || null)
      : null;

    // Billing state per business (V26): status + days left, computed live.
    const [subsRows, plansRows] = await Promise.all([
      fetch(`${url}/rest/v1/subscriptions?select=uid,plan_id,status,trial_ends_at,period_end,cancel_at_period_end`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/plans?select=id,name`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    const planNameById: Record<string, string> = {};
    for (const p of Array.isArray(plansRows) ? plansRows : []) planNameById[p.id] = p.name;
    const subByUid: Record<string, any> = {};
    for (const sRow of Array.isArray(subsRows) ? subsRows : []) subByUid[sRow.uid] = sRow;
    const billingOf = (uid: string) => {
      const sub = subByUid[uid];
      if (!sub) return { billingStatus: "none", billingPlan: null, billingDaysLeft: null };
      const nowB = Date.now();
      if (sub.status === "complimentary") return { billingStatus: "comp", billingPlan: planNameById[sub.plan_id] || null, billingDaysLeft: null };
      if (sub.status === "trialing") {
        const dl = sub.trial_ends_at ? Math.ceil((new Date(sub.trial_ends_at).getTime() - nowB) / 86400000) : null;
        return dl != null && dl <= 0 ? { billingStatus: "expired", billingPlan: null, billingDaysLeft: null } : { billingStatus: "trial", billingPlan: planNameById[sub.plan_id] || null, billingDaysLeft: dl };
      }
      const pe = sub.period_end ? new Date(sub.period_end).getTime() : 0;
      if (pe && pe > nowB) return { billingStatus: "paid", billingPlan: planNameById[sub.plan_id] || null, billingDaysLeft: Math.ceil((pe - nowB) / 86400000) };
      return { billingStatus: "expired", billingPlan: planNameById[sub.plan_id] || null, billingDaysLeft: null };
    };

    const [users, settings, ig, contacts, sales, employees, activities] = await Promise.all([
      fetch(`${url}/rest/v1/dawn_users?select=uid,email,created_at,last_active_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/business_settings?select=uid,business_name,phone,whatsapp,updated_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/ig_connections?select=ig_user_id,owner_uid,connected_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      // Live count sources — only fetched when there's no precomputed summary.
      useStats ? Promise.resolve([]) : fetch(`${url}/rest/v1/contacts?deleted_at=is.null&select=uid,is_demo,created_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      useStats ? Promise.resolve([]) : fetch(`${url}/rest/v1/sales?deleted_at=is.null&select=uid,is_demo,date`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      useStats ? Promise.resolve([]) : fetch(`${url}/rest/v1/employees?select=uid,is_demo,is_owner`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      useStats ? Promise.resolve([]) : fetch(`${url}/rest/v1/activities?select=uid,created_at&order=created_at.desc&limit=4000`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
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
    for (const g of IG) if (g.owner_uid) uidSet.add(g.owner_uid);
    if (useStats) { for (const uid of Object.keys(statsByUid)) uidSet.add(uid); }
    else {
      for (const c of C) if (c.is_demo !== true) uidSet.add(c.uid);
      for (const s of S) if (s.is_demo !== true) uidSet.add(s.uid);
    }

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

    // Weekly activity buckets (last 8 weeks) per uid — only in the live path.
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
      const stat = statsByUid[uid];
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
        contacts: useStats ? (stat?.contacts || 0) : count(C, uid),
        orders: useStats ? (stat?.orders || 0) : count(S, uid),
        employees: useStats ? (stat?.employees || 0) : count(E, uid, (r) => r.is_owner !== true),
        realContacts: useStats ? (stat?.real_contacts || 0) : countReal(C, uid),
        realOrders: useStats ? (stat?.real_orders || 0) : countReal(S, uid),
        weeks,
        growingFast: prior >= 3 && recent >= prior * 1.5,
        ...billingOf(uid),
      };
      // A business whose data is entirely seeded demo content — real usage is zero.
      b.demoOnly = (b.contacts > 0 || b.orders > 0) && b.realContacts === 0 && b.realOrders === 0;
      b.status = statusOf({ lastActive, contacts: b.realContacts, orders: b.realOrders });
      b.score = engagementScore({ lastActive, contacts: b.realContacts, orders: b.realOrders, employees: b.employees, ig: b.ig });
      // A business with data that no Instagram (and no email) can reopen.
      b.unclaimedLegacy = (b.contacts > 0 || b.orders > 0 || !!st) && !b.ig && !b.email;
      return b;
    }).sort((a: any, b: any) => b.score - a.score);

    // ------ V29: health as a word + one prioritised worklist ------
    for (const b of businesses) {
      const h = healthOf(b);
      b.health = h.key; b.healthLabel = h.label; b.healthTone = h.tone; b.healthWhy = h.why;
    }
    const worklist = buildWorklist(businesses);

    const inLast = (d: string, days: number) => now - new Date(d).getTime() <= days * DAY;
    const total = businesses.length;
    const activated = businesses.filter((b: any) => b.realContacts > 0 || b.realOrders > 0).length;
    const signupsByMonth: Record<string, number> = {};
    for (const b of businesses) {
      const k = String(b.signedUp).slice(0, 7);
      signupsByMonth[k] = (signupsByMonth[k] || 0) + 1;
    }

    return NextResponse.json({
      countsLive: !useStats,
      countsAsOf,
      funnel: {
        signedUp: total,
        setUp: activated,
        firstOrder: businesses.filter((b: any) => b.realOrders > 0).length,
        habit: businesses.filter((b: any) => b.health === "thriving" || b.health === "steady").length,
      },
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
      worklist,
      businesses,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load." }, { status: 500 });
  }
}
