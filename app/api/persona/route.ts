// app/api/persona/route.ts
import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getPersona, buildPersona } from "@/lib/persona";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  { // Billing: Instagram & AI is a plan area.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
  }
  const p = await getPersona();
  return NextResponse.json({ persona: p });
}

export async function POST() {
  { // Billing: Instagram & AI is a plan area.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
  }
  const p = await buildPersona();
  return p ? NextResponse.json({ persona: p }) : NextResponse.json({ error: "Couldn't build persona. Make sure Instagram is connected with posts." }, { status: 500 });
}
