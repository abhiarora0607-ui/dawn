// app/api/brief/route.ts
import { NextResponse } from "next/server";
import { getProviderAsync } from "@/lib/data-provider";
import { generateBrief } from "@/lib/briefing-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = await getProviderAsync();
  const [account, competitors] = await Promise.all([
    provider.getAccount(),
    provider.getCompetitors(),
  ]);
  const brief = await generateBrief(account, competitors);
  return NextResponse.json({ account, competitors, brief });
}
