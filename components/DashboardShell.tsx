"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DawnLogo } from "@/components/DawnLogo";
import {
  LayoutDashboard, TrendingUp, Users, PenLine, MessageSquare, Settings, ArrowRight, Mic, Plus, Menu, X,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Briefing", icon: LayoutDashboard },
  { href: "/dashboard/create", label: "Create", icon: Plus },
  { href: "/dashboard/engage", label: "Engage", icon: MessageSquare },
  { href: "/dashboard/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/dashboard/competitors", label: "Competitors", icon: Users },
  { href: "/dashboard/content", label: "Content", icon: PenLine },
  { href: "/dashboard/brand-voice", label: "Brand Voice", icon: Mic },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? "bg-navy text-white" : "text-navy/60 hover:bg-navy/5 active:bg-navy/10"}`}
          >
            <item.icon className="w-[18px] h-[18px]" />
            <span>{item.label}</span>
            {item.label === "Briefing" && <span className="ml-auto w-2 h-2 rounded-full bg-amber" />}
          </Link>
        );
      })}
    </>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode; title?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Desktop sidebar */}
      <aside className="w-60 bg-white border-r border-navy/8 flex-col hidden lg:flex fixed h-screen z-30">
        <div className="px-5 h-16 flex items-center border-b border-navy/8">
          <Link href="/"><DawnLogo className="h-6" /></Link>
        </div>
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="p-3 border-t border-navy/8">
          <Link href="/" className="flex items-center gap-2 px-3 py-2 text-xs text-navy/40 hover:text-navy/70">
            <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back to site
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-white border-b border-navy/8 flex items-center justify-between px-4 z-40">
        <Link href="/"><DawnLogo className="h-6" /></Link>
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
              <DawnLogo className="h-6" />
              <button onClick={() => setOpen(false)} className="p-2 -mr-2 text-navy/60" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
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
      <main className="flex-1 lg:ml-60 pt-14 lg:pt-0 w-full min-w-0">{children}</main>
    </div>
  );
}
