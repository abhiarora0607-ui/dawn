"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { Loader2, Bookmark, Trash2, Copy, Check } from "lucide-react";

type Item = { id: string; kind: string; title: string; body: string; meta: any; created_at: string };

export default function Saved() {
  const { data } = useBrief();
  const [items, setItems] = useState<Item[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function load() {
    fetch("/api/saved").then((r) => r.json()).then((d) => { setItems(d.items || []); setLoading(false); }).catch(() => { setLoadErr("Couldn't load this page — check your connection."); setLoading(false); });
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    await fetch(`/api/saved?id=${id}`, { method: "DELETE" });
    setItems(items.filter((i) => i.id !== id));
  }

  function copy(item: Item) {
    const text = item.body + (item.meta?.hashtags ? "\n\n" + item.meta.hashtags.join(" ") : "");
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Saved" />
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        {loadErr && <p className="t-small text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{loadErr} <button onClick={() => location.reload()} className="underline font-medium">Try again</button></p>}
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy">Saved content</h1>
          <p className="text-muted text-sm mt-1">Captions and ideas you&apos;ve kept, ready to post.</p>
        </div>

        {loading ? (
          <div className="p-10 sm:p-20 flex items-center justify-center text-muted"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading…</div>
        ) : items.length === 0 ? (
          <div className="dawn-card p-12 text-center shadow-card">
            <div className="w-14 h-14 rounded-2xl bg-amber/15 flex items-center justify-center mx-auto mb-4">
              <Bookmark className="w-7 h-7 text-amber-deep" />
            </div>
            <h2 className="text-lg font-semibold text-navy mb-2">Nothing saved yet</h2>
            <p className="text-muted text-sm max-w-sm mx-auto">When you generate content ideas or captions, tap Save to keep them here for whenever you&apos;re ready to post.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {items.map((item) => (
              <div key={item.id} className="dawn-card p-5 shadow-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-bold text-amber-deep uppercase bg-amber/10 px-2 py-0.5 rounded">{item.meta?.format || item.kind}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => copy(item)} className="btn-icon text-navy/40 hover:text-navy" title="Copy">
                      {copiedId === item.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button onClick={() => remove(item.id)} className="btn-icon text-navy/40 hover:text-red-500" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {item.title && <p className="text-sm font-semibold text-navy mb-1">&ldquo;{item.title}&rdquo;</p>}
                <p className="text-sm text-navy/70 leading-snug whitespace-pre-wrap line-clamp-4">{item.body}</p>
                {item.meta?.hashtags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.meta.hashtags.slice(0, 6).map((h: string, i: number) => (
                      <span key={i} className="text-[12px] bg-navy/5 text-navy/50 px-1.5 py-0.5 rounded">{h}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
