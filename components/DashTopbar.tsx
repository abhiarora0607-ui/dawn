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
import { Sunrise, Instagram, Loader2, LogIn, LogOut } from "lucide-react";
import { useActor } from "@/lib/use-actor";
import type { Account } from "@/lib/use-brief";
import { GlobalSearch } from "@/components/GlobalSearch";

export function DashTopbar({ account, pageTitle }: { account?: Account; pageTitle: string }) {
  const [biz, setBiz] = useState<{ name?: string; connected?: boolean } | null>(null);
  const actor = useActor();

  useEffect(() => {
    let alive = true;
    if (actor === undefined) return;                 // wait for the answer
    if (actor.kind !== "owner") { setBiz({}); return; } // employees skip owner APIs
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setBiz({ name: d?.settings?.business_name || d?.business_name || undefined, connected: !!(d?.instagramConnected ?? d?.settings?.instagram_connected) });
      })
      .catch(() => { if (alive) setBiz({}); });
    return () => { alive = false; };
  }, [actor]);

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
        {actor?.kind === "employee" ? <PunchPill /> : <GlobalSearch />}
        {actor?.kind === "employee" ? null : connected ? (
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

// V60: punch in/out lives in the top bar for employees — the single most
// frequent portal action, one tap from anywhere in the shell. Same endpoint
// and geolocation contract as the attendance page (coords or an honest
// denied flag); hidden entirely when attendance is disabled for the org.
function PunchPill() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  function loadStatus() { fetch("/api/team/attendance").then((r) => r.json()).then(setD).catch(() => {}); }
  useEffect(() => { loadStatus(); }, []);
  async function punch() {
    setBusy(true);
    const coords: any = {};
    try {
      const pos: any = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 }));
      coords.lat = pos.coords.latitude; coords.lng = pos.coords.longitude;
    } catch { coords.denied = true; }
    await fetch("/api/team/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(coords) }).catch(() => {});
    setBusy(false);
    loadStatus();
  }
  if (!d || d.error || d.enabled === false) return null;
  const mins = Number(d.todayMinutes || 0);
  return (
    <button onClick={punch} disabled={busy} title={d.punchedIn ? "Punch out" : "Punch in"}
      className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap transition-colors disabled:opacity-60 ${d.punchedIn ? "bg-amber/15 text-amber-deep hover:bg-amber/25" : "bg-navy text-white hover:bg-navy-soft"}`}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : d.punchedIn ? <LogOut className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
      {d.punchedIn ? `On shift · ${Math.floor(mins / 60)}h ${mins % 60}m` : "Punch in"}
    </button>
  );
}
