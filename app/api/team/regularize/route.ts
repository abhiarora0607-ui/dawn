// app/api/team/regularize/route.ts
// "I forgot to punch." The honest correction path.
//
// Two admin limits are enforced here, not in the browser: how many requests a
// person gets per month, and how far back they can reach. Only APPROVED
// requests consume the quota — a rejected one returns to the balance, because
// the quota exists to discourage habitual editing, not to punish someone whose
// honest request the owner happened to decline.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";
import { getAttSettings } from "@/lib/attendance-db";
import { istDate, addDays, hhmmToMinutes, istMinutes } from "@/lib/attendance";

/** A stored timestamp as the "HH:MM" an employee sees on the form. */
function hhmmOf(ts: string): string {
  const m = istMinutes(ts);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export const dynamic = "force-dynamic";

/** Requests that count against this month's allowance. */
function monthStart(): string { return istDate().slice(0, 7) + "-01"; }

export async function GET(req: Request) {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    // What's already recorded for the day being fixed. Without this the
    // employee retypes every session from memory, and a slip silently wipes a
    // real punch — the request replaces the whole day on approval.
    const wanted = new URL(req.url).searchParams.get("date");
    let dayLogs: { in: string; out: string; source?: string }[] = [];
    if (wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted)) {
      const rows = await fetch(
        `${url}/rest/v1/attendance_logs?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&work_date=eq.${wanted}&select=punch_in,punch_out,source&order=punch_in.asc`,
        { headers: empHeaders(key), cache: "no-store" },
      ).then((r) => r.json()).catch(() => []);
      dayLogs = (Array.isArray(rows) ? rows : []).map((l: any) => ({
        in: l.punch_in ? hhmmOf(l.punch_in) : "",
        out: l.punch_out ? hhmmOf(l.punch_out) : "",
        source: l.source,
      }));
    }
    const [settings, empRows, rows] = await Promise.all([
      getAttSettings(url, key, ctx.uid),
      fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=eq.${ctx.employeeId}&select=extra_regularizations&limit=1`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/regularization_requests?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&order=created_at.desc&limit=60`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    const extra = Number(empRows?.[0]?.extra_regularizations || 0);
    const allowed = Number(settings.regularization_quota) + extra;
    const all = Array.isArray(rows) ? rows : [];
    const ms = monthStart();
    // Pending counts too — otherwise someone could queue ten at once.
    const usedThisMonth = all.filter((r: any) => r.created_at >= ms && r.status !== "rejected").length;

    return NextResponse.json({
      dayLogs,
      requests: all,
      allowed,
      used: usedThisMonth,
      remaining: Math.max(0, allowed - usedThisMonth),
      backDays: settings.regularization_back_days,
      earliestDate: addDays(istDate(), -Number(settings.regularization_back_days)),
    });
  } catch { return NextResponse.json({ requests: [], allowed: 0, used: 0, remaining: 0 }); }
}

export async function POST(req: Request) {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;

  try {
    const b = await req.json();
    const date = String(b.date || "");
    const reason = String(b.reason || "").trim().slice(0, 500);
    const logs = Array.isArray(b.logs) ? b.logs : [];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Pick a date." }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "Please give a reason — the owner sees this." }, { status: 400 });
    if (logs.length === 0) return NextResponse.json({ error: "Add at least one in/out time." }, { status: 400 });

    // Validate the proposed times before anything else touches them.
    const clean: { in: string; out: string }[] = [];
    for (const l of logs.slice(0, 8)) {
      const i = hhmmToMinutes(l.in), o = hhmmToMinutes(l.out);
      if (i == null || o == null) return NextResponse.json({ error: "Every row needs both an in and an out time." }, { status: 400 });
      if (o <= i) return NextResponse.json({ error: "Punch-out has to be after punch-in." }, { status: 400 });
      clean.push({ in: String(l.in).slice(0, 5), out: String(l.out).slice(0, 5) });
    }

    const today = istDate();
    const settings = await getAttSettings(url, key, ctx.uid);
    const earliest = addDays(today, -Number(settings.regularization_back_days));

    if (date > today) return NextResponse.json({ error: "You can't regularize a future date." }, { status: 400 });
    if (date < earliest) {
      return NextResponse.json({ error: `You can only fix the last ${settings.regularization_back_days} days. The earliest you can change is ${earliest}.` }, { status: 400 });
    }

    // Quota
    const [empRows, existing] = await Promise.all([
      fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=eq.${ctx.employeeId}&select=extra_regularizations&limit=1`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/regularization_requests?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&created_at=gte.${monthStart()}&select=id,status,work_date`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    const allowed = Number(settings.regularization_quota) + Number(empRows?.[0]?.extra_regularizations || 0);
    const counted = (Array.isArray(existing) ? existing : []).filter((r: any) => r.status !== "rejected");
    if (counted.length >= allowed) {
      return NextResponse.json({ error: `You've used all ${allowed} regularization requests this month.` }, { status: 400 });
    }
    if (counted.some((r: any) => r.work_date === date && r.status === "pending")) {
      return NextResponse.json({ error: "You already have a pending request for that date." }, { status: 400 });
    }

    await fetch(`${url}/rest/v1/regularization_requests`, {
      method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({
        uid: ctx.uid, employee_id: ctx.employeeId, work_date: date,
        proposed_logs: clean, reason, status: "pending",
      }),
    });

    return NextResponse.json({ ok: true, remaining: Math.max(0, allowed - counted.length - 1) });
  } catch {
    return NextResponse.json({ error: "Couldn't send that request." }, { status: 500 });
  }
}
