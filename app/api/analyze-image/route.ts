// app/api/analyze-image/route.ts
// Takes a base64 image, uses Gemini vision (free tier) to analyze it in
// detail, then generates captions (multiple styles) and tiered hashtags.
// Uses brand voice so captions sound like the creator.

import { parseAiJson } from "@/lib/ai-prompt";
import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getBrandVoice, brandVoicePrompt } from "@/lib/brand-voice";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

async function callGemini(parts: any[], key: string): Promise<string | null> {
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts }] }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch {
      continue;
    }
  }
  return null;
}

function parseJson(text: string): any | null {
  return parseAiJson<any>(text, null);
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
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "AI isn't configured yet." }, { status: 500 });
  }

  let imageBase64 = "";
  let mimeType = "image/jpeg";
  let isVideo = false;
  try {
    const body = await req.json();
    imageBase64 = body.image || "";
    mimeType = body.mimeType || "image/jpeg";
    isVideo = !!body.isVideo;
    if (!imageBase64) throw new Error("no image");
  } catch {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  const voice = await getBrandVoice();
  const voicePrompt = brandVoicePrompt(voice);

  // Reels / video: skip pixel analysis (Gemini vision is for stills). Generate
  // a caption + hashtag package from brand voice only, and return neutral
  // enhancement values so the UI stays consistent.
  if (isVideo) {
    const vPrompt = `You are Dawn, an Instagram creative director. Write a post-ready package for a REEL (short video) for this business. ${voicePrompt}\nRespond with JSON only (no markdown): {"captions":[{"style":"...","text":"..."},{"style":"...","text":"..."},{"style":"...","text":"..."}],"hashtags":{"trending":[],"niche":[],"low_competition":[],"local":[]}}`;
    try {
      const out = await callGemini([{ text: vPrompt }], key);
      const parsed = parseAiJson<any>(out || "", null);
      return NextResponse.json({
        analysis: { subject: "Reel", mood: "", strengths: [], issues: [] },
        enhancement: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpness: 0 },
        fix_flags: [],
        captions: parsed.captions || [],
        hashtags: parsed.hashtags || { trending: [], niche: [], low_competition: [], local: [] },
      });
    } catch {
      return NextResponse.json({ error: "Couldn't generate caption. Try again." }, { status: 500 });
    }
  }

  const imagePart = { inline_data: { mime_type: mimeType, data: imageBase64 } };

  // One combined call: analysis + captions + hashtags + enhancement advice
  const prompt = `You are Dawn — a world-class Instagram creative director who combines the eye of a professional photographer, the instincts of a viral copywriter, and the precision of a colour-grading retoucher. Analyze this exact image and produce a complete, post-ready package. Respond with JSON only — no markdown, no backticks.

Return exactly this shape:
{
  "analysis": {
    "subject": "the specific main subject",
    "scene": "scene type",
    "setting": "indoor or outdoor",
    "lighting": "describe the actual light — direction, quality, warmth",
    "mood": "the emotional mood/aesthetic this image projects",
    "colors": "the actual dominant colours you see",
    "category": "content category (food, travel, fashion, fitness, business, lifestyle, pets, product, portrait, etc.)",
    "composition": "one precise composition note (rule of thirds, symmetry, leading lines, framing)",
    "quality_notes": "honest technical read — exposure, white balance, noise, sharpness, dynamic range"
  },
  "enhancement": {
    "brightness": 0, "contrast": 0, "saturation": 0, "warmth": 0, "sharpness": 0,
    "explanation": "1-2 sentences: what you're correcting and why it makes THIS image stronger"
  },
  "fix_flags": ["specific distractions you'd remove/crop but can't auto-edit — be precise about location, e.g. 'stray person entering frame at bottom-right — crop or clone out'"],
  "captions": [
    {"style":"Viral","text":"..."},
    {"style":"Storytelling","text":"..."},
    {"style":"Professional","text":"..."},
    {"style":"Funny","text":"..."},
    {"style":"Minimal","text":"..."}
  ],
  "hashtags": {
    "trending": ["#..."], "niche": ["#..."], "low_competition": ["#..."], "local": ["#..."]
  }
}

CREATIVE DIRECTOR RULES:
- ANALYSIS: describe what you ACTUALLY see in this specific image, not generic categories. Be a photographer — name the real light, the real colours, the real composition.
- ENHANCEMENT: values on a -40 to 40 scale (0 = leave alone). Base every value on a genuine flaw you observed in quality_notes. If the image is already well-exposed, don't inflate numbers — small honest adjustments beat fake dramatic ones.
- CAPTIONS: each must be genuinely good and specific to THIS image — reference what's actually in it. Vary length and rhythm by style. Viral = bold hook + share trigger. Storytelling = evocative, 2-3 lines. Professional = clean and credible. Funny = actually witty, not corny. Minimal = 1 line max. NEVER write generic captions that could fit any photo.
- HASHTAGS: mix reach tiers intelligently. Trending = high-volume discovery. Niche = tightly relevant. Low_competition = specific long-tail tags they can rank in. Local = only if the image implies a place. Real, correctly-spelled tags a top creator would use.${voicePrompt}`;

  const raw = await callGemini([{ text: prompt }, imagePart], key);
  if (!raw) {
    return NextResponse.json({ error: "The AI couldn't process this image. Try a different photo or a smaller file." }, { status: 500 });
  }
  const parsed = parseJson(raw);
  if (!parsed || !parsed.captions) {
    return NextResponse.json({ error: "The AI response was incomplete. Please try again." }, { status: 500 });
  }

  return NextResponse.json(parsed);
}
