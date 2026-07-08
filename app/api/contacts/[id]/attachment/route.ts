// app/api/contacts/[id]/attachment/route.ts
import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string, extra: Record<string, string> = {}) { return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra }; }

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.fileUrl) return NextResponse.json({ error: "Missing file." }, { status: 400 });
    await fetch(`${url}/rest/v1/attachments`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ uid, contact_id: params.id, file_url: b.fileUrl, kind: b.kind || "other" }),
    });
    // Log to timeline
    await fetch(`${url}/rest/v1/activities`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ uid, contact_id: params.id, type: "attachment", content: b.kind === "payment_screenshot" ? "Payment screenshot attached" : "Attachment added" }),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed." }, { status: 500 }); }
}
