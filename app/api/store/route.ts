// app/api/store/route.ts
import { NextResponse } from "next/server";
import { getStore, saveStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getStore();
  return NextResponse.json({ store: s || {} });
}

export async function POST(req: Request) {
  try {
    const { cookies } = await import("next/headers");
    const id = cookies().get("dawn_ig")?.value;
    if (!id) return NextResponse.json({ error: "Connect Instagram first." }, { status: 400 });
    const b = await req.json();
    const ok = await saveStore(id, {
      store_url: b.store_url, products: b.products, promos: b.promos,
      goals: b.goals, avg_order_value: b.avg_order_value, winning_hooks: b.winning_hooks,
    });
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Save failed." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
