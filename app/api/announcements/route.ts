// app/api/announcements/route.ts
// "What's new" for owners: the latest operator-posted updates (last 60 days).

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return NextResponse.json({ items: [] });
  try {
    const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();
    const rows = await fetch(`${url}/rest/v1/announcements?created_at=gte.${cutoff}&order=created_at.desc&limit=5`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
    }).then((r) => r.json());
    return NextResponse.json({ items: Array.isArray(rows) ? rows : [] });
  } catch { return NextResponse.json({ items: [] }); }
}
