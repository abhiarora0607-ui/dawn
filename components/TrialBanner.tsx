"use client";

// The real trial banner — driven by the billing engine, not a cookie. A quiet
// strip during a comfortable trial (dismissible for the session), amber and
// persistent in the last 3 days, firm but never scary in grace / read-only.
// Invisible for paying and complimentary businesses.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, ArrowRight, X } from "lucide-react";

export function TrialBanner() {
  const [e, setE] = useState<any>(null);
  const [hidden, setHidden] = useState(false); // session-only dismiss

  // decorative — a failed load just hides this, which is the right
  // behaviour for a peripheral banner; no retry card belongs in a nav badge.
  useEffect(() => {
    fetch("/api/billing").then((r) => r.json()).then((d) => setE(d?.ent || null)).catch(() => {});
  }, []);

  if (!e || e.effective === "complimentary") return null;
  if (e.effective === "active") {
    if (e.renewsInDays == null || e.renewsInDays > 3 || e.cancelAtPeriodEnd) return null;
    return (
      <div className="bg-navy px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 min-w-0"><Clock className="w-4 h-4 text-amber shrink-0" /><span className="truncate text-white/90">Your plan renews in {e.renewsInDays} day{e.renewsInDays === 1 ? "" : "s"}</span></span>
        <Link href="/dashboard/billing" className="flex items-center gap-1 font-semibold text-amber shrink-0">Renew <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    );
  }

  const urgent = e.effective !== "trialing" || (e.daysLeft != null && e.daysLeft <= 3);
  if (hidden && !urgent) return null;

  const text =
    e.effective === "trialing" ? `Free trial — ${e.daysLeft} day${e.daysLeft === 1 ? "" : "s"} left with full access` :
    e.effective === "grace" ? `Your trial has ended — ${e.daysLeft} day${e.daysLeft === 1 ? "" : "s"} before your account goes read-only` :
    "Your account is read-only. Your data is safe and exportable — upgrade to keep building.";

  return (
    <div className={`${urgent ? "bg-amber/15 border-b border-amber/30" : "bg-navy"} px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-sm`}>
      <span className="flex items-center gap-2 min-w-0">
        <Clock className={`w-4 h-4 shrink-0 ${urgent ? "text-amber-deep" : "text-amber"}`} />
        <span className={`truncate ${urgent ? "text-navy font-medium" : "text-white/90"}`}>{text}</span>
      </span>
      <span className="flex items-center gap-3 shrink-0">
        <Link href="/dashboard/billing" className={`flex items-center gap-1 font-semibold ${urgent ? "text-amber-deep" : "text-amber"}`}>Upgrade <ArrowRight className="w-3.5 h-3.5" /></Link>
        {!urgent && (
          <button onClick={() => setHidden(true)} className="text-white/40 hover:text-white" aria-label="Dismiss"><X className="w-4 h-4" /></button>
        )}
      </span>
    </div>
  );
}
