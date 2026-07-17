"use client";

// Recently deleted — the owner's 30-day safety net. Restore anything deleted
// by mistake; after 30 days it's purged for good.

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { Loader2, RotateCcw, Trash2, Contact, ShoppingBag, Tag, Wallet } from "lucide-react";

const ICON: Record<string, any> = { contact: Contact, order: ShoppingBag, item: Tag, expense: Wallet };

export default function RecoveryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(30);
  const [restoring, setRestoring] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/recovery").then((r) => r.json()).then((d) => { setItems(d.items || []); setWindowDays(d.windowDays || 30); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function restore(kind: string, id: string) {
    setRestoring(id);
    await fetch("/api/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id }) });
    setRestoring(null); load();
  }

  return (
    <DashboardShell>
      <DashTopbar pageTitle="Recently deleted" />
      <div className="w-full max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-10 py-6 sm:py-8 space-y-5">
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy">Recently deleted</h1>
          <p className="text-muted text-sm mt-1">Anything you delete is kept for {windowDays} days. Restore it here, or let it clear itself.</p>
        </div>

        {loading ? (
          <div className="p-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>
        ) : items.length === 0 ? (
          <div className="dawn-card p-12 text-center">
            <Trash2 className="w-10 h-10 text-navy/15 mx-auto mb-3" />
            <p className="text-navy font-medium">Nothing deleted recently</p>
            <p className="text-sm text-muted mt-1">Deleted contacts, orders, items and expenses show up here for {windowDays} days.</p>
          </div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {items.map((it) => {
              const Icon = ICON[it.kind] || Trash2;
              const daysLeft = Math.max(0, windowDays - Math.floor((Date.now() - new Date(it.deletedAt).getTime()) / 86400000));
              return (
                <div key={`${it.kind}-${it.id}`} className="dawn-card p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-navy/40" /></span>
                    <div className="min-w-0">
                      <p className="font-medium text-navy text-sm truncate">{it.label}</p>
                      <p className="text-[11px] text-muted capitalize">{it.kind} · {daysLeft}d left to restore</p>
                    </div>
                  </div>
                  <button onClick={() => restore(it.kind, it.id)} disabled={restoring === it.id} className="flex items-center gap-1.5 text-sm font-medium text-amber-deep border border-amber/40 px-3 py-1.5 rounded-lg hover:bg-amber/5 shrink-0 disabled:opacity-50">
                    {restoring === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Restore
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
