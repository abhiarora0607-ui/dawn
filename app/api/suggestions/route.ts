// app/api/suggestions/route.ts
// Computes the "Dawn tells you what to do" suggestions from live CRM data.
// Rule-based (no fakery): stale leads, pending payments, win-back, follow-ups
// due, and payment-proof→convert. Thresholds are defaults (editable later).

import { NextResponse } from "next/server";
import { getEntitlements } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string, extra: Record<string, string> = {}) { return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra }; }

const DAY = 86400000;
function daysSince(iso: string) { return Math.floor((Date.now() - new Date(iso).getTime()) / DAY); }

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ suggestions: [] });
  const _ent = await getEntitlements(url, key, uid);
  if (!_ent.features.ai) return NextResponse.json({ suggestions: [], locked: true, lockedReason: "AI suggestions are on the Pro plan." });


  try {
    const [contacts, sales, activities, attachments, states] = await Promise.all([
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${uid}&select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/activities?uid=eq.${uid}&select=contact_id,created_at&order=created_at.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/attachments?uid=eq.${uid}&select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/suggestion_state?uid=eq.${uid}&select=id,status`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);

    const C = Array.isArray(contacts) ? contacts : [];
    const S = Array.isArray(sales) ? sales : [];
    const A = Array.isArray(activities) ? activities : [];
    const AT = Array.isArray(attachments) ? attachments : [];
    const stateMap: Record<string, string> = {};
    for (const s of (Array.isArray(states) ? states : [])) stateMap[s.id] = s.status;

    const lastActivity: Record<string, string> = {};
    for (const a of A) if (!lastActivity[a.contact_id]) lastActivity[a.contact_id] = a.created_at;

    const out: any[] = [];
    const push = (id: string, type: string, message: string, contactId?: string, extra: any = {}) => {
      if (stateMap[id] === "dismissed" || stateMap[id] === "accepted") return;
      out.push({ id, type, message, contactId, ...extra });
    };

    for (const c of C) {
      const isLead = c.stage && !["Customer (Won)", "Lost"].includes(c.stage);

      // 1) Payment proof → convert
      const proof = AT.find((a) => a.contact_id === c.id && a.kind === "payment_screenshot");
      if (isLead && proof) {
        push(`proof_${c.id}`, "payment_proof", `${c.name} sent what looks like a payment screenshot. Convert to customer and record the sale?`, c.id, { priority: "high" });
      }

      // 2) Stale lead (no activity 3+ days)
      const last = lastActivity[c.id] || c.created_at;
      if (isLead && daysSince(last) >= 3) {
        push(`stale_${c.id}`, "stale_lead", `Follow up with ${c.name} — no activity in ${daysSince(last)} days.`, c.id, { priority: "medium", phone: c.phone });
      }

      // 5) Follow-up due today
      if (c.follow_up_date) {
        const d = new Date(c.follow_up_date).toDateString();
        if (d === new Date().toDateString()) {
          push(`followup_${c.id}`, "follow_up", `Follow-up with ${c.name} is due today.`, c.id, { priority: "high", phone: c.phone });
        }
      }
    }

    // 3) Pending payment 5+ days
    for (const s of S) {
      if ((s.status === "partial" || s.status === "pending") && daysSince(s.date) >= 5 && Number(s.balance) > 0) {
        const c = C.find((x) => x.id === s.contact_id);
        push(`pending_${s.id}`, "pending_payment", `Remind ${c?.name || "customer"} about the pending balance of ₹${Number(s.balance)}.`, s.contact_id, { priority: "high", phone: c?.phone });
      }
    }

    // 4) Win-back (customer, no purchase 60+ days)
    const lastSaleByContact: Record<string, string> = {};
    for (const s of S) if (s.contact_id && (!lastSaleByContact[s.contact_id] || s.date > lastSaleByContact[s.contact_id])) lastSaleByContact[s.contact_id] = s.date;
    for (const c of C) {
      if (c.stage === "Customer (Won)") {
        const ls = lastSaleByContact[c.id];
        if (ls && daysSince(ls) >= 60) {
          push(`winback_${c.id}`, "win_back", `Check in with ${c.name} — last order was ${daysSince(ls)} days ago.`, c.id, { priority: "low", phone: c.phone });
        }
      }
    }

    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    out.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));

    return NextResponse.json({ suggestions: out });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}

// Mark a suggestion accepted/dismissed
export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.id || !b.status) return NextResponse.json({ error: "Missing." }, { status: 400 });
    await fetch(`${url}/rest/v1/suggestion_state`, {
      method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ id: b.id, uid, status: b.status, updated_at: new Date().toISOString() }),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed." }, { status: 500 }); }
}
