"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { MessageSquare, Sparkles } from "lucide-react";

export default function Inbox() {
  const { data } = useBrief();

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Inbox" />
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Inbox</h1>
          <p className="text-navy/50 text-sm mt-1">DMs and comments, with AI-suggested replies you approve before sending.</p>
        </div>

        <div className="bg-white rounded-2xl border border-navy/8 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber/15 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-7 h-7 text-amber-deep" />
          </div>
          <h2 className="text-lg font-semibold text-navy mb-2">Your unified inbox</h2>
          <p className="text-navy/55 text-sm max-w-md mx-auto mb-5">
            Dawn brings your Instagram DMs and comments into one place, drafts replies in your voice, and lets you send with one tap — always within Instagram&apos;s rules. Replies stay human-approved by default.
          </p>
          <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-deep bg-amber/10 px-3 py-1.5 rounded-full">
            <Sparkles className="w-3.5 h-3.5" /> Suggest-and-approve — compliant with Instagram&apos;s 24-hour messaging window
          </div>
        </div>

        {/* Example of what a suggested reply looks like */}
        <section className="bg-white rounded-2xl border border-navy/8 p-6">
          <h2 className="text-sm font-semibold text-navy/50 uppercase tracking-wide mb-4">How suggested replies work</h2>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-navy/10 shrink-0" />
              <div className="bg-surface rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-navy/80 max-w-md">
                Hey! Do you ship to Bangalore? And what&apos;s the price for the sampler pack?
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <div className="bg-navy rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-white max-w-md">
                Hi! Yes, we ship across India including Bangalore 🚚 The sampler pack is ₹499 with free shipping over ₹999. Want me to send the link?
                <div className="mt-2 pt-2 border-t border-white/15 flex items-center gap-2 text-[11px] text-amber">
                  <Sparkles className="w-3 h-3" /> AI-suggested · tap to approve &amp; send
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
