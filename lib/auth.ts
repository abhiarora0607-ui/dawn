// lib/auth.ts
// Unified identity for Dawn. Every feature keys off getUid().
//  - If a magic-link email session exists → that uid.
//  - Else if Instagram is connected → a uid derived from the IG account.
//  - Else → null (not signed in; CRM features prompt for a one-tap magic link).
//
// This guarantees every business's private CRM data is owned and isolated,
// while staying invisible when Instagram is already connected.

import crypto from "crypto";

const SB_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_SECRET_KEY;

async function cookieVal(name: string): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get(name)?.value ?? null;
  } catch { return null; }
}

// Returns the current Dawn user id, or null if not signed in.
export async function getUid(): Promise<string | null> {
  // 1) explicit Dawn session (magic link)
  const sessionUid = await cookieVal("dawn_uid");
  if (sessionUid) return sessionUid;
  // 2) fall back to IG identity so connected users need no extra login
  const ig = await cookieVal("dawn_ig");
  if (ig) return `ig_${ig}`;
  return null;
}

// For features that must have an owner; returns null if not signed in.
export async function requireUid(): Promise<string | null> {
  return getUid();
}

export function newToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function newUid(): string {
  return "u_" + crypto.randomBytes(12).toString("hex");
}

async function sb(path: string, init?: RequestInit) {
  const url = SB_URL(), key = SB_KEY();
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      "Content-Type": "application/json", ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  return res;
}

// Create/lookup a user by email; returns uid.
export async function userForEmail(email: string): Promise<string | null> {
  const clean = email.trim().toLowerCase();
  const found = await sb(`dawn_users?email=eq.${encodeURIComponent(clean)}&select=uid&limit=1`);
  if (found) {
    const rows = await found.json();
    if (rows?.[0]?.uid) return rows[0].uid;
  }
  const uid = newUid();
  const created = await sb(`dawn_users`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ uid, email: clean }),
  });
  return created?.ok ? uid : null;
}

export async function createMagicToken(email: string): Promise<string | null> {
  const token = newToken();
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
  const res = await sb(`magic_tokens`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ token, email: email.trim().toLowerCase(), expires_at: expires }),
  });
  return res?.ok ? token : null;
}

// Consume a magic token → returns uid if valid, else null.
export async function consumeMagicToken(token: string): Promise<string | null> {
  const res = await sb(`magic_tokens?token=eq.${token}&select=*&limit=1`);
  if (!res) return null;
  const rows = await res.json();
  const row = rows?.[0];
  if (!row || row.used || new Date(row.expires_at).getTime() < Date.now()) return null;
  await sb(`magic_tokens?token=eq.${token}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ used: true }),
  });
  return userForEmail(row.email);
}
