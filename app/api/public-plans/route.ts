// app/api/public-plans/route.ts
// The ONLY public, unauthenticated billing read: the active plan catalogue for
// the marketing /pricing page. Deliberately narrow — names, prices, taglines
// and area flags only. No subscriber data, no counts, nothing tenant-specific.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ plans: [], trialDays: 14 });
  try {
    const [plans, cfg] = await Promise.all([
      fetch(`${url}/rest/v1/plans?is_active=eq.true&select=id,name,tagline,price_monthly,price_yearly,features,max_seats,sort_order&order=sort_order.asc`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
      }).then((r) => r.json()),
      fetch(`${url}/rest/v1/app_config?key=eq.billing&select=value&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
      }).then((r) => r.json()).catch(() => []),
    ]);
    const trialDays = Number((Array.isArray(cfg) && cfg[0]?.value?.default_trial_days) ?? 14);
    return NextResponse.json({ plans: Array.isArray(plans) ? plans : [], trialDays });
  } catch {
    return NextResponse.json({ plans: [], trialDays: 14 });
  }
}
