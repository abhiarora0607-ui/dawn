// app/api/automation/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function igUserId(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get("dawn_ig")?.value ?? null;
  } catch {
    return null;
  }
}

const DEFAULTS = {
  comment_enabled: false, comment_mode: "ai", comment_fixed_reply: "",
  dm_enabled: false, dm_mode: "ai", dm_fixed_reply: "",
};

export async function GET() {
  const id = await igUserId();
  if (!id) return NextResponse.json({ settings: DEFAULTS, connected: false });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ settings: DEFAULTS, connected: true });
  try {
    const res = await fetch(`${url}/rest/v1/automation_settings?ig_user_id=eq.${id}&select=*&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
    });
    const rows = await res.json();
    return NextResponse.json({ settings: rows?.[0] || DEFAULTS, connected: true });
  } catch {
    return NextResponse.json({ settings: DEFAULTS, connected: true });
  }
}

export async function POST(req: Request) {
  const id = await igUserId();
  if (!id) return NextResponse.json({ error: "Connect Instagram first." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  try {
    const b = await req.json();
    const res = await fetch(`${url}/rest/v1/automation_settings`, {
      method: "POST",
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        ig_user_id: id,
        comment_enabled: !!b.comment_enabled,
        comment_mode: b.comment_mode === "fixed" ? "fixed" : "ai",
        comment_fixed_reply: b.comment_fixed_reply || "",
        dm_enabled: !!b.dm_enabled,
        dm_mode: b.dm_mode === "fixed" ? "fixed" : "ai",
        dm_fixed_reply: b.dm_fixed_reply || "",
        updated_at: new Date().toISOString(),
      }),
    });
    return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Save failed." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
