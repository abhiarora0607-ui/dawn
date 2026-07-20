"use client";

// The operator's tab shell. Five tabs, one job each — replacing the old
// three-page sprawl where twenty numbers competed for attention.
//
//   Today      · who to talk to right now
//   Businesses · the full book, searchable
//   Money      · MRR, plans, coupons, ledger
//   Product    · what people do and want
//   Control    · settings, announcements, audit

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Building2, IndianRupee, Activity, SlidersHorizontal } from "lucide-react";

const TABS = [
  { href: "/operator", label: "Today", icon: Sun },
  { href: "/operator/businesses", label: "Businesses", icon: Building2 },
  { href: "/operator/money", label: "Money", icon: IndianRupee },
  { href: "/operator/product", label: "Product", icon: Activity },
  { href: "/operator/control", label: "Control", icon: SlidersHorizontal },
];

export function OperatorTabs({ testMode }: { testMode?: boolean }) {
  const pathname = usePathname();
  return (
    <div className="border-b border-navy-line bg-white/70 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display font-semibold text-navy text-lg shrink-0">Operator</span>
            {testMode && <span className="text-[12px] font-bold tracking-widest text-amber-deep bg-amber/10 border border-amber/30 px-2 py-0.5 rounded-full shrink-0">TEST MODE</span>}
          </div>
          <Link href="/dashboard/business" className="text-xs text-muted hover:text-navy shrink-0">Back to app</Link>
        </div>
        <nav className="flex gap-1 -mb-px overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link key={t.href} href={t.href}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  active ? "border-amber-deep text-navy" : "border-transparent text-muted hover:text-navy"
                }`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

// Shared bits so every tab looks the same.

export function HealthPill({ label, tone }: { label: string; tone: string }) {
  const styles: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    navy: "bg-navy/5 text-navy border-navy/15",
    amber: "bg-amber/10 text-amber-deep border-amber/30",
    red: "bg-red-50 text-red-600 border-red-200",
    grey: "bg-slate-100 text-slate-500 border-slate-200",
  };
  return <span className={`text-[12px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${styles[tone] || styles.grey}`}>{label}</span>;
}

export function PlanPill({ status, plan }: { status?: string; plan?: string | null }) {
  if (!status || status === "none") return null;
  const map: Record<string, { text: string; cls: string }> = {
    trial: { text: "Trial", cls: "bg-amber/10 text-amber-deep border-amber/30" },
    paid: { text: plan || "Paid", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    expired: { text: "Ended", cls: "bg-red-50 text-red-600 border-red-200" },
    comp: { text: "Comp", cls: "bg-sky-50 text-sky-600 border-sky-200" },
  };
  const m = map[status];
  if (!m) return null;
  return <span className={`text-[12px] font-semibold px-2 py-0.5 rounded border ${m.cls}`}>{m.text}</span>;
}

// The one big number a tab is allowed. Everything else is a list.
export function Hero({ line, sub }: { line: string; sub?: string }) {
  return (
    <div className="py-2">
      <h1 className="font-display font-semibold text-2xl sm:text-[28px] text-navy leading-tight">{line}</h1>
      {sub && <p className="text-muted text-sm mt-1">{sub}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted py-8 text-center">{children}</p>;
}
