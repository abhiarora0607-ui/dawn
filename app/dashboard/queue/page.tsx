"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { Loader2, CalendarClock, Check, Copy, Trash2 } from "lucide-react";

type Item = { id: string; kind: string; status: string; title: string; body: string; meta: any; created_at: string };

export default function Queue() {
  const { data } = useBrief();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function load() {
    fetch("/api/schedule").then((r) => r.json()).then((d) => { setItems(d.items || []); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function mark(id: string, status: string) {
    await fetch("/api/schedule", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    setItems(items.map((i) => i.id === id ? { ...i, status } : i));
  }

  function copy(item: Item) {
    const text = item.body + (item.meta?.hashtags?.length ? "\n\n" + item.meta.hashtags.join(" ") : "");
    navigator.clipboard.writeText(text);
    setCopiedId(item.id); setTimeout(() => setCopiedId(null), 1500);
  }

  const active = items.filter((i) => i.status === "queued");
  const done = items.filter((i) => i.status !== "queued");

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Queue" />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy">Your queue</h1>
          <p className="text-muted text-sm mt-1">Posts and actions you&apos;ve approved, ready to publish.</p>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
        ) : active.length === 0 && done.length === 0 ? (
          <div className="bg-white rounded-2xl border border-navy-line p-12 text-center shadow-card">
            <div className="w-14 h-14 rounded-2xl bg-amber/15 flex items-center justify-center mx-auto mb-4">
              <CalendarClock className="w-7 h-7 text-amber-deep" />
            </div>
            <h2 className="text-lg font-semibold text-navy mb-2">Nothing queued yet</h2>
            <p className="text-muted text-sm max-w-sm mx-auto">On your briefing, tap &ldquo;Do it&rdquo; on any action and add it here. Your approved posts and tasks live in this queue, ready to publish.</p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div className="space-y-3">
                {active.map((item) => (
                  <div key={item.id} className="bg-white rounded-2xl border border-navy-line p-5 shadow-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-amber-deep uppercase bg-amber/10 px-2 py-0.5 rounded">{item.kind}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => copy(item)} className="p-1.5 text-navy/40 hover:text-navy" title="Copy">
                          {copiedId === item.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <button onClick={() => mark(item.id, "done")} className="text-xs font-medium bg-navy text-white px-3 py-1.5 rounded-lg hover:bg-navy-soft">Mark done</button>
                      </div>
                    </div>
                    {item.title && <p className="text-sm font-semibold text-navy mb-1">{item.title}</p>}
                    <p className="text-sm text-navy/70 leading-snug whitespace-pre-wrap">{item.body}</p>
                    {item.meta?.hashtags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.meta.hashtags.slice(0, 8).map((h: string, i: number) => <span key={i} className="text-[10px] bg-navy/5 text-navy/50 px-1.5 py-0.5 rounded">{h}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {done.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Done</p>
                <div className="space-y-2">
                  {done.map((item) => (
                    <div key={item.id} className="bg-white/60 rounded-xl border border-navy-line p-3 flex items-center gap-3 opacity-70">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <p className="text-sm text-navy/60 truncate flex-1">{item.title || item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
