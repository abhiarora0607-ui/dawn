// app/api/export-data/route.ts
// The owner downloads their whole business — contacts, orders, items, expenses,
// employees, settings — as one JSON file. Live rows only (no soft-deleted).
// uid-scoped: an owner can only ever export their own business.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const live = (t: string, extra = "") => fetch(`${url}/rest/v1/${t}?uid=eq.${uid}&deleted_at=is.null${extra}`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
  const plain = (t: string) => fetch(`${url}/rest/v1/${t}?uid=eq.${uid}`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);

  try {
    const [contacts, orders, items, expenses, employees, settings, activities] = await Promise.all([
      live("contacts"), live("sales"), live("catalog_items"), live("expenses"),
      plain("employees"), plain("business_settings"), plain("activities"),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      business: Array.isArray(settings) ? settings[0] || null : null,
      counts: {
        contacts: (contacts || []).length, orders: (orders || []).length,
        items: (items || []).length, expenses: (expenses || []).length, employees: (employees || []).length,
      },
      contacts, orders, items, expenses, employees, activities,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dawn-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
