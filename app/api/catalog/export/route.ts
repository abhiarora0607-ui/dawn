// app/api/catalog/export/route.ts
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return new Response("Sign in first.", { status: 401 });

  const res = await fetch(`${url}/rest/v1/catalog_items?uid=eq.${uid}&order=sort_order.asc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
  });
  const items = await res.json();

  const cols = ["type", "name", "description", "category", "price", "compare_at_price", "unit", "sku", "is_active", "is_public"];
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [cols.join(",")];
  for (const it of items || []) rows.push(cols.map((c) => esc(it[c])).join(","));
  const csv = rows.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="dawn-price-list.csv"`,
    },
  });
}
