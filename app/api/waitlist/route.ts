// app/api/waitlist/route.ts
// Saves a waitlist email to Supabase. Uses the publishable key + our
// insert-only RLS policy, so this is safe. Reads config from env vars.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { error: "Waitlist isn't configured yet." },
      { status: 500 }
    );
  }

  let email = "";
  try {
    const body = await req.json();
    email = String(body.email || "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!valid) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const res = await fetch(`${url}/rest/v1/waitlist`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ email }),
  });

  // 23505 = unique violation → they're already on the list. Treat as success.
  if (res.status === 409 || res.status === 201 || res.status === 200) {
    return NextResponse.json({ ok: true });
  }

  const text = await res.text();
  if (text.includes("duplicate") || text.includes("23505")) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "Something went wrong. Try again." },
    { status: 500 }
  );
}
