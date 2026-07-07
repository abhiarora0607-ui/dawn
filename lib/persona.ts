// lib/persona.ts
// Builds and caches a rich persona of the connected account from
// accessible data (bio, captions, posting patterns). Threads into
// every AI feature for deep personalization. The chat/comment layer
// is structured here but only populates after Meta App Review.

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

export type Persona = {
  identity?: string;        // who they are in one line
  themes?: string[];        // recurring content themes
  voiceTraits?: string[];   // how they communicate
  audienceProfile?: string; // who follows them
  values?: string[];        // what they care about
  contentStyle?: string;    // formats & aesthetic they favor
  postingPattern?: string;  // cadence / timing observations
  personalNotes?: string;   // anything distinctive
};

async function igUserId(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get("dawn_ig")?.value ?? null;
  } catch { return null; }
}

async function sbGet(path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  return res.json();
}

export async function getPersona(): Promise<Persona | null> {
  const id = await igUserId();
  if (!id) return null;
  try {
    const rows = await sbGet(`account_persona?ig_user_id=eq.${id}&select=persona_json&limit=1`);
    return rows?.[0]?.persona_json ?? null;
  } catch { return null; }
}

export async function buildPersona(): Promise<Persona | null> {
  const key = process.env.GEMINI_API_KEY;
  const id = await igUserId();
  if (!key || !id) return null;

  // Get token
  const conn = await sbGet(`ig_connections?ig_user_id=eq.${id}&select=access_token&limit=1`);
  const token = conn?.[0]?.access_token;
  if (!token) return null;

  try {
    const meRes = await fetch(`https://graph.instagram.com/me?fields=username,name,biography,followers_count,media_count&access_token=${token}`, { cache: "no-store" });
    const me = await meRes.json();
    const mediaRes = await fetch(`https://graph.instagram.com/me/media?fields=caption,media_type,timestamp,like_count,comments_count&limit=20&access_token=${token}`, { cache: "no-store" });
    const media = await mediaRes.json();
    const posts = media?.data || [];
    const captions = posts.map((m: any) => m.caption).filter(Boolean).slice(0, 15);

    const prompt = `You are a brand strategist building a deep persona profile of an Instagram creator, so an AI assistant can personalize everything it does for them. Analyze their real data and infer a rich persona. Respond with JSON only — no markdown.

PROFILE: name=${me.name || me.username}, bio="${me.biography || ""}", followers=${me.followers_count}, posts=${me.media_count}
RECENT CAPTIONS:
${captions.map((c: string, i: number) => `${i + 1}. ${c.slice(0, 200)}`).join("\n") || "(none)"}
POST FORMATS: ${posts.map((m: any) => m.media_type).join(", ")}

Return exactly:
{
  "identity": "who they are in one vivid line",
  "themes": ["3-5 recurring content themes"],
  "voiceTraits": ["3-4 traits describing how they write/communicate"],
  "audienceProfile": "who follows them and why, one line",
  "values": ["2-3 things they clearly care about"],
  "contentStyle": "the formats and aesthetic they favor, one line",
  "postingPattern": "observations on their cadence and what performs, one line",
  "personalNotes": "anything distinctive an assistant should remember"
}

RULES: infer everything from real evidence in their captions and bio. Be specific and vivid, never generic. This persona will shape every future AI output, so make it genuinely useful.`;

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
        if (parsed?.identity) {
          // Cache it
          const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const sk = process.env.SUPABASE_SECRET_KEY;
          if (url && sk) {
            await fetch(`${url}/rest/v1/account_persona`, {
              method: "POST",
              headers: { apikey: sk, Authorization: `Bearer ${sk}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
              body: JSON.stringify({ ig_user_id: id, persona_json: parsed, built_at: new Date().toISOString() }),
            });
          }
          return parsed;
        }
      } catch { continue; }
    }
  } catch {}
  return null;
}

// Turns a persona into a compact prompt fragment for any AI feature.
export function personaPrompt(p: Persona | null): string {
  if (!p) return "";
  const parts: string[] = [];
  if (p.identity) parts.push(`Who they are: ${p.identity}`);
  if (p.themes?.length) parts.push(`Content themes: ${p.themes.join(", ")}`);
  if (p.voiceTraits?.length) parts.push(`Voice: ${p.voiceTraits.join(", ")}`);
  if (p.audienceProfile) parts.push(`Audience: ${p.audienceProfile}`);
  if (p.values?.length) parts.push(`Values: ${p.values.join(", ")}`);
  if (p.contentStyle) parts.push(`Content style: ${p.contentStyle}`);
  if (parts.length === 0) return "";
  return `\n\nDEEP PERSONA (personalize everything to this creator):\n${parts.join("\n")}`;
}

// Cron-safe version: fetch persona by explicit ig_user_id (no cookies).
export async function personaPromptFor(igUserId: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return "";
  try {
    const res = await fetch(`${url}/rest/v1/account_persona?ig_user_id=eq.${igUserId}&select=persona_json&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
    });
    const rows = await res.json();
    return personaPrompt(rows?.[0]?.persona_json ?? null);
  } catch { return ""; }
}
