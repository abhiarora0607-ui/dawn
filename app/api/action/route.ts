// app/api/action/route.ts
// Turns a briefing action into something the user can ACT ON inside Dawn:
// a ready-to-post caption, a drafted reply, or a queued post. This closes
// the loop so the user doesn't leave Dawn to do the work manually.

import { parseAiJson } from "@/lib/ai-prompt";
import { NextResponse } from "next/server";
import { getProviderAsync, getProvider } from "@/lib/data-provider";
import { getBrandVoice, brandVoicePrompt } from "@/lib/brand-voice";
import { getPersona, personaPrompt } from "@/lib/persona";
import { getStore, storePrompt } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  let action: any = {};
  try { action = (await req.json()).action || {}; } catch {}
  if (!key || !action.title) return NextResponse.json({ error: "Missing action." }, { status: 400 });

  let account;
  try { account = await (await getProviderAsync()).getAccount(); } catch { account = await getProvider().getAccount(); }
  const [voice, persona, store] = await Promise.all([getBrandVoice(), getPersona(), getStore()]);
  const ctx = brandVoicePrompt(voice) + personaPrompt(persona) + storePrompt(store);

  const prompt = `You are Dawn, executing a recommended action for an e-commerce brand owner so they can act on it in one tap — no leaving the app. Turn this action into something ready to use.

ACTION: ${action.title}
DETAIL: ${action.detail || ""}
BRAND: ${account.displayName} (${account.niche})${ctx}

Respond with JSON only — no markdown:
{
  "type": "post" | "reply" | "task",
  "ready": "the ready-to-use output — a full caption if it's a post, a drafted reply if it's a reply, or a crisp checklist if it's a task",
  "hashtags": ["#..."] (only if type is post, else empty),
  "note": "one line on how to use this"
}

RULES: make 'ready' genuinely usable and on-brand, tied to their products/revenue where relevant. If the action is about posting, write the actual caption. If about replying to DMs/comments, write the actual reply. If it's a to-do (e.g. 'update your link in bio'), give a tight checklist.`;

  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) continue;
      const d = await res.json();
      const t = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = parseAiJson<any>(t, null);
      if (parsed?.ready) return NextResponse.json(parsed);
    } catch { continue; }
  }
  return NextResponse.json({ error: "Couldn't prepare this action. Try again." }, { status: 500 });
}
