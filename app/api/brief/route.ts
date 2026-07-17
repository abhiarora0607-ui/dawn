// app/api/brief/route.ts
import { NextResponse } from "next/server";
import { getEntitlements } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";
import { getProviderAsync, getProvider } from "@/lib/data-provider";
import { generateBrief } from "@/lib/briefing-engine";
import { getBrandVoice, brandVoicePrompt } from "@/lib/brand-voice";
import { getPersona, personaPrompt } from "@/lib/persona";
import { getStore, storePrompt } from "@/lib/store";

export const dynamic = "force-dynamic";

async function igUserId(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get("dawn_ig")?.value ?? null;
  } catch { return null; }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function getCached(id: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/brief_cache?ig_user_id=eq.${id}&brief_date=eq.${today()}&select=payload&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
    });
    const rows = await res.json();
    return rows?.[0]?.payload ?? null;
  } catch { return null; }
}

async function setCached(id: string, payload: any) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/brief_cache`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ ig_user_id: id, brief_date: today(), payload }),
    });
  } catch {}
}

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  // Billing: AI briefing is a plan feature.
  {
    const _uid = await getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _ent = await getEntitlements(_url, _key, _uid);
      if (!_ent.features.ai) return NextResponse.json({ locked: true, error: "AI briefing is on the Pro plan — upgrade in Settings → Billing." }, { status: 403 });
    }
  }

  const id = await igUserId();

  // Serve cached briefing for connected users (stable through the day)
  if (id && !force) {
    const cached = await getCached(id);
    if (cached) return NextResponse.json({ ...cached, cached: true });
  }

  try {
    const provider = await getProviderAsync();
    const [account, competitors, voice, persona, store] = await Promise.all([
      provider.getAccount(),
      provider.getCompetitors(),
      getBrandVoice(),
      getPersona(),
      getStore(),
    ]);
    const context = brandVoicePrompt(voice) + personaPrompt(persona) + storePrompt(store);
    const brief = await generateBrief(account, competitors, context);
    const payload = { account, competitors, brief };
    if (id && account.niche === "Your account") await setCached(id, payload);
    return NextResponse.json(payload);
  } catch (e) {
    try {
      const mock = getProvider();
      const [account, competitors] = await Promise.all([mock.getAccount(), mock.getCompetitors()]);
      const brief = await generateBrief(account, competitors);
      return NextResponse.json({ account, competitors, brief, fallback: true });
    } catch {
      return NextResponse.json({ error: "Failed to load briefing." }, { status: 500 });
    }
  }
}
