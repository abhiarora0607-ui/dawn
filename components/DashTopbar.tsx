"use client";

// The dashboard header. Shows who you are and where you are.
//
// V30 fixes two long-standing lies here:
//  - the subtitle used to sit on "Loading…" forever for magic-link sessions
//    with no Instagram attached, because `account` was permanently null. It
//    now falls back to the business name, and only says "Loading…" while a
//    fetch is genuinely in flight.
//  - "Connect Instagram" used to render unconditionally, so a connected
//    business was told to connect on every single page. It now only appears
//    when there's actually no Instagram connection.

import { useEffect, useState } from "react";
import { Sunrise, Instagram } from "lucide-react";
import type { Account } from "@/lib/use-brief";
import { GlobalSearch } from "@/components/GlobalSearch";

export function DashTopbar({ account, pageTitle }: { account?: Account; pageTitle: string }) {
  const [biz, setBiz] = useState<{ name?: string; connected?: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setBiz({ name: d?.settings?.business_name || d?.business_name || undefined, connected: !!(d?.instagramConnected ?? d?.settings?.instagram_connected) });
      })
      .catch(() => { if (alive) setBiz({}); });
    return () => { alive = false; };
  }, []);

  const connected = !!account || !!biz?.connected;
  const title = account?.displayName || biz?.name || pageTitle;
  const subtitle = account
    ? `${account.handle} · ${pageTitle}`
    : biz === null
      ? "Loading…"                    // genuinely still fetching
      : biz.name
        ? `${biz.name} · ${pageTitle}`
        : pageTitle;                  // no name set — just say where you are

  return (
    <div className="h-16 bg-white border-b border-navy/8 flex items-center justify-between px-4 sm:px-6 sticky top-14 lg:top-0 z-20 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-amber/15 flex items-center justify-center shrink-0">
          <Sunrise className="w-5 h-5 text-amber-deep" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy leading-tight truncate">{title}</p>
          <p className="text-xs text-navy/50 truncate">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <GlobalSearch />
        {connected ? (
          <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-navy/45 whitespace-nowrap" title="Instagram connected">
            <Instagram className="w-3.5 h-3.5" /> Connected
          </span>
        ) : (
          <a
            href="/api/instagram/connect"
            className="text-xs font-semibold bg-amber text-navy px-3 sm:px-4 py-2 rounded-lg hover:bg-amber-deep hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <span className="hidden sm:inline">Connect Instagram</span>
            <span className="sm:hidden">Connect</span>
          </a>
        )}
      </div>
    </div>
  );
}
