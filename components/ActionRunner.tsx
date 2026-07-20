"use client";

import { useState, useEffect } from "react";
import { Loader2, X, Copy, Check, CalendarPlus, Sparkles } from "lucide-react";

type Action = { priority: string; title: string; detail: string };
type Prepared = { type: string; ready: string; hashtags?: string[]; note?: string };

export function ActionRunner({ action, onClose }: { action: Action; onClose: () => void }) {
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    fetch("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
      .then((r) => r.json()).then((d) => { if (!d.error) setPrep(d); setLoading(false); }).catch(() => setLoading(false));
  }, [action]);

  function copy() {
    if (!prep) return;
    const text = prep.ready + (prep.hashtags?.length ? "\n\n" + prep.hashtags.join(" ") : "");
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  async function queue() {
    if (!prep) return;
    await fetch("/api/schedule", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: prep.type === "post" ? "post" : "task", title: action.title, body: prep.ready, meta: { hashtags: prep.hashtags } }),
    });
    setQueued(true); setTimeout(() => setQueued(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto animate-rise">
        <div className="sticky top-0 bg-white border-b border-navy-line px-5 py-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-amber-deep">
            <Sparkles className="w-4 h-4" /> Ready to act
          </span>
          <button onClick={onClose} className="btn-icon p-1.5 text-navy/40 hover:text-navy"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          <p className="text-base font-semibold text-navy mb-1">{action.title}</p>
          <p className="text-sm text-muted mb-4">{action.detail}</p>

          {loading ? (
            <div className="p-8 flex items-center justify-center text-muted"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Preparing this for you…</div>
          ) : prep ? (
            <>
              <div className="bg-surface rounded-xl p-4 border border-navy-line">
                <p className="text-sm text-navy/85 leading-relaxed whitespace-pre-wrap">{prep.ready}</p>
                {prep.hashtags && prep.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {prep.hashtags.map((h, i) => <span key={i} className="text-xs bg-navy/5 text-navy/60 px-2 py-1 rounded">{h}</span>)}
                  </div>
                )}
              </div>
              {prep.note && <p className="text-xs text-muted mt-2">{prep.note}</p>}

              <div className="flex gap-2 mt-4">
                <button onClick={copy} className="flex-1 flex items-center justify-center gap-2 bg-navy text-white font-medium px-4 py-3 rounded-xl hover:bg-navy-soft transition-colors">
                  {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                </button>
                <button onClick={queue} className="flex-1 flex items-center justify-center gap-2 bg-amber text-navy font-medium px-4 py-3 rounded-xl hover:bg-amber-glow transition-colors">
                  {queued ? <><Check className="w-4 h-4" /> Queued</> : <><CalendarPlus className="w-4 h-4" /> Add to queue</>}
                </button>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-muted text-sm">Couldn&apos;t prepare this. Close and try again.</div>
          )}
        </div>
      </div>
    </div>
  );
}
