"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DawnLogo } from "@/components/DawnLogo";
import {
  LayoutDashboard, TrendingUp, Users, PenLine, MessageSquare, Settings, ArrowRight, Mic, Plus,
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

export function DashboardShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-surface flex">
      <aside className="w-60 bg-white border-r border-navy/8 flex-col hidden lg:flex fixed h-screen">
        <div className="px-5 h-16 flex items-center border-b border-navy/8">
          <Link href="/"><DawnLogo className="h-6" /></Link>
        </div>
        <nav className="p-3 space-y-1 flex-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? "bg-navy text-white" : "text-navy/60 hover:bg-navy/5"}`}
              >
                <item.icon className="w-[18px] h-[18px]" />
                <span>{item.label}</span>
                {item.label === "Briefing" && <span className="ml-auto w-2 h-2 rounded-full bg-amber" />}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-navy/8">
          <Link href="/" className="flex items-center gap-2 px-3 py-2 text-xs text-navy/40 hover:text-navy/70">
            <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back to site
          </Link>
        </div>
      </aside>
      <main className="flex-1 lg:ml-60">{children}</main>
    </div>
  );
}
