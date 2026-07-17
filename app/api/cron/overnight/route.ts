// app/api/cron/overnight/route.ts
// The REAL overnight job. Vercel Cron calls this daily (~7am IST).
// For every connected account it: (1) refreshes the long-lived token if
// it's aging, and (2) pre-generates the daily briefing so it's READY when
// the founder opens their phone — not generated on page load.
//
// Assumption: pre-generating serves the D2C buyer because the promise is
// "Dawn read your account overnight." A briefing that appears instantly at
// 7am feels categorically different from a spinner while Gemini runs.

import { NextResponse } from "next/server";
import { generateBrief } from "@/lib/briefing-engine";
import { brandVoicePromptFor } from "@/lib/brand-voice";
import { personaPromptFor } from "@/lib/persona";
import { storePromptFor } from "@/lib/store";
import { InstagramGraphProvider } from "@/lib/data-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sbHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function GET(req: Request) {
  // Protect the endpoint — only Vercel Cron (with secret) or manual admin.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    // Vercel Cron automatically sends the CRON_SECRET as a Bearer token.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!url || !key) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  // Load all connected accounts
  let connections: any[] = [];
  try {
    const res = await fetch(`${url}/rest/v1/ig_connections?select=ig_user_id,access_token,updated_at`, {
      headers: sbHeaders(key), cache: "no-store",
    });
    connections = await res.json();
  } catch {
    return NextResponse.json({ error: "Couldn't load connections" }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let briefed = 0, refreshed = 0, failed = 0;

  // Generate this month's recurring expenses (salary + manual recurring),
  // once per month, idempotently. Runs for every owner.
  const month = today.slice(0, 7); // YYYY-MM
  try {
    const recs = await (await fetch(`${url}/rest/v1/recurring_expenses?enabled=eq.true&select=*`, { headers: sbHeaders(key), cache: "no-store" })).json();
    for (const r of recs || []) {
      if (r.last_generated === month) continue; // already done this month
      await fetch(`${url}/rest/v1/expenses`, {
        method: "POST", headers: sbHeaders(key),
        body: JSON.stringify({
          uid: r.uid, date: today, category: r.category || (r.source === "salary" ? "Salaries" : "Recurring"),
          amount: r.amount, note: r.note || "Recurring expense",
          source: r.source === "salary" ? "salary" : "recurring", source_id: r.employee_id || r.id, recurring: true,
        }),
      });
      await fetch(`${url}/rest/v1/recurring_expenses?id=eq.${r.id}`, {
        method: "PATCH", headers: sbHeaders(key), body: JSON.stringify({ last_generated: month }),
      });
    }
  } catch { /* non-fatal */ }

  // Freeze LAST month's employee scores, once, for every business — the
  // permanent monthly performance record. Idempotent: skips any uid that
  // already has rows for that month.
  try {
    const prev = new Date(); prev.setMonth(prev.getMonth() - 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    const { computeScores } = await import("@/lib/scoring");

    const empRows = await (await fetch(`${url}/rest/v1/employees?select=uid`, { headers: sbHeaders(key), cache: "no-store" })).json();
    const uids: string[] = Array.from(new Set((empRows || []).map((r: any) => r.uid)));

    for (const uid of uids) {
      const existing = await (await fetch(`${url}/rest/v1/employee_scores?uid=eq.${uid}&month=eq.${prevMonth}&select=id&limit=1`, { headers: sbHeaders(key), cache: "no-store" })).json();
      if (Array.isArray(existing) && existing.length > 0) continue; // already frozen

      const [employees, contacts, sales, tasks, activities] = await Promise.all([
        fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name,status,is_owner,joining_date`, { headers: sbHeaders(key), cache: "no-store" }).then((r) => r.json()),
        fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&select=id,stage,employee_id,follow_up_date,created_at`, { headers: sbHeaders(key), cache: "no-store" }).then((r) => r.json()),
        fetch(`${url}/rest/v1/sales?uid=eq.${uid}&select=employee_id,amount_paid,date,order_status`, { headers: sbHeaders(key), cache: "no-store" }).then((r) => r.json()),
        fetch(`${url}/rest/v1/tasks?uid=eq.${uid}&select=employee_id,done,done_at,due_date`, { headers: sbHeaders(key), cache: "no-store" }).then((r) => r.json()),
        fetch(`${url}/rest/v1/activities?uid=eq.${uid}&select=contact_id,type,content,created_at&limit=2000`, { headers: sbHeaders(key), cache: "no-store" }).then((r) => r.json()),
      ]);

      const result = computeScores({
        employees: Array.isArray(employees) ? employees : [],
        contacts: Array.isArray(contacts) ? contacts : [],
        sales: (Array.isArray(sales) ? sales : []).filter((s: any) => s.order_status !== "Cancelled"),
        tasks: Array.isArray(tasks) ? tasks : [],
        activities: Array.isArray(activities) ? activities : [],
        month: prevMonth,
      });
      if (result.scores.length === 0) continue;

      await fetch(`${url}/rest/v1/employee_scores`, {
        method: "POST", headers: sbHeaders(key),
        body: JSON.stringify(result.scores.map((s) => ({
          uid, employee_id: s.employeeId, month: prevMonth, score: s.score, rank: s.rank,
          is_top: result.top?.employeeId === s.employeeId,
          is_bottom: result.bottom?.employeeId === s.employeeId,
          breakdown: s.breakdown,
        }))),
      });
    }
  } catch { /* non-fatal */ }

  // Permanently remove anything soft-deleted more than 30 days ago.
  try {
    const { purgeExpired } = await import("@/lib/soft-delete");
    for (const t of ["contacts", "sales", "catalog_items", "expenses"]) {
      await purgeExpired(url, key, t);
    }
  } catch { /* non-fatal */ }

  for (const conn of connections || []) {
    const igUserId = conn.ig_user_id;
    let token = conn.access_token;

    // 1) Refresh long-lived token if older than ~50 days (they last 60).
    try {
      const updatedAt = conn.updated_at ? new Date(conn.updated_at).getTime() : 0;
      const ageDays = (Date.now() - updatedAt) / (1000 * 60 * 60 * 24);
      if (ageDays > 50 && appSecret) {
        const rf = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`, { cache: "no-store" });
        const rfData = await rf.json();
        if (rfData.access_token) {
          token = rfData.access_token;
          await fetch(`${url}/rest/v1/ig_connections?ig_user_id=eq.${igUserId}`, {
            method: "PATCH", headers: { ...sbHeaders(key), Prefer: "return=minimal" },
            body: JSON.stringify({ access_token: token, updated_at: new Date().toISOString() }),
          });
          refreshed++;
        }
      }
    } catch { /* non-fatal */ }

    // 2) Pre-generate today's briefing
    try {
      const provider = new InstagramGraphProvider(token, igUserId);
      const [account, competitors] = await Promise.all([provider.getAccount(), provider.getCompetitors()]);
      const ctx = (await brandVoicePromptFor(igUserId)) + (await personaPromptFor(igUserId)) + (await storePromptFor(igUserId));
      const brief = await generateBrief(account, competitors, ctx);
      const payload = { account, competitors, brief };
      await fetch(`${url}/rest/v1/brief_cache`, {
        method: "POST",
        headers: { ...sbHeaders(key), Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ ig_user_id: igUserId, brief_date: today, payload }),
      });

      // Snapshot today's metrics for week-over-week trends
      await fetch(`${url}/rest/v1/metric_snapshots`, {
        method: "POST",
        headers: { ...sbHeaders(key), Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          ig_user_id: igUserId, snap_date: today,
          followers: account.followers || 0, reach: account.reach || 0,
          profile_visits: account.profileVisits || 0,
          website_clicks: account.websiteClicks || 0, total_saves: account.totalSaves || 0,
        }),
      });
      briefed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, accounts: connections?.length || 0, briefed, refreshed, failed });
}
