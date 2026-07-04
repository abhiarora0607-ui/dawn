// lib/brand-voice.ts
// Read/write the connected account's brand voice profile.
// Used by every AI feature so outputs stay on-brand.

export type BrandVoice = {
  tone?: string;
  audience?: string;
  products?: string;
  emoji_style?: string;
  dos?: string;
  donts?: string;
  faqs?: string;
  sample_caption?: string;
};

async function currentIgUserId(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get("dawn_ig")?.value ?? null;
  } catch {
    return null;
  }
}

export async function getBrandVoice(): Promise<BrandVoice | null> {
  const igUserId = await currentIgUserId();
  if (!igUserId) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/brand_voice?ig_user_id=eq.${igUserId}&select=*&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    const rows = await res.json();
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function saveBrandVoice(igUserId: string, v: BrandVoice): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/brand_voice`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ ig_user_id: igUserId, ...v, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Turns a brand voice profile into a prompt fragment the AI can use.
export function brandVoicePrompt(v: BrandVoice | null): string {
  if (!v) return "";
  const parts: string[] = [];
  if (v.tone) parts.push(`Tone: ${v.tone}`);
  if (v.audience) parts.push(`Audience: ${v.audience}`);
  if (v.products) parts.push(`Products/services: ${v.products}`);
  if (v.emoji_style) parts.push(`Emoji style: ${v.emoji_style}`);
  if (v.dos) parts.push(`Always: ${v.dos}`);
  if (v.donts) parts.push(`Never: ${v.donts}`);
  if (v.sample_caption) parts.push(`Example of how they write: "${v.sample_caption}"`);
  if (v.faqs) parts.push(`Known FAQs: ${v.faqs}`);
  if (parts.length === 0) return "";
  return `\n\nBrand voice to match exactly:\n${parts.join("\n")}\nWrite as if you are this creator — match their voice, not a generic AI.`;
}
