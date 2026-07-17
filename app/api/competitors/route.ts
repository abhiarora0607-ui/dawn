// app/api/competitors/route.ts
// Fetches PUBLIC data for competitor handles via Instagram's Business
// Discovery API, then uses AI to explain what's working. Legal, free.
// Instagram cannot auto-discover competitors, so the user provides handles.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";

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
  const prompt = `You are Dawn — a competitive intelligence strategist for Instagram creators. You're analyzing a competitor's PUBLIC data to give this creator one sharp, actionable takeaway they can use this week. Think like a strategist, not a describer.

COMPETITOR @${handle}: ${JSON.stringify(data)}

Write ONE punchy sentence (max 30 words) that identifies what's actually working for this competitor AND what the creator should specifically do about it. Be concrete — name the tactic (their posting cadence, format mix, hook style, or engagement pattern) and the move to steal. No fluff, no "they seem to be doing well."`;
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

export async function GET() {
  { // Billing: Instagram & AI is a plan area.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
  }
  // AI suggests competitor handles based on the connected account's niche/bio.
  const conn = await getToken();
  const key = process.env.GEMINI_API_KEY;
  if (!conn || !key) {
    return NextResponse.json({ suggestions: [] });
  }
  // Get the account's own profile for context
  let profile: any = {};
  try {
    const meRes = await fetch(`https://graph.instagram.com/me?fields=username,name,biography,followers_count&access_token=${conn.token}`, { cache: "no-store" });
    profile = await meRes.json();
  } catch {}

  const prompt = `You are Dawn — an Instagram strategist who knows the creator landscape across every niche and region. This creator wants to track competitors and adjacent accounts to learn from. Suggest 5 real, active, PUBLIC Instagram accounts they should watch. Respond with JSON only — no markdown.

THIS ACCOUNT: username=${profile.username}, name=${profile.name}, bio=${profile.biography || "unknown"}, followers=${profile.followers_count}

Return exactly: {"suggestions":[{"handle":"username_without_at","why":"one specific reason this account is worth tracking for THIS creator"}]}

RULES:
- 5 real accounts that genuinely exist and are public — well-known creators/brands in the same or adjacent niche.
- Prefer accounts a tier or two ahead in size (aspirational but learnable-from), plus 1-2 direct peers.
- Match their niche AND region/language where the bio suggests one.
- The "why" must be specific to what this creator can learn (their Reel style, their community tactics, their aesthetic), not generic praise.
- Handles only, no @ symbol, no made-up accounts.`;

  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) continue;
      const d = await res.json();
      const t = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = JSON.parse(t.replace(/```json|```/g, "").trim());
      if (parsed?.suggestions?.length) {
        return NextResponse.json({ suggestions: parsed.suggestions.slice(0, 5) });
      }
    } catch { continue; }
  }
  return NextResponse.json({ suggestions: [] });
}

export async function POST(req: Request) {
  { // Billing: Instagram & AI is a plan area.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
  }
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
