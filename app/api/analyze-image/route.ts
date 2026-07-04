// app/api/analyze-image/route.ts
// Takes a base64 image, uses Gemini vision (free tier) to analyze it in
// detail, then generates captions (multiple styles) and tiered hashtags.
// Uses brand voice so captions sound like the creator.

import { NextResponse } from "next/server";
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
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "AI isn't configured yet." }, { status: 500 });
  }

  let imageBase64 = "";
  let mimeType = "image/jpeg";
  try {
    const body = await req.json();
    imageBase64 = body.image || "";
    mimeType = body.mimeType || "image/jpeg";
    if (!imageBase64) throw new Error("no image");
  } catch {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  const voice = await getBrandVoice();
  const voicePrompt = brandVoicePrompt(voice);

  const imagePart = { inline_data: { mime_type: mimeType, data: imageBase64 } };

  // One combined call: analysis + captions + hashtags + enhancement advice
  const prompt = `You are Dawn, an AI photo & content assistant for Instagram creators. Analyze this image and respond with JSON only (no markdown).

Return exactly this shape:
{
  "analysis": {
    "subject": "main subject in a few words",
    "scene": "scene type",
    "setting": "indoor or outdoor",
    "lighting": "lighting description",
    "mood": "mood/aesthetic",
    "colors": "dominant colors",
    "category": "content category (food, travel, fashion, fitness, business, lifestyle, pets, product, etc.)",
    "composition": "one-line composition note",
    "quality_notes": "exposure, white balance, noise, sharpness observations"
  },
  "enhancement": {
    "brightness": 0,
    "contrast": 0,
    "saturation": 0,
    "warmth": 0,
    "sharpness": 0,
    "explanation": "1-2 sentences on why these adjustments help"
  },
  "fix_flags": ["specific distractions or issues you'd crop/remove but cannot auto-edit, e.g. 'person in top-left background — crop tighter'"],
  "captions": [
    {"style":"Viral","text":"..."},
    {"style":"Storytelling","text":"..."},
    {"style":"Professional","text":"..."},
    {"style":"Funny","text":"..."},
    {"style":"Minimal","text":"..."}
  ],
  "hashtags": {
    "trending": ["#..."],
    "niche": ["#..."],
    "low_competition": ["#..."],
    "local": ["#..."]
  }
}

For enhancement values: use a scale of -40 to 40 (0 = no change). Base them on what the image actually needs. brightness/contrast/saturation/warmth/sharpness.
For captions: make them genuinely good and specific to THIS image, not generic. Vary length by style.${voicePrompt}`;

  const raw = await callGemini([{ text: prompt }, imagePart], key);
  if (!raw) {
    return NextResponse.json({ error: "Couldn't analyze the image. Try again." }, { status: 500 });
  }
  const parsed = parseJson(raw);
  if (!parsed) {
    return NextResponse.json({ error: "AI returned an unexpected response. Try again." }, { status: 500 });
  }

  return NextResponse.json(parsed);
}
