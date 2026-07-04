// app/api/brief/route.ts
import { NextResponse } from "next/server";
import { getProviderAsync, getProvider } from "@/lib/data-provider";
import { generateBrief } from "@/lib/briefing-engine";
import { getBrandVoice, brandVoicePrompt } from "@/lib/brand-voice";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const provider = await getProviderAsync();
    const [account, competitors, voice] = await Promise.all([
      provider.getAccount(),
      provider.getCompetitors(),
      getBrandVoice(),
    ]);
    const brief = await generateBrief(account, competitors, brandVoicePrompt(voice));
    return NextResponse.json({ account, competitors, brief });
  } catch (e) {
    try {
      const mock = getProvider();
      const [account, competitors] = await Promise.all([
        mock.getAccount(),
        mock.getCompetitors(),
      ]);
      const brief = await generateBrief(account, competitors);
      return NextResponse.json({ account, competitors, brief, fallback: true });
    } catch {
      return NextResponse.json({ error: "Failed to load briefing." }, { status: 500 });
    }
  }
}
