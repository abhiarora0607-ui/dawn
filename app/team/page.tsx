"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DawnLogo } from "@/components/DawnLogo";
import { Loader2, Users, ShoppingBag, LogOut, Phone, MessageCircle, TrendingUp } from "lucide-react";

export default function TeamDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"leads" | "customers" | "orders">("leads");

  useEffect(() => {
    fetch("/api/team/data").then((r) => { if (r.status === 401) { router.push("/team-login"); return null; } return r.json(); })
      .then((d) => { if (d) setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch("/api/employee-login", { method: "DELETE" });
    router.push("/team-login");
  }

  if (loading) return <div className="min-h-screen bg-surface flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/40" /></div>;
  if (!data) return null;

  const perms: string[] = data.me?.permissions || [];
  const can = (p: string) => perms.includes(p);
  const s = data.stats || {};

  const tabs = [
    can("leads") && { id: "leads", label: "Leads", icon: Users },
    can("customers") && { id: "customers", label: "Customers", icon: Users },
    can("orders") && { id: "orders", label: "Orders", icon: ShoppingBag },
  ].filter(Boolean) as any[];

  const list = tab === "orders" ? (data.orders || []) : (data[tab] || []);

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-navy-line sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <DawnLogo className="h-8" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-navy/60">Hi, {data.me?.name || "there"}</span>
            <button onClick={logout} className="p-2 text-navy/40 hover:text-navy" title="Sign out"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {can("dashboard") && (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="My leads" value={s.leads ?? 0} icon={Users} />
            <Stat label="My customers" value={s.customers ?? 0} icon={Users} />
            <Stat label="My orders" value={s.orders ?? 0} icon={ShoppingBag} />
          </div>
        )}
        {s.revenue != null && (
          <div className="bg-navy rounded-2xl p-5 text-white flex items-center justify-between">
            <div><p className="text-xs text-white/50 uppercase tracking-wide">My collected revenue</p><p className="text-2xl font-bold text-amber">₹{s.revenue}</p></div>
            <TrendingUp className="w-8 h-8 text-white/20" />
          </div>
        )}

        {tabs.length > 0 && (
          <div className="flex gap-2 bg-white p-1 rounded-xl border border-navy-line w-fit">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${tab === t.id ? "bg-navy text-white" : "text-muted"}`}>{t.label}</button>
            ))}
          </div>
        )}

        <div className="grid gap-2">
          {list.length === 0 ? (
            <div className="bg-white rounded-2xl border border-navy-line p-10 text-center text-muted text-sm">Nothing assigned to you here yet.</div>
          ) : tab === "orders" ? (
            list.map((o: any) => (
              <div key={o.id} className="bg-white rounded-xl border border-navy-line p-4 shadow-card flex items-center justify-between">
                <div><p className="font-semibold text-navy text-sm">₹{o.total} <span className="text-xs font-normal text-muted">· {(o.items || []).length} item(s)</span></p><p className="text-xs text-muted">{new Date(o.date).toLocaleDateString()} · {o.order_status || "Placed"}</p></div>
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${o.status === "paid" ? "bg-emerald-50 text-emerald-700" : o.status === "partial" ? "bg-amber/10 text-amber-deep" : "bg-red-50 text-red-600"}`}>{o.status}</span>
              </div>
            ))
          ) : (
            list.map((c: any) => {
              const wa = (c.phone || "").replace(/[^0-9]/g, "");
              return (
                <div key={c.id} className="bg-white rounded-xl border border-navy-line p-4 shadow-card flex items-center justify-between">
                  <div className="min-w-0"><p className="font-semibold text-navy text-sm">{c.name}</p><p className="text-xs text-muted">{c.phone || (c.instagram_handle ? "@" + c.instagram_handle : c.source)} · {c.stage}</p></div>
                  <div className="flex items-center gap-1 shrink-0">
                    {wa && <a href={`https://wa.me/${wa}`} target="_blank" className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"><MessageCircle className="w-4 h-4" /></a>}
                    {c.phone && <a href={`tel:${c.phone}`} className="p-2 text-navy/50 hover:bg-navy/5 rounded-lg"><Phone className="w-4 h-4" /></a>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-line p-4 shadow-card">
      <Icon className="w-4 h-4 text-amber-deep mb-1" />
      <p className="text-xl font-bold text-navy">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
