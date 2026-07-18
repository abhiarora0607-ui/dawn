"use client";

// BUSINESSES — the whole book, scannable. A table, not a card wall: name,
// health as a word, plan, when they joined, when they were last seen. Search,
// filter by health or billing, sort, export.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { OperatorGate } from "@/components/OperatorGate";
import { Hero, HealthPill, PlanPill, Empty } from "@/components/OperatorTabs";
import { Loader2, Search, Download, MessageCircle } from "lucide-react";

export default function BusinessesPage() {
  return <OperatorGate><Businesses /></OperatorGate>;
}

const VIEWS: { key: string; label: string; test: (b: any) => boolean }[] = [
  { key: "all", label: "Everyone", test: () => true },
  { key: "needs_help", label: "Needs help", test: (b) => b.health === "at_risk" || b.health === "slipping" },
  { key: "paying", label: "Paying", test: (b) => b.billingStatus === "paid" },
  { key: "trials", label: "On trial", test: (b) => b.billingStatus === "trial" },
  { key: "thriving", label: "Thriving", test: (b) => b.health === "thriving" },
  { key: "never", label: "Never started", test: (b) => b.health === "dormant" },
];

function Businesses() {
  const [d, setD] = useState<any>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState("all");
  const [sort, setSort] = useState("recent");

  useEffect(() => {
    fetch("/api/operator/overview").then((r) => r.json()).then(setD).catch(() => {});
  }, []);

  const rows: any[] = useMemo(() => {
    if (!d?.businesses) return [] as any[];
    const v = VIEWS.find((x) => x.key === view) || VIEWS[0];
    let list = d.businesses.filter((b: any) =>
      v.test(b) && (!q || (b.name || "").toLowerCase().includes(q.toLowerCase()) || (b.email || "").toLowerCase().includes(q.toLowerCase()) || b.uid.includes(q))
    );
    const order: Record<string, number> = { at_risk: 0, slipping: 1, dormant: 2, new: 3, steady: 4, thriving: 5 };
    if (sort === "health") list = [...list].sort((a: any, b: any) => (order[a.health] ?? 9) - (order[b.health] ?? 9));
    else if (sort === "newest") list = [...list].sort((a: any, b: any) => new Date(b.signedUp).getTime() - new Date(a.signedUp).getTime());
    else list = [...list].sort((a: any, b: any) => (a.daysQuiet ?? 999) - (b.daysQuiet ?? 999));
    return list;
  }, [d, q, view, sort]);

  function exportCsv() {
    const head = ["Business", "Email", "Health", "Plan", "Joined", "Last seen (days ago)", "Instagram"];
    const body = rows.map((b: any) => [b.name || "Unnamed", b.email || "", b.healthLabel || "", b.billingPlan || b.billingStatus || "", new Date(b.signedUp).toLocaleDateString(), b.daysQuiet ?? "", b.ig ? "yes" : "no"]);
    const csv = [head, ...body].map((r: any[]) => r.map((c: any) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `dawn-businesses-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  if (!d) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;

  const total = (d.businesses || []).length;

  return (
    <>
      <Hero line={total === 1 ? "One business on Dawn" : `${total} businesses on Dawn`} sub="Health is a word, not a score. Tap any row for the full story." />

      {/* views */}
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => {
          const n = (d.businesses || []).filter(v.test).length;
          if (n === 0 && v.key !== "all") return null;
          return (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border ${view === v.key ? "bg-navy text-white border-navy" : "text-navy/60 border-navy-line hover:border-navy/30"}`}>
              {v.label}
            </button>
          );
        })}
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 border border-navy-line rounded-xl px-3 bg-white flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-navy/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search businesses…" className="flex-1 py-2.5 text-sm text-navy focus:outline-none bg-transparent" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="text-sm px-3 py-2.5 rounded-xl border border-navy-line text-navy bg-white">
          <option value="recent">Most recently seen</option>
          <option value="health">Needs help first</option>
          <option value="newest">Newest first</option>
        </select>
        <button onClick={exportCsv} className="flex items-center gap-1.5 text-sm text-navy/60 hover:text-navy px-2"><Download className="w-4 h-4" /> CSV</button>
      </div>

      {/* table */}
      {rows.length === 0 ? <Empty>No businesses match.</Empty> : (
        <div className="dawn-card overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-navy-line bg-surface/60 text-[10px] font-bold uppercase tracking-wide text-muted">
            <span className="col-span-4">Business</span>
            <span className="col-span-2">Health</span>
            <span className="col-span-2">Plan</span>
            <span className="col-span-2">Joined</span>
            <span className="col-span-2">Last seen</span>
          </div>
          {rows.map((b: any) => (
            <Link key={b.uid} href={`/operator/b/${encodeURIComponent(b.uid)}`}
              className="grid sm:grid-cols-12 gap-2 sm:gap-3 px-4 py-3 border-b border-navy-line/40 last:border-0 hover:bg-surface/60 items-center">
              <span className="sm:col-span-4 min-w-0">
                <span className="font-medium text-navy truncate block">{b.name || "Unnamed business"}</span>
                <span className="text-[11px] text-muted truncate block">{b.email || b.uid.slice(0, 18)}</span>
              </span>
              <span className="sm:col-span-2"><HealthPill label={b.healthLabel || "—"} tone={b.healthTone || "grey"} /></span>
              <span className="sm:col-span-2 flex items-center gap-1.5">
                <PlanPill status={b.billingStatus} plan={b.billingPlan} />
                {b.billingDaysLeft != null && <span className="text-[11px] text-muted">{b.billingDaysLeft}d</span>}
              </span>
              <span className="sm:col-span-2 text-[13px] text-muted">{new Date(b.signedUp).toLocaleDateString()}</span>
              <span className="sm:col-span-2 text-[13px] text-muted">
                {b.daysQuiet == null ? "never" : b.daysQuiet === 0 ? "today" : `${b.daysQuiet}d ago`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
