// app/api/cron/overnight/route.ts
// The REAL overnight job. Vercel Cron calls this daily (~7am IST).
// For every connected account it: (1) refreshes the long-lived token if
// it's aging, and (2) pre-generates the daily briefing so it's READY when
// the founder opens their phone — not generated on page load.
//
// Assumption: pre-generating serves the D2C buyer because the promise is
// "Dawn read your account overnight." A briefing that appears instantly at
// 7am feels categorically different from a spinner while Gemini runs.

import { NextResponse } from "next/server";
import { generateBrief } from "@/lib/briefing-engine";
import { brandVoicePromptFor } from "@/lib/brand-voice";
import { personaPromptFor } from "@/lib/persona";
import { storePromptFor } from "@/lib/store";
import { InstagramGraphProvider } from "@/lib/data-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sbHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function GET(req: Request) {
  // Protect the endpoint — only Vercel Cron (with secret) or manual admin.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    // Vercel Cron automatically sends the CRON_SECRET as a Bearer token.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!url || !key) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  // Load all connected accounts
  let connections: any[] = [];
  try {
    const res = await fetch(`${url}/rest/v1/ig_connections?select=ig_user_id,access_token,updated_at`, {
      headers: sbHeaders(key), cache: "no-store",
    });
    connections = await res.json();
  } catch {
    return NextResponse.json({ error: "Couldn't load connections" }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let briefed = 0, refreshed = 0, failed = 0;

  for (const conn of connections || []) {
    const igUserId = conn.ig_user_id;
    let token = conn.access_token;

    // 1) Refresh long-lived token if older than ~50 days (they last 60).
    try {
      const updatedAt = conn.updated_at ? new Date(conn.updated_at).getTime() : 0;
      const ageDays = (Date.now() - updatedAt) / (1000 * 60 * 60 * 24);
      if (ageDays > 50 && appSecret) {
        const rf = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`, { cache: "no-store" });
        const rfData = await rf.json();
        if (rfData.access_token) {
          token = rfData.access_token;
          await fetch(`${url}/rest/v1/ig_connections?ig_user_id=eq.${igUserId}`, {
            method: "PATCH", headers: { ...sbHeaders(key), Prefer: "return=minimal" },
            body: JSON.stringify({ access_token: token, updated_at: new Date().toISOString() }),
          });
          refreshed++;
        }
      }
    } catch { /* non-fatal */ }

    // 2) Pre-generate today's briefing
    try {
      const provider = new InstagramGraphProvider(token, igUserId);
      const [account, competitors] = await Promise.all([provider.getAccount(), provider.getCompetitors()]);
      const ctx = (await brandVoicePromptFor(igUserId)) + (await personaPromptFor(igUserId)) + (await storePromptFor(igUserId));
      const brief = await generateBrief(account, competitors, ctx);
      const payload = { account, competitors, brief };
      await fetch(`${url}/rest/v1/brief_cache`, {
        method: "POST",
        headers: { ...sbHeaders(key), Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ ig_user_id: igUserId, brief_date: today, payload }),
      });
      briefed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, accounts: connections?.length || 0, briefed, refreshed, failed });
}
