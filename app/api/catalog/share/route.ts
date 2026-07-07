// app/api/catalog/share/route.ts
// Resolves the current owner's public price-list slug (creating one if
// needed) and redirects to the public page.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = await getUid();
  const origin = new URL(req.url).origin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return NextResponse.redirect(`${origin}/signin`);
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // Existing storefront?
  const found = await fetch(`${url}/rest/v1/storefront?uid=eq.${uid}&select=slug&limit=1`, { headers: h, cache: "no-store" });
  const rows = await found.json();
  let slug = rows?.[0]?.slug;

  if (!slug) {
    slug = "s" + Math.random().toString(36).slice(2, 9);
    await fetch(`${url}/rest/v1/storefront`, {
      method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ uid, slug }),
    });
  }

  return NextResponse.redirect(`${origin}/p/${slug}`);
}
