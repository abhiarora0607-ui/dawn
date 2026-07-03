// app/api/brief/route.ts
import { NextResponse } from "next/server";
import { getProviderAsync, getProvider } from "@/lib/data-provider";
import { generateBrief } from "@/lib/briefing-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const provider = await getProviderAsync();
    const [account, competitors] = await Promise.all([
      provider.getAccount(),
      provider.getCompetitors(),
    ]);
    const brief = await generateBrief(account, competitors);
    return NextResponse.json({ account, competitors, brief });
  } catch (e) {
    // Last-resort fallback: never blank the dashboard.
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
