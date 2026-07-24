// app/api/cron/lifecycle/route.ts
// The comms loop. Runs daily (Vercel cron). Every mail is send-once via the
// events ledger, so re-runs are safe. Everything is best-effort: a mail
// failure never breaks the run, and with no RESEND_API_KEY this is a no-op.
//
//   day 0    → welcome
//   day 3    → value nudge (only if they haven't set up)
//   T-3, T-1 → trial ending
//   T-3      → renewal reminder (paid)
//   expired  → one "your data is safe" mail, once
//   Mondays  → weekly business digest (owners with real activity)

import { NextResponse } from "next/server";
import { sendMail, shell, alreadySent, markSent, APP } from "@/lib/mailer";
import { recordSubEvent } from "@/lib/billing-events";
import { scheduleDue } from "@/lib/billing-lifecycle";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 86400000;
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export async function GET(req: Request) {
  // Same guard style as the overnight cron: a secret, or Vercel's own header.
  const secret = process.env.CRON_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const auth = req.headers.get("authorization") || "";
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  if (secret && !isVercelCron && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  // ---- V58: apply due plan schedules FIRST. Money logic never waits on an
  // email provider — this phase runs before the Resend guard below.
  // Idempotent by construction: applying a schedule clears its columns, and
  // cancel-at-period-end blocks application (leavers aren't moved).
  const applied: string[] = [];
  try {
    const due = await fetch(`${url}/rest/v1/subscriptions?scheduled_plan_id=not.is.null&effective_at=lte.${new Date().toISOString()}&select=*`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
    const dueList = Array.isArray(due) ? due : [];
    if (dueList.length) {
      const ids = [...new Set(dueList.map((x: any) => x.scheduled_plan_id))];
      const planRows = await fetch(`${url}/rest/v1/plans?id=in.(${ids.join(",")})&select=id,name,price_monthly,price_yearly`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      const planById: Record<string, any> = {};
      for (const pl of Array.isArray(planRows) ? planRows : []) planById[pl.id] = pl;
      for (const sub of dueList) {
        if (!scheduleDue(sub, Date.now())) continue;
        const pl = planById[sub.scheduled_plan_id];
        if (!pl) continue;
        const cyc = sub.scheduled_cycle || sub.billing_cycle || "monthly";
        const start = new Date(sub.effective_at || Date.now());
        const end = new Date(start.getTime() + (cyc === "yearly" ? 365 : 30) * 86400000);
        await fetch(`${url}/rest/v1/subscriptions?uid=eq.${sub.uid}`, {
          method: "PATCH", headers: { ...H(key), "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            plan_id: sub.scheduled_plan_id, billing_cycle: cyc, status: "active",
            period_start: start.toISOString(), period_end: end.toISOString(),
            price_locked: Number(cyc === "yearly" ? pl.price_yearly : pl.price_monthly) || 0,
            scheduled_plan_id: null, scheduled_cycle: null, scheduled_at: null, effective_at: null,
            updated_at: new Date().toISOString(),
          }),
        });
        await recordSubEvent(url, key, {
          uid: sub.uid, actor: "cron", action: "schedule_applied",
          fromPlanId: sub.plan_id, toPlanId: sub.scheduled_plan_id,
          fromStatus: sub.status, toStatus: "active", cycle: cyc,
        });
        applied.push(sub.uid);
      }
    }
  } catch { /* schedules retry on the next run */ }

  if (!process.env.RESEND_API_KEY) return NextResponse.json({ ok: true, applied: applied.length, skipped: "no email provider configured" });

  const now = Date.now();
  const sent: Record<string, number> = { welcome: 0, nudge: 0, trial_end: 0, renewal: 0, expired: 0, digest: 0 };

  try {
    const [users, subs, settings] = await Promise.all([
      fetch(`${url}/rest/v1/dawn_users?select=uid,email,created_at&email=not.is.null`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/subscriptions?select=uid,status,plan_id,trial_ends_at,period_end,cancel_at_period_end`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/business_settings?select=uid,business_name`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    const U: any[] = Array.isArray(users) ? users : [];
    const subByUid: Record<string, any> = {};
    for (const s of Array.isArray(subs) ? subs : []) subByUid[s.uid] = s;
    const nameByUid: Record<string, string> = {};
    for (const s of Array.isArray(settings) ? settings : []) nameByUid[s.uid] = s.business_name;

    const isMonday = new Date().getDay() === 1;

    for (const u of U) {
      const uid = u.uid, email = u.email;
      if (!email) continue;
      const name = nameByUid[uid] || "your business";
      const sub = subByUid[uid];
      const ageDays = u.created_at ? Math.floor((now - new Date(u.created_at).getTime()) / DAY) : null;

      // ---- welcome (day 0-1) ----
      if (ageDays != null && ageDays <= 1 && !(await alreadySent(url, key, uid, "welcome"))) {
        const ok = await sendMail(email, "Welcome to Dawn", shell({
          heading: "You're in — here's the fastest start",
          body: `<p>Dawn is now set up for <strong>${name}</strong>. Three things take about five minutes and make everything else work:</p>
            <p>1. Add a few products or services to your price list<br>
            2. Add or import your existing customers<br>
            3. Record one order — so your finances start telling the truth</p>
            <p>Your public price list and receipts are ready the moment you've done step 1.</p>`,
          ctaLabel: "Open Dawn", ctaHref: `${APP}/dashboard/business`,
          footnote: "Stuck on anything? Just reply — a real person reads these.",
        }));
        if (ok) { await markSent(url, key, uid, "welcome"); sent.welcome++; }
      }

      // ---- day-3 nudge, only if setup is still empty ----
      if (ageDays === 3 && !(await alreadySent(url, key, uid, "nudge3"))) {
        const contacts = await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&is_demo=eq.false&deleted_at=is.null&select=id&limit=1`, { headers: { ...H(key), Prefer: "count=exact" }, cache: "no-store" });
        const count = Number(contacts.headers.get("content-range")?.split("/")[1] || 0);
        if (count === 0) {
          const ok = await sendMail(email, "Bring your customers into Dawn", shell({
            heading: "The quickest win: import your contacts",
            body: `<p>Dawn gets useful the moment your customers are in it — follow-ups, orders and money all hang off that list.</p>
              <p>If you keep customers in a phone or a spreadsheet, the CSV import brings them across in one go.</p>`,
            ctaLabel: "Import contacts", ctaHref: `${APP}/dashboard/contacts`,
          }));
          if (ok) { await markSent(url, key, uid, "nudge3"); sent.nudge++; }
        }
      }

      if (!sub) continue;

      // ---- trial ending (T-3 and T-1) ----
      if (sub.status === "trialing" && sub.trial_ends_at) {
        const left = Math.ceil((new Date(sub.trial_ends_at).getTime() - now) / DAY);
        if ((left === 3 || left === 1) && !(await alreadySent(url, key, uid, `trial_end_${left}`))) {
          const ok = await sendMail(email, left === 1 ? "Your Dawn trial ends tomorrow" : "3 days left on your Dawn trial", shell({
            heading: left === 1 ? "Your trial ends tomorrow" : "Three days left on your trial",
            body: `<p>Everything you've built in <strong>${name}</strong> stays safe either way — contacts, orders, finances, all of it, and you can export it any time.</p>
              <p>To keep adding and editing after the trial, pick the half of Dawn you actually use — or take both.</p>`,
            ctaLabel: "See plans", ctaHref: `${APP}/dashboard/billing`,
            footnote: "Need more time to decide? Reply and ask — an extension is usually a yes.",
          }));
          if (ok) { await markSent(url, key, uid, `trial_end_${left}`); sent.trial_end++; }
        }
      }

      // ---- renewal reminder (T-3, paid, not cancelling) ----
      if ((sub.status === "active" || sub.status === "cancelled") && sub.period_end && !sub.cancel_at_period_end) {
        const left = Math.ceil((new Date(sub.period_end).getTime() - now) / DAY);
        const tag = new Date(sub.period_end).toISOString().slice(0, 10);
        if (left === 3 && !(await alreadySent(url, key, uid, `renew_${tag}`))) {
          const ok = await sendMail(email, "Your Dawn plan renews in 3 days", shell({
            heading: "Renewal coming up",
            body: `<p>Your current period for <strong>${name}</strong> ends in 3 days. Renew whenever you're ready — nothing is charged automatically.</p>`,
            ctaLabel: "Renew now", ctaHref: `${APP}/dashboard/billing`,
          }));
          if (ok) { await markSent(url, key, uid, `renew_${tag}`); sent.renewal++; }
        }
      }

      // ---- lapsed: one honest "your data is safe" note ----
      const endTs = sub.status === "trialing" ? (sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0) : (sub.period_end ? new Date(sub.period_end).getTime() : 0);
      if (endTs && now > endTs + 3 * DAY && sub.status !== "complimentary") {
        const tag = new Date(endTs).toISOString().slice(0, 10);
        if (!(await alreadySent(url, key, uid, `expired_${tag}`))) {
          const ok = await sendMail(email, "Your Dawn data is safe", shell({
            heading: "Nothing has been lost",
            body: `<p>Your access to <strong>${name}</strong> is paused, but every contact, order and record is exactly where you left it — and you can export all of it any time.</p>
              <p>Pick a plan whenever you're ready and you'll pick up mid-sentence.</p>`,
            ctaLabel: "See plans", ctaHref: `${APP}/dashboard/billing`,
            footnote: `Prefer to take your data with you? Export it here: ${APP}/dashboard/settings`,
          }));
          if (ok) { await markSent(url, key, uid, `expired_${tag}`); sent.expired++; }
        }
      }

      // ---- weekly digest (Mondays, active businesses only) ----
      if (isMonday && (sub.status === "active" || sub.status === "trialing" || sub.status === "complimentary")) {
        const weekTag = new Date().toISOString().slice(0, 10);
        if (await alreadySent(url, key, uid, `digest_${weekTag}`)) continue;
        const since = new Date(now - 7 * DAY).toISOString();
        const [newContacts, weekSales, dueFollow] = await Promise.all([
          // full-scan: date-bounded nudge check, minimal columns
          fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&deleted_at=is.null&is_demo=eq.false&created_at=gte.${since}&select=id`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
          fetch(`${url}/rest/v1/sales?uid=eq.${uid}&deleted_at=is.null&is_demo=eq.false&date=gte.${since.slice(0, 10)}&select=amount_paid,order_status`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
          // full-scan: overdue nudge count, date-filtered
          fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&deleted_at=is.null&follow_up_date=lt.${new Date().toISOString().slice(0, 10)}&select=id`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
        ]);
        const leads = Array.isArray(newContacts) ? newContacts.length : 0;
        const orders = (Array.isArray(weekSales) ? weekSales : []).filter((s: any) => s.order_status !== "Cancelled");
        const collected = orders.reduce((a: number, s: any) => a + (Number(s.amount_paid) || 0), 0);
        const overdue = Array.isArray(dueFollow) ? dueFollow.length : 0;
        if (leads === 0 && orders.length === 0 && overdue === 0) continue; // nothing to say — stay quiet

        const ok = await sendMail(email, `Your week at ${name}`, shell({
          heading: "Last week, in one line each",
          body: `<p><strong>${leads}</strong> new lead${leads === 1 ? "" : "s"}<br>
            <strong>${orders.length}</strong> order${orders.length === 1 ? "" : "s"} · <strong>${money(collected)}</strong> collected<br>
            <strong>${overdue}</strong> follow-up${overdue === 1 ? "" : "s"} overdue</p>
            ${overdue > 0 ? `<p>The overdue follow-ups are the ones worth ten minutes this morning — they're already interested.</p>` : `<p>Clean slate on follow-ups. Nice.</p>`}`,
          ctaLabel: "Open your dashboard", ctaHref: `${APP}/dashboard/business`,
        }));
        if (ok) { await markSent(url, key, uid, `digest_${weekTag}`); sent.digest++; }
      }
    }

    // ---- operator's own daily digest: today's worklist, in one email ----
    try {
      const opEmail = process.env.OPERATOR_EMAIL;
      if (opEmail) {
        const dayTag = new Date().toISOString().slice(0, 10);
        if (!(await alreadySent(url, key, "operator", `opdigest_${dayTag}`))) {
          const trialsEnding = (Array.isArray(subs) ? subs : []).filter((s: any) => s.status === "trialing" && s.trial_ends_at && Math.ceil((new Date(s.trial_ends_at).getTime() - now) / DAY) <= 3 && new Date(s.trial_ends_at).getTime() > now);
          const renewals = (Array.isArray(subs) ? subs : []).filter((s: any) => (s.status === "active") && s.period_end && Math.ceil((new Date(s.period_end).getTime() - now) / DAY) <= 5 && new Date(s.period_end).getTime() > now);
          const lines: string[] = [];
          for (const t of trialsEnding) lines.push(`${nameByUid[t.uid] || t.uid.slice(0, 12)} — trial ends in ${Math.ceil((new Date(t.trial_ends_at).getTime() - now) / DAY)}d`);
          for (const r of renewals) lines.push(`${nameByUid[r.uid] || r.uid.slice(0, 12)} — renewal in ${Math.ceil((new Date(r.period_end).getTime() - now) / DAY)}d`);
          if (lines.length > 0) {
            const ok = await sendMail(opEmail, `Dawn — ${lines.length} to handle today`, shell({
              heading: "Today's list",
              body: `<p>${lines.map((l) => `• ${l}`).join("<br>")}</p>`,
              ctaLabel: "Open operator", ctaHref: `${APP}/operator`,
            }));
            if (ok) await markSent(url, key, "operator", `opdigest_${dayTag}`);
          }
        }
      }
    } catch { /* the operator digest never breaks the customer run */ }

    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Lifecycle run failed", sent });
  }
}
