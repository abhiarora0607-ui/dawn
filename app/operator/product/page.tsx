"use client";

// PRODUCT — what people actually do, and what they reach for and can't have.
// The activation funnel in words, locked-feature demand (pricing research),
// why people leave, and how they feel. This tab tells you what to build.

import { useEffect, useState } from "react";
import { OperatorGate } from "@/components/OperatorGate";
import { Hero, Empty } from "@/components/OperatorTabs";
import { Loader2 } from "lucide-react";

export default function ProductPage() {
  return <OperatorGate><Product /></OperatorGate>;
}

function Product() {
  const [d, setD] = useState<any>(null);
  const [bill, setBill] = useState<any>(null);

  useEffect(() => {
    fetch("/api/operator/overview").then((r) => r.json()).then(setD).catch(() => {});
    fetch("/api/operator/billing").then((r) => r.json()).then(setBill).catch(() => {});
  }, []);

  if (!d) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;

  const f = d.funnel || {};
  const stuck = (f.signedUp || 0) - (f.setUp || 0);
  const line = f.signedUp
    ? stuck > 0 ? `${stuck} signed up but never started` : "Everyone who signed up got going"
    : "No signups yet";
  const sub = "Where people stop is where the product needs work.";

  const STEPS = [
    { label: "Signed up", n: f.signedUp || 0 },
    { label: "Added something real", n: f.setUp || 0 },
    { label: "Recorded an order", n: f.firstOrder || 0 },
    { label: "Kept coming back", n: f.habit || 0 },
  ];
  const max = Math.max(1, f.signedUp || 1);

  return (
    <>
      <Hero line={line} sub={sub} />

      {d.countsLive === false && d.countsAsOf && (
        <p className="text-[12px] text-muted">Counts summarised {new Date(d.countsAsOf).toLocaleString()} — not live.</p>
      )}

      {/* Funnel — bars, not a number soup */}
      <div className="dawn-card p-5">
        <p className="font-semibold text-navy text-sm mb-3">Getting started</p>
        <div className="space-y-2.5">
          {STEPS.map((s) => (
            <div key={s.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-navy">{s.label}</span>
                <span className="text-muted">{s.n}</span>
              </div>
              <div className="h-2 rounded-full bg-surface overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-deep to-amber" style={{ width: `${Math.round((s.n / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* Locked-feature demand */}
        <div className="dawn-card p-5">
          <p className="font-semibold text-navy text-sm mb-1">What people reach for and can&apos;t have</p>
          <p className="text-[12px] text-muted mb-3">Clicks on a locked area, last 30 days — live pricing research.</p>
          {!bill || Object.keys(bill.gateHits || {}).length === 0 ? <p className="text-xs text-muted">Nobody has hit a locked area yet.</p> : (
            Object.entries(bill.gateHits).sort((a: any, b: any) => b[1] - a[1]).map(([a, n]: any) => (
              <p key={a} className="text-sm text-navy flex justify-between py-1 border-b border-navy-line/40 last:border-0">
                <span>{a === "crm" ? "CRM & Business" : a === "instagram_ai" ? "Instagram & AI" : a}</span>
                <span className="font-semibold">{n}</span>
              </p>
            ))
          )}
        </div>

        {/* Why people leave */}
        <div className="dawn-card p-5">
          <p className="font-semibold text-navy text-sm mb-3">Why people leave</p>
          {!bill || Object.keys(bill.cancelReasons || {}).length === 0 ? <p className="text-xs text-muted">Nobody has cancelled. Good sign.</p> : (
            Object.entries(bill.cancelReasons).sort((a: any, b: any) => b[1] - a[1]).map(([r, n]: any) => (
              <p key={r} className="text-sm text-navy flex justify-between py-1 border-b border-navy-line/40 last:border-0"><span>{r}</span><span className="font-semibold">{n}</span></p>
            ))
          )}
        </div>

        {/* Feedback */}
        <div className="dawn-card p-5">
          <p className="font-semibold text-navy text-sm mb-3">How Dawn feels to use</p>
          {!bill || (bill.feedback || []).length === 0 ? <p className="text-xs text-muted">No feedback yet.</p> : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {bill.feedback.map((fb: any) => (
                <p key={fb.id} className="text-xs text-navy">
                  <span>{fb.mood === "happy" ? "😍" : fb.mood === "neutral" ? "😐" : "😞"}</span>{" "}
                  <span className="font-medium">{fb.name || fb.uid.slice(0, 10)}</span>
                  {fb.note && <span className="text-muted"> — {fb.note}</span>}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Referrals */}
        <div className="dawn-card p-5">
          <p className="font-semibold text-navy text-sm mb-1">Word of mouth</p>
          <p className="text-[12px] text-muted mb-3">Signups that arrived through a &ldquo;Powered by Dawn&rdquo; link.</p>
          {!bill || Object.keys(bill.referrals || {}).length === 0 ? <p className="text-xs text-muted">No referred signups yet.</p> : (
            Object.entries(bill.referrals).sort((a: any, b: any) => b[1] - a[1]).slice(0, 8).map(([r, n]: any) => (
              <p key={r} className="text-sm text-navy flex justify-between py-1 border-b border-navy-line/40 last:border-0"><span className="truncate">{r}</span><span className="font-semibold">{n}</span></p>
            ))
          )}
        </div>
      </div>
    </>
  );
}
