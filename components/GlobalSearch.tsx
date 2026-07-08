"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, X, User, Tag } from "lucide-react";

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function onChange(val: string) {
    setQ(val);
    clearTimeout(timer.current);
    if (val.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await (await fetch(`/api/search?q=${encodeURIComponent(val.trim())}`)).json();
        setResults(d.results || []); setOpen(true);
      } catch {}
    }, 250);
  }

  return (
    <div ref={boxRef} className="relative hidden sm:block w-56 lg:w-72">
      <div className="flex items-center gap-2 border border-navy-line rounded-lg px-3 bg-surface">
        <Search className="w-4 h-4 text-navy/40" />
        <input
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => q.length >= 2 && setOpen(true)}
          placeholder="Search contacts, items…"
          className="flex-1 py-2 text-sm bg-transparent text-navy focus:outline-none"
        />
        {q && <button onClick={() => { setQ(""); setResults([]); }} className="text-navy/40 hover:text-navy"><X className="w-3.5 h-3.5" /></button>}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 inset-x-0 bg-white border border-navy-line rounded-xl shadow-card-hover overflow-hidden z-30">
          {results.map((r) => (
            <Link key={`${r.kind}-${r.id}`} href={r.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface">
              <div className="w-7 h-7 rounded-lg bg-amber/10 flex items-center justify-center shrink-0">
                {r.kind === "contact" ? <User className="w-3.5 h-3.5 text-amber-deep" /> : <Tag className="w-3.5 h-3.5 text-amber-deep" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-navy truncate">{r.title}</p>
                <p className="text-xs text-muted truncate">{r.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      {open && q.length >= 2 && results.length === 0 && (
        <div className="absolute top-full mt-1 inset-x-0 bg-white border border-navy-line rounded-xl shadow-card p-3 text-sm text-muted z-30">No matches.</div>
      )}
    </div>
  );
}
