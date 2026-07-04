"use client";

import { Sunrise } from "lucide-react";
import type { Account } from "@/lib/use-brief";

export function DashTopbar({ account, pageTitle }: { account?: Account; pageTitle: string }) {
  return (
    <div className="h-16 bg-white border-b border-navy/8 flex items-center justify-between px-4 sm:px-6 sticky top-14 lg:top-0 z-20 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-amber/15 flex items-center justify-center shrink-0">
          <Sunrise className="w-5 h-5 text-amber-deep" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy leading-tight truncate">
            {account ? account.displayName : pageTitle}
          </p>
          <p className="text-xs text-navy/50 truncate">
            {account ? `${account.handle} · ${pageTitle}` : "Loading…"}
          </p>
        </div>
      </div>
      <a
        href="/api/instagram/connect"
        className="text-xs font-semibold bg-amber text-navy px-3 sm:px-4 py-2 rounded-lg hover:bg-amber-deep hover:text-white transition-colors whitespace-nowrap shrink-0"
      >
        <span className="hidden sm:inline">Connect Instagram</span>
        <span className="sm:hidden">Connect</span>
      </a>
    </div>
  );
}
