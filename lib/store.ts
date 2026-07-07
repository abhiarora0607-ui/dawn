// lib/store.ts
// The D2C "store memory" — product catalog, promos, goals, winning hooks.
// Fed into the briefing so every recommendation is revenue-aware and
// tied to what this specific brand actually sells.

export type StoreProfile = {
  store_url?: string;
  products?: string;
  promos?: string;
  goals?: string;
  avg_order_value?: string;
  winning_hooks?: string;
};

async function currentIgUserId(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get("dawn_ig")?.value ?? null;
  } catch { return null; }
}

export async function getStore(): Promise<StoreProfile | null> {
  const id = await currentIgUserId();
  if (!id) return null;
  return getStoreFor(id);
}

export async function getStoreFor(igUserId: string): Promise<StoreProfile | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/store_profile?ig_user_id=eq.${igUserId}&select=*&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
    });
    const rows = await res.json();
    return rows?.[0] ?? null;
  } catch { return null; }
}

export async function saveStore(igUserId: string, s: StoreProfile): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/store_profile`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ ig_user_id: igUserId, ...s, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch { return false; }
}

export function storePrompt(s: StoreProfile | null): string {
  if (!s) return "";
  const parts: string[] = [];
  if (s.store_url) parts.push(`Store: ${s.store_url}`);
  if (s.products) parts.push(`Products & price points: ${s.products}`);
  if (s.promos) parts.push(`Current promos/launches: ${s.promos}`);
  if (s.goals) parts.push(`Business goals: ${s.goals}`);
  if (s.avg_order_value) parts.push(`Average order value: ${s.avg_order_value}`);
  if (s.winning_hooks) parts.push(`Past hooks that converted: ${s.winning_hooks}`);
  if (parts.length === 0) return "";
  return `\n\nSTORE CONTEXT (this is an e-commerce brand — tie every recommendation to selling these products and moving revenue):\n${parts.join("\n")}`;
}

export async function storePromptFor(igUserId: string): Promise<string> {
  return storePrompt(await getStoreFor(igUserId));
}
