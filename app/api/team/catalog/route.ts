// app/api/team/catalog/route.ts
// Read-only catalog for employees (the business's shared products/services),
// so they can build orders. No write access.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardEmployee("catalogue");
  if (!g.ok) return NextResponse.json({ items: [] });
  const { ctx, url, key } = g;
  try {
    const rows = await (await fetch(`${url}/rest/v1/catalog_items?uid=eq.${ctx.uid}&is_active=eq.true&select=id,name,price,cost&order=name.asc`, { headers: empHeaders(key), cache: "no-store" })).json();
    return NextResponse.json({ items: Array.isArray(rows) ? rows : [] });
  } catch { return NextResponse.json({ items: [] }); }
}
