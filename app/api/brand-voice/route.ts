// app/api/brand-voice/route.ts
import { NextResponse } from "next/server";
import { getBrandVoice, saveBrandVoice } from "@/lib/brand-voice";

export const dynamic = "force-dynamic";

export async function GET() {
  const v = await getBrandVoice();
  return NextResponse.json({ voice: v || {} });
}

export async function POST(req: Request) {
  try {
    const { cookies } = await import("next/headers");
    const igUserId = cookies().get("dawn_ig")?.value;
    if (!igUserId) {
      return NextResponse.json({ error: "Connect Instagram first to save your brand voice." }, { status: 400 });
    }
    const body = await req.json();
    const ok = await saveBrandVoice(igUserId, {
      tone: body.tone,
      audience: body.audience,
      products: body.products,
      emoji_style: body.emoji_style,
      dos: body.dos,
      donts: body.donts,
      faqs: body.faqs,
      sample_caption: body.sample_caption,
    });
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
