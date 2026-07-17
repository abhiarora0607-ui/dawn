// app/api/value/route.ts
// The "prove the value" endpoint. Computes:
//  - time saved this week (from actions Dawn drafted/queued + content generated)
//  - week-over-week movement on revenue-adjacent metrics
//  - a plain-language "wins" summary
// This is what makes the subscription feel obviously worth it.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

async function igUserId(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get("dawn_ig")?.value ?? null;
  } catch { return null; }
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export async function GET() {
  { // Billing: Instagram & AI is a plan area.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
  }
  const id = await igUserId();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!id || !url || !key) {
    return NextResponse.json({ available: false });
  }
  const h = { apikey: key, Authorization: `Bearer ${key}` };

  // Count actions taken this week (queued + saved + scheduled)
  let actionsThisWeek = 0;
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const [sched, saved] = await Promise.all([
      fetch(`${url}/rest/v1/scheduled_actions?ig_user_id=eq.${id}&created_at=gte.${since}&select=id`, { headers: h, cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/saved_content?ig_user_id=eq.${id}&created_at=gte.${since}&select=id`, { headers: h, cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    actionsThisWeek = (Array.isArray(sched) ? sched.length : 0) + (Array.isArray(saved) ? saved.length : 0);
  } catch {}

  // Estimate time saved: ~12 min of manual work per drafted/queued/saved item
  // (writing a caption, researching hashtags, drafting a reply).
  const minutesSaved = actionsThisWeek * 12;

  // Week-over-week metric movement from snapshots
  let trends: any = null;
  try {
    const res = await fetch(`${url}/rest/v1/metric_snapshots?ig_user_id=eq.${id}&order=snap_date.desc&limit=14`, { headers: h, cache: "no-store" });
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length >= 2) {
      const latest = rows[0];
      // find a snapshot ~7 days before latest
      const weekAgo = rows.find((r: any) => r.snap_date <= daysAgo(6)) || rows[rows.length - 1];
      const delta = (a: number, b: number) => (b || 0) - (a || 0);
      const pct = (a: number, b: number) => (a > 0 ? Math.round((((b || 0) - a) / a) * 100) : 0);
      trends = {
        reach: { now: latest.reach, change: delta(weekAgo.reach, latest.reach), pct: pct(weekAgo.reach, latest.reach) },
        profileVisits: { now: latest.profile_visits, change: delta(weekAgo.profile_visits, latest.profile_visits), pct: pct(weekAgo.profile_visits, latest.profile_visits) },
        websiteClicks: { now: latest.website_clicks, change: delta(weekAgo.website_clicks, latest.website_clicks), pct: pct(weekAgo.website_clicks, latest.website_clicks) },
        saves: { now: latest.total_saves, change: delta(weekAgo.total_saves, latest.total_saves), pct: pct(weekAgo.total_saves, latest.total_saves) },
        followers: { now: latest.followers, change: delta(weekAgo.followers, latest.followers), pct: pct(weekAgo.followers, latest.followers) },
      };
    }
  } catch {}

  return NextResponse.json({
    available: true,
    actionsThisWeek,
    minutesSaved,
    hoursSaved: Math.round((minutesSaved / 60) * 10) / 10,
    trends,
  });
}
