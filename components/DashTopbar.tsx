"use client";

import { Sunrise } from "lucide-react";
import type { Account } from "@/lib/use-brief";

export function DashTopbar({ account, pageTitle }: { account?: Account; pageTitle: string }) {
  return (
    <div className="h-16 bg-white border-b border-navy/8 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber/15 flex items-center justify-center">
          <Sunrise className="w-5 h-5 text-amber-deep" />
        </div>
        <div>
          <p className="text-sm font-semibold text-navy leading-tight">
            {account ? account.displayName : pageTitle}
          </p>
          <p className="text-xs text-navy/50">
            {account ? `${account.handle} · ${pageTitle}` : "Loading…"}
          </p>
        </div>
      </div>
      <a
        href="/api/instagram/connect"
        className="text-xs font-semibold bg-amber text-navy px-4 py-2 rounded-lg hover:bg-amber-deep hover:text-white transition-colors"
      >
        Connect Instagram
      </a>
    </div>
  );
}
