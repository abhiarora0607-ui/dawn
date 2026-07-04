// app/api/competitors/route.ts
// Fetches PUBLIC data for competitor handles via Instagram's Business
// Discovery API, then uses AI to explain what's working. Legal, free.
// Instagram cannot auto-discover competitors, so the user provides handles.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

async function getToken(): Promise<{ token: string; igUserId: string } | null> {
  try {
    const { cookies } = await import("next/headers");
    const igUserId = cookies().get("dawn_ig")?.value;
    if (!igUserId) return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) return null;
    const res = await fetch(`${url}/rest/v1/ig_connections?ig_user_id=eq.${igUserId}&select=access_token&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
    });
    const rows = await res.json();
    return rows?.[0]?.access_token ? { token: rows[0].access_token, igUserId } : null;
  } catch {
    return null;
  }
}

async function aiInsight(handle: string, data: any): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return "Connect AI to see what's working for this account.";
  const prompt = `You are analyzing a competitor's public Instagram data for a creator. In ONE punchy sentence, say what's working for them and what the creator should learn. Be specific.

Competitor @${handle}: ${JSON.stringify(data)}`;
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) continue;
      const d = await res.json();
      const t = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (t) return t.trim();
    } catch { continue; }
  }
  return "Public data retrieved — see their recent activity above.";
}

export async function POST(req: Request) {
  const conn = await getToken();
  if (!conn) {
    return NextResponse.json({ error: "Connect Instagram first to analyze competitors.", competitors: [] }, { status: 400 });
  }

  let handles: string[] = [];
  try {
    const body = await req.json();
    handles = (body.handles || []).map((h: string) => h.replace("@", "").trim()).filter(Boolean).slice(0, 5);
  } catch {
    return NextResponse.json({ error: "Invalid request.", competitors: [] }, { status: 400 });
  }
  if (!handles.length) return NextResponse.json({ competitors: [] });

  const results = [];
  for (const handle of handles) {
    try {
      // Business Discovery: public data on another business/creator account
      const fields = `business_discovery.username(${handle}){username,followers_count,media_count,media.limit(6){caption,like_count,comments_count,media_type,timestamp}}`;
      const res = await fetch(`https://graph.instagram.com/${conn.igUserId}?fields=${encodeURIComponent(fields)}&access_token=${conn.token}`, { cache: "no-store" });
      const data = await res.json();
      const bd = data?.business_discovery;
      if (!bd) {
        results.push({ handle, error: "Couldn't fetch (must be a public business/creator account).", followers: null });
        continue;
      }
      const posts = bd.media?.data || [];
      const avgEng = posts.length
        ? Math.round(posts.reduce((s: number, p: any) => s + (p.like_count || 0) + (p.comments_count || 0), 0) / posts.length)
        : 0;
      const topPost = posts.slice().sort((a: any, b: any) => ((b.like_count || 0) + (b.comments_count || 0)) - ((a.like_count || 0) + (a.comments_count || 0)))[0];
      const summary = {
        followers: bd.followers_count,
        posts: bd.media_count,
        avgEngagement: avgEng,
        topPostCaption: (topPost?.caption || "").slice(0, 80),
        topPostFormat: topPost?.media_type === "VIDEO" ? "Reel" : topPost?.media_type === "CAROUSEL_ALBUM" ? "Carousel" : "Image",
      };
      const insight = await aiInsight(handle, summary);
      results.push({ handle, followers: bd.followers_count, posts: bd.media_count, avgEngagement: avgEng, topPost: summary.topPostCaption, topFormat: summary.topPostFormat, insight });
    } catch {
      results.push({ handle, error: "Analysis failed for this handle.", followers: null });
    }
  }

  return NextResponse.json({ competitors: results });
}
