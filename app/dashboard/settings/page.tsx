"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { Instagram, Check, Loader2, Trash2 } from "lucide-react";

export default function SettingsPage() {
  const { data } = useBrief();
  const [disconnecting, setDisconnecting] = useState(false);
  const connected = data?.account.niche === "Your account";

  async function disconnect() {
    if (!confirm("Disconnect your Instagram and delete stored data? You can reconnect anytime.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/instagram/disconnect", { method: "POST" });
      window.location.href = "/dashboard";
    } catch {
      setDisconnecting(false);
    }
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Settings" />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy">Settings</h1>
          <p className="text-navy/50 text-sm mt-1">Manage your connection and data.</p>
        </div>

        {/* Connection */}
        <section className="bg-white rounded-2xl border border-navy/8 p-6">
          <h2 className="text-sm font-semibold text-navy/50 uppercase tracking-wide mb-4">Instagram connection</h2>
          {connected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber to-amber-deep flex items-center justify-center">
                  <Instagram className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-navy">{data?.account.displayName}</p>
                  <p className="text-xs text-navy/50">{data?.account.handle} · connected</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full">
                <Check className="w-3.5 h-3.5" /> Active
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-navy/60">No Instagram account connected yet.</p>
              <a href="/api/instagram/connect" className="text-sm font-semibold bg-amber text-navy px-4 py-2 rounded-lg hover:bg-amber-deep hover:text-white transition-colors">
                Connect Instagram
              </a>
            </div>
          )}
        </section>

        {/* Data */}
        <section className="bg-white rounded-2xl border border-navy/8 p-6">
          <h2 className="text-sm font-semibold text-navy/50 uppercase tracking-wide mb-4">Your data</h2>
          <p className="text-sm text-navy/60 mb-4">
            Dawn stores only what&apos;s needed to generate your briefing. You can disconnect and delete your stored data at any time.
          </p>
          <button
            onClick={disconnect}
            disabled={disconnecting || !connected}
            className="flex items-center gap-2 text-sm font-medium text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Disconnect &amp; delete my data
          </button>
        </section>

        <p className="text-center text-xs text-navy/30 py-2">
          See our <a href="/privacy" className="underline">privacy policy</a> and <a href="/data-deletion" className="underline">data deletion</a> pages.
        </p>
      </div>
    </DashboardShell>
  );
}
