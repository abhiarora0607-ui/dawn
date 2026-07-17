"use client";

// "What's new" — the changelog card. You ship constantly; owners should know.
// Shows the latest operator announcements from the last 60 days; session-dismissible.

import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";

export function WhatsNew() {
  const [items, setItems] = useState<any[]>([]);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    fetch("/api/announcements").then((r) => r.json()).then((d) => setItems(d.items || [])).catch(() => {});
  }, []);
  if (hidden || items.length === 0) return null;
  return (
    <div className="dawn-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="dawn-section-title text-sm"><Megaphone className="w-4 h-4 text-amber-deep" /> What&apos;s new in Dawn</p>
        <button onClick={() => setHidden(true)} className="text-navy/30 hover:text-navy"><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2">
        {items.slice(0, 3).map((a) => (
          <div key={a.id} className="text-sm">
            <p className="font-medium text-navy">{a.title} <span className="text-[10px] text-muted font-normal">· {new Date(a.created_at).toLocaleDateString()}</span></p>
            {a.body && <p className="text-xs text-muted mt-0.5">{a.body}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
