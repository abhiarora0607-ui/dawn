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

      // V39: salary no longer posts itself. It flows through a payslip that a
      // human approves and then marks paid, and the expense is created at that
      // moment — so the books record money that actually left, rather than
      // money the system assumed would.
      //
      // Rent, subscriptions and the rest still post automatically: they have no
      // approval step to wait for, and holding them back would just mean
      // someone re-entering the same figure every month.
      if (r.source === "salary") continue;

      await fetch(`${url}/rest/v1/expenses`, {
        method: "POST", headers: sbHeaders(key),
        body: JSON.stringify({
          uid: r.uid, date: today, category: r.category || "Recurring",
          amount: Number(r.amount || 0), note: r.note || "Recurring expense",
          source: "recurring", source_id: r.id, recurring: true,
        }),
      });
      await fetch(`${url}/rest/v1/recurring_expenses?id=eq.${r.id}`, {
        method: "PATCH", headers: sbHeaders(key), body: JSON.stringify({ last_generated: month }),
      });
    }
  } catch { /* non-fatal */ }

  // Close out YESTERDAY's attendance for every business (V31a). This is what
  // turns "no punches" into a recorded absence and an unclosed punch into a
  // flagged missing punch-out. Without this pass, a day nobody touched simply
  // wouldn't exist, and the month summary would have holes in it.
  try {
    const { istDate, addDays } = await import("@/lib/attendance");
    const { recomputeDay, getAttSettings, getHolidays } = await import("@/lib/attendance-db");
    const yesterday = addDays(istDate(), -1);

    const settingsRows = await (await fetch(`${url}/rest/v1/attendance_settings?enabled=eq.true&select=uid`, { headers: sbHeaders(key), cache: "no-store" })).json();
    for (const s of Array.isArray(settingsRows) ? settingsRows : []) {
      try {
        const { approvedLeaveMap } = await import("@/lib/leave-db");
        const [emps, settings, holidays, leaveMap] = await Promise.all([
          (await fetch(`${url}/rest/v1/employees?uid=eq.${s.uid}&status=eq.active&select=*`, { headers: sbHeaders(key), cache: "no-store" })).json(),
          getAttSettings(url, key, s.uid),
          getHolidays(url, key, s.uid, yesterday, yesterday),
          approvedLeaveMap(url, key, s.uid, yesterday, yesterday),
        ]);
        for (const emp of Array.isArray(emps) ? emps : []) {
          if (emp.attendance_exempt) continue;
          await recomputeDay(url, key, s.uid, emp.id, yesterday, {
            emp, settings, holidayName: holidays[yesterday] || null,
            leaveCode: leaveMap[emp.id]?.[yesterday] || null,
          });
        }
      } catch { /* one business failing must not stop the rest */ }
    }
  } catch { /* non-fatal */ }

  // V39: payroll no longer runs itself, so it can be forgotten. Once a month
  // has begun and nobody has drafted payslips, flag it where the owner will
  // see it. Silence would mean staff unpaid and books showing no salaries.
  try {
    const { istDate } = await import("@/lib/attendance");
    const todayIST = istDate();
    const dayOfMonth = Number(todayIST.slice(8, 10));
    const monthTag = todayIST.slice(0, 7);

    if (dayOfMonth >= 2) {
      const settingsRows = await (await fetch(`${url}/rest/v1/attendance_settings?select=uid,payroll_enabled`, { headers: sbHeaders(key), cache: "no-store" })).json();
      for (const srow of Array.isArray(settingsRows) ? settingsRows : []) {
        if (srow.payroll_enabled === false) continue;
        try {
          const [staff, slips] = await Promise.all([
            (await fetch(`${url}/rest/v1/employees?uid=eq.${srow.uid}&status=eq.active&select=id&limit=1`, { headers: sbHeaders(key), cache: "no-store" })).json(),
            (await fetch(`${url}/rest/v1/payslips?uid=eq.${srow.uid}&month=eq.${monthTag}&select=id&limit=1`, { headers: sbHeaders(key), cache: "no-store" })).json(),
          ]);
          const hasStaff = Array.isArray(staff) && staff.length > 0;
          const hasSlips = Array.isArray(slips) && slips.length > 0;
          if (hasStaff && !hasSlips) {
            // The suggestions feed is computed on read rather than stored, so
            // the durable signal is an email — and it goes only once, on the
            // second of the month, rather than nagging daily.
            if (dayOfMonth === 2) {
              try {
                const { sendMail } = await import("@/lib/mailer");
                const ownerRow = await (await fetch(`${url}/rest/v1/dawn_users?uid=eq.${srow.uid}&select=email&limit=1`, { headers: sbHeaders(key), cache: "no-store" })).json();
                const to = ownerRow?.[0]?.email;
                if (to) {
                  await sendMail(
                    to,
                    "Payroll is ready to run",
                    `<p>It's a new month and this month's payslips haven't been drafted yet.</p>
                     <p>Draft them, check the numbers, and mark them paid once the money has gone out — that's what puts the salary into your books.</p>
                     <p><a href="https://dawn-jet.vercel.app/dashboard/payroll">Run payroll</a></p>`,
                  );
                }
              } catch { /* a failed email must not stop the cron */ }
            }
          }
        } catch { /* one business must not stop the rest */ }
      }
    }
  } catch { /* non-fatal */ }

  // Leave accrual and year-end (V31b). Both are idempotent by design: accrual
  // is stamped with a month tag per person per type, and year-end with a year
  // tag per business, so a cron that runs twice never gives anyone a second
  // helping or lapses a balance twice.
  try {
    const { istDate } = await import("@/lib/attendance");
    const { getLeaveTypes, accrueMonth, adjustBalance, getBalances } = await import("@/lib/leave-db");
    const { yearEndFor } = await import("@/lib/leave");
    const { getAttSettings } = await import("@/lib/attendance-db");

    const todayIST = istDate();
    const monthTag = todayIST.slice(0, 7);
    const yearNow = Number(todayIST.slice(0, 4));

    const settingsRows = await (await fetch(`${url}/rest/v1/attendance_settings?select=uid,leave_enabled,carry_forward_cap,encash_cap,year_end_done`, { headers: sbHeaders(key), cache: "no-store" })).json();
    for (const srow of Array.isArray(settingsRows) ? settingsRows : []) {
      if (srow.leave_enabled === false) continue;
      try {
        const bizUid = srow.uid;
        const [emps, types] = await Promise.all([
          (await fetch(`${url}/rest/v1/employees?uid=eq.${bizUid}&status=eq.active&select=id,joining_date,monthly_salary`, { headers: sbHeaders(key), cache: "no-store" })).json(),
          getLeaveTypes(url, key, bizUid),
        ]);
        const EMP = Array.isArray(emps) ? emps : [];

        // ---- year end: carry, then encash-eligible, then lapse ----
        // Runs on the first cron of a new year, for the year that just ended.
        const lastYear = yearNow - 1;
        if (srow.year_end_done !== String(lastYear)) {
          const carryCap = Number(srow.carry_forward_cap ?? 12);
          const encashCap = Number(srow.encash_cap ?? 5);
          for (const e of EMP) {
            const balances = await getBalances(url, key, bizUid, e.id, lastYear, types);
            const input = balances
              .filter((b: any) => !b.infinite && b.available > 0)
              .map((b: any) => {
                const t = types.find((x: any) => x.code === b.code);
                return { code: b.code, available: b.available, carries_forward: !!t?.carries_forward, encashable: !!t?.encashable };
              });
            if (input.length === 0) continue;
            const plan = yearEndFor(input, carryCap, encashCap);
            for (const [code, p] of Object.entries(plan) as any) {
              if (p.carry > 0) await adjustBalance(url, key, bizUid, e.id, code, yearNow, { carried_in: p.carry });
              if (p.lapse > 0 || p.encash > 0) {
                // The old year's row records what happened to it, so the
                // employee can always see where their days went.
                await adjustBalance(url, key, bizUid, e.id, code, lastYear, { lapsed: p.lapse });
              }
            }
          }
          await fetch(`${url}/rest/v1/attendance_settings?uid=eq.${bizUid}`, {
            method: "PATCH", headers: sbHeaders(key),
            body: JSON.stringify({ year_end_done: String(lastYear) }),
          }).catch(() => {});
        }

        // ---- monthly accrual ----
        for (const e of EMP) {
          await accrueMonth(url, key, bizUid, e, monthTag, types);
        }
      } catch { /* one business failing must not stop the rest */ }
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

  // Precompute per-business stats for the Operator console, so it reads ~1,000
  // summary rows instead of scanning millions live. One upserted row per uid.
  try {
    const DAY = 86400000;
    const cutoff30 = new Date(Date.now() - 30 * DAY).toISOString();
    const [allUsers, allContacts, allSales, allEmployees, recentActs] = await Promise.all([
      fetch(`${url}/rest/v1/dawn_users?select=uid,last_active_at`, { headers: sbHeaders(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/contacts?deleted_at=is.null&select=uid,is_demo`, { headers: sbHeaders(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?deleted_at=is.null&select=uid,is_demo`, { headers: sbHeaders(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/employees?select=uid,is_owner`, { headers: sbHeaders(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/activities?created_at=gte.${cutoff30}&select=uid`, { headers: sbHeaders(key), cache: "no-store" }).then((r) => r.json()),
    ]);

    const stat: Record<string, any> = {};
    const ensure = (uid: string) => (stat[uid] = stat[uid] || { uid, contacts: 0, real_contacts: 0, orders: 0, real_orders: 0, employees: 0, activities_30d: 0, last_activity_at: null });
    for (const u of allUsers || []) { ensure(u.uid).last_activity_at = u.last_active_at || null; }
    for (const c of allContacts || []) { const s = ensure(c.uid); s.contacts++; if (c.is_demo !== true) s.real_contacts++; }
    for (const o of allSales || []) { const s = ensure(o.uid); s.orders++; if (o.is_demo !== true) s.real_orders++; }
    for (const e of allEmployees || []) { if (e.is_owner !== true) ensure(e.uid).employees++; }
    for (const a of recentActs || []) { ensure(a.uid).activities_30d++; }

    const rows = Object.values(stat).map((s: any) => ({ ...s, computed_at: new Date().toISOString() }));
    // Upsert in chunks.
    for (let i = 0; i < rows.length; i += 200) {
      await fetch(`${url}/rest/v1/business_stats`, {
        method: "POST",
        headers: { ...sbHeaders(key), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows.slice(i, i + 200)),
      });
    }
  } catch { /* non-fatal — operator falls back to live compute */ }

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
