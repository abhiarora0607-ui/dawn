// app/api/reset/route.ts
// Wiping a business back to empty.
//
// The most destructive action in Dawn, so it's built to be hard to do by
// accident and impossible to do by surprise:
//
//   · GET returns exact counts, so the confirmation shows "412 records", not
//     "all your data".
//   · POST requires the business name typed correctly. Not a checkbox — typing
//     the name is the only confirmation that can't be clicked through on
//     autopilot.
//   · Owner-only. Not admins, not a permission. Someone granted admin access
//     to help with rotas should not be able to delete the company.
//   · Audited before it runs, so the record survives its own deletion.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { countRecords, wipeRecords, summariseCounts, verifyWipe } from "@/lib/data-lifecycle-db";
import { RESET_PRESERVES } from "@/lib/data-lifecycle";
import { audit } from "@/lib/audit";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";

async function ctx() {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return null;
  return { uid, url, key };
}

/** The name someone must type to confirm. */
async function businessName(url: string, key: string, uid: string): Promise<string> {
  const rows = await fetch(`${url}/rest/v1/business_settings?uid=eq.${uid}&select=business_name&limit=1`,
    { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
  return rows?.[0]?.business_name || "";
}

export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { uid, url, key } = c;

  const [{ counts, total }, name] = await Promise.all([
    countRecords(url, key, uid, "all"),
    businessName(url, key, uid),
  ]);

  return NextResponse.json({
    businessName: name,
    total,
    breakdown: summariseCounts(counts),
    // Stated plainly, because "what survives" is the question someone actually
    // has before doing this.
    preserved: [
      "Your login and password",
      "Your subscription and billing",
      "Business name, currency and working hours",
      "Attendance and payroll settings",
      "Your own employee record",
    ],
    preservedTables: RESET_PRESERVES,
  });
}

export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { uid, url, key } = c;

  try {
    const b = await req.json();
    const expected = await businessName(url, key, uid);

    // Typing the name is the confirmation. A checkbox can be clicked without
    // reading; a name has to be looked at and copied.
    const typed = String(b.confirm || "").trim();
    if (!expected) {
      return NextResponse.json({ error: "Set your business name in settings before resetting." }, { status: 400 });
    }
    if (typed.toLowerCase() !== expected.toLowerCase()) {
      return NextResponse.json({ error: `Type "${expected}" exactly to confirm.` }, { status: 400 });
    }

    const keepEmployees = !!b.keepEmployees;

    // Audit BEFORE deleting: the audit log survives a reset, so the record of
    // the reset has to be written while there is still something to write it
    // against.
    const { total } = await countRecords(url, key, uid, "all");
    await audit({
      uid, action: "org.reset", entity: "business", entityId: uid,
      meta: { records: total, keepEmployees },
    });

    const result = await wipeRecords(url, key, uid, "all", { keepEmployees });

    // Confirm it actually finished rather than trusting that it did.
    const check = await verifyWipe(url, key, uid, "all");

    return NextResponse.json({
      ok: true,
      deleted: result.total,
      failed: result.failed,
      clean: check.clean,
      remaining: check.remaining,
      note: !check.clean
        ? `Removed ${result.total} records, but some are still there. Run it again — if they persist, contact support.`
        : result.failed.length
        ? `Removed ${result.total} records. ${result.failed.length} table(s) couldn't be reached.`
        : `Removed ${result.total} records. Your business is now empty.`,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't complete the reset." }, { status: 500 });
  }
}
