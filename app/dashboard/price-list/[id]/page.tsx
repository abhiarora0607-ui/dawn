"use client";

// Item detail — a product/service as a real record: how it sells, its margin,
// which orders used it, who buys it.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useSettings, money } from "@/lib/use-settings";
import { Loader2, ArrowLeft, Package, TrendingUp, ShoppingBag, Users, AlertTriangle } from "lucide-react";

export default function ItemDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { currency } = useSettings();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/item-detail?id=${id}`).then((r) => r.json()).then((res) => { setD(res); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <DashboardShell><DashTopbar pageTitle="Item" /><div className="p-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div></DashboardShell>;
  if (!d || d.error) return <DashboardShell><DashTopbar pageTitle="Item" /><div className="p-12 text-center text-muted">Couldn&apos;t load this item.</div></DashboardShell>;

  const it = d.item, s = d.stats;

  return (
    <DashboardShell>
      <DashTopbar pageTitle="Item" />
      <div className="dawn-page space-y-5">
        <button onClick={() => router.push("/dashboard/price-list")} className="flex items-center gap-1.5 text-sm text-muted hover:text-navy"><ArrowLeft className="w-4 h-4" /> Price list</button>

        <div className="dawn-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display font-semibold text-2xl text-navy flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-deep" /> {it.name}
              </h1>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm text-muted">
                <span className="capitalize">{it.type}</span>
                {it.category && <span>· {it.category}</span>}
                <span>· {money(Number(it.price) || 0, currency)} {it.unit || ""}</span>
                {!it.is_active && <span className="text-red-500">· inactive</span>}
              </div>
            </div>
            <Link href="/dashboard/price-list" className="text-sm text-amber-deep font-medium shrink-0">Edit</Link>
          </div>
        </div>

        {!s.hasCost && (
          <div className="dawn-card border-amber/30 p-4 flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-deep shrink-0" />
            <span className="text-navy">No cost set for this item — margin can&apos;t be calculated. <Link href="/dashboard/price-list" className="text-amber-deep font-medium">Set a cost</Link> to see profit.</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Units sold" value={String(s.units)} icon={ShoppingBag} />
          <Stat label="Revenue" value={money(s.revenue, currency)} icon={TrendingUp} tone="green" />
          <Stat label="Orders" value={String(s.orders)} icon={ShoppingBag} />
          <Stat label="Margin" value={s.marginPct != null ? `${s.marginPct}%` : "—"} icon={TrendingUp} tone={s.marginPct != null && s.marginPct >= 0 ? "green" : "navy"} />
        </div>

        {d.topBuyers?.length > 0 && (
          <div className="dawn-card overflow-hidden">
            <p className="dawn-section-title text-sm px-4 pt-4 pb-2"><Users className="w-4 h-4 text-navy/40" /> Top buyers</p>
            {d.topBuyers.map((b: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-navy-line/40 last:border-0 text-sm">
                <span className="text-navy">{b.name} <span className="text-[12px] text-muted">×{b.units}</span></span>
                <span className="font-semibold text-navy">{money(b.spent, currency)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="dawn-card overflow-hidden">
          <p className="dawn-section-title text-sm px-4 pt-4 pb-2"><ShoppingBag className="w-4 h-4 text-navy/40" /> Orders with this item <span className="text-[12px] font-bold text-navy/40 bg-surface px-2 py-0.5 rounded-full ml-auto">{d.orders.length}</span></p>
          {d.orders.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">This item hasn&apos;t sold yet.</p>
          ) : d.orders.map((o: any, i: number) => (
            <Link key={i} href={o.contactId ? `/dashboard/contacts/${o.contactId}` : "/dashboard/orders"} className="flex items-center justify-between px-4 py-2.5 border-b border-navy-line/40 last:border-0 hover:bg-surface">
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy truncate">{o.customerName}</p>
                <p className="text-[12px] text-muted">{new Date(o.date).toLocaleDateString()} · {o.status} · ×{o.qty}</p>
              </div>
              <span className="text-sm font-semibold text-navy shrink-0">{money(o.lineTotal, currency)}</span>
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone?: string }) {
  return (
    <div className="dawn-stat">
      <Icon className="w-4 h-4 text-amber-deep mb-1" />
      <p className={`text-lg font-bold leading-none ${tone === "green" ? "text-emerald-600" : "text-navy"}`}>{value}</p>
      <p className="text-[12px] text-muted uppercase tracking-wide mt-1.5">{label}</p>
    </div>
  );
}
