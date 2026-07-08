"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DawnLogo } from "@/components/DawnLogo";
import { TrialBanner } from "@/components/TrialBanner";
import {
  LayoutDashboard, TrendingUp, Users, PenLine, MessageSquare, Settings, ArrowRight, Mic, Plus, Menu, X, Bookmark, CalendarDays, CalendarClock, Tag, Contact, Wallet, Lightbulb, ShoppingBag, UserCog,
} from "lucide-react";

const CRM_NAV = [
  { href: "/dashboard/contacts", label: "Contacts", icon: Contact },
  { href: "/dashboard/orders", label: "Orders", icon: ShoppingBag },
  { href: "/dashboard/suggestions", label: "Suggestions", icon: Lightbulb, badge: true },
  { href: "/dashboard/sales", label: "Finance", icon: Wallet },
  { href: "/dashboard/employees", label: "Employees", icon: UserCog },
  { href: "/dashboard/price-list", label: "Price List", icon: Tag },
];

const IG_NAV = [
  { href: "/dashboard", label: "Briefing", icon: LayoutDashboard },
  { href: "/dashboard/create", label: "Create", icon: Plus },
  { href: "/dashboard/studio", label: "Studio", icon: CalendarDays },
  { href: "/dashboard/queue", label: "Queue", icon: CalendarClock },
  { href: "/dashboard/engage", label: "Engage", icon: MessageSquare },
  { href: "/dashboard/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/dashboard/competitors", label: "Competitors", icon: Users },
  { href: "/dashboard/content", label: "Content", icon: PenLine },
  { href: "/dashboard/saved", label: "Saved", icon: Bookmark },
  { href: "/dashboard/brand-voice", label: "Brand Voice", icon: Mic },
];

const BOTTOM_NAV = [
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function NavItem({ item, pathname, onNavigate, badgeCount }: { item: any; pathname: string; onNavigate?: () => void; badgeCount?: number }) {
  const active = pathname === item.href;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? "bg-navy text-white" : "text-navy/60 hover:bg-navy/5 active:bg-navy/10"}`}
    >
      <item.icon className="w-[18px] h-[18px]" />
      <span>{item.label}</span>
      {item.label === "Briefing" && <span className="ml-auto w-2 h-2 rounded-full bg-amber" />}
      {item.badge && badgeCount ? <span className="ml-auto text-[10px] font-bold bg-amber text-navy px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{badgeCount}</span> : null}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-navy/35">{children}</p>;
}

function NavLinks({ pathname, onNavigate, suggCount }: { pathname: string; onNavigate?: () => void; suggCount?: number }) {
  return (
    <>
      <SectionLabel>CRM &amp; Business</SectionLabel>
      {CRM_NAV.map((item) => <NavItem key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} badgeCount={suggCount} />)}
      <SectionLabel>Instagram &amp; AI</SectionLabel>
      {IG_NAV.map((item) => <NavItem key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
      <div className="pt-3 mt-2 border-t border-navy-line/60">
        {BOTTOM_NAV.map((item) => <NavItem key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
      </div>
    </>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode; title?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [suggCount, setSuggCount] = useState(0);

  useEffect(() => {
    fetch("/api/suggestions").then((r) => r.json()).then((d) => setSuggCount((d.suggestions || []).length)).catch(() => {});
  }, [pathname]);

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Desktop sidebar */}
      <aside className="w-60 border-r border-navy/8 flex-col hidden lg:flex fixed h-screen z-30" style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 60%, #F9FBFD 100%)" }}>
        <div className="px-5 h-16 flex items-center border-b border-navy/8">
          <Link href="/"><DawnLogo className="h-8" /></Link>
        </div>
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          <NavLinks pathname={pathname} suggCount={suggCount} />
        </nav>
        <div className="p-3 border-t border-navy/8">
          <Link href="/" className="flex items-center gap-2 px-3 py-2 text-xs text-navy/40 hover:text-navy/70">
            <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back to site
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-white border-b border-navy/8 flex items-center justify-between px-4 z-40">
        <Link href="/"><DawnLogo className="h-8" /></Link>
        <button onClick={() => setOpen(true)} className="p-2 -mr-2 text-navy" aria-label="Menu">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 max-w-[80%] bg-white flex flex-col animate-[slidein_0.2s_ease-out]">
            <div className="px-5 h-14 flex items-center justify-between border-b border-navy/8">
              <DawnLogo className="h-8" />
              <button onClick={() => setOpen(false)} className="p-2 -mr-2 text-navy/60" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} suggCount={suggCount} />
            </nav>
            <div className="p-3 border-t border-navy/8">
              <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-xs text-navy/40">
                <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back to site
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main content — pushed right on desktop, down on mobile */}
      <main className="flex-1 lg:ml-60 pt-14 lg:pt-0 w-full min-w-0 pb-16 lg:pb-0 dawn-app-bg min-h-screen">
        <TrialBanner />
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-navy-line flex items-center justify-around h-16 px-1">
        {[
          { href: "/dashboard", label: "Home", icon: LayoutDashboard },
          { href: "/dashboard/contacts", label: "Contacts", icon: Contact },
          { href: "/dashboard/orders", label: "Orders", icon: ShoppingBag },
          { href: "/dashboard/price-list", label: "Prices", icon: Tag },
          { href: "/dashboard/settings", label: "More", icon: Menu },
        ].map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 ${active ? "text-amber-deep" : "text-navy/50"}`}>
              <item.icon className="w-[20px] h-[20px]" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
