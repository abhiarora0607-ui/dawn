// app/api/persona/route.ts
import { NextResponse } from "next/server";
import { getPersona, buildPersona } from "@/lib/persona";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const p = await getPersona();
  return NextResponse.json({ persona: p });
}

export async function POST() {
  const p = await buildPersona();
  return p ? NextResponse.json({ persona: p }) : NextResponse.json({ error: "Couldn't build persona. Make sure Instagram is connected with posts." }, { status: 500 });
}
