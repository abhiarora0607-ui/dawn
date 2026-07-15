"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { OrderModal } from "@/components/OrderModal";
import { PaymentModal } from "@/components/SharedModals";
import { ConfirmDialog } from "@/components/Toast";
import { useSettings, money } from "@/lib/use-settings";
import { Loader2, Plus, Receipt, ShoppingBag, Search, Trash2, Truck } from "lucide-react";

const ORDER_STATUSES = ["Placed", "Processing", "Shipped", "Delivered"];
const statusStyle: Record<string, string> = {
  Placed: "bg-blue-50 text-blue-700", Processing: "bg-amber/10 text-amber-deep",
  Shipped: "bg-purple-50 text-purple-700", Delivered: "bg-emerald-50 text-emerald-700",
};

import { ToastProvider, useToast } from "@/components/Toast";

function OrdersInner() {
  const { data } = useBrief();
  const { currency } = useSettings();
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [payFor, setPayFor] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<{ id: string; status: string } | null>(null);

  async function setOrderStatus(id: string, orderStatus: string) {
    setOrders((os) => os.map((o) => o.id === id ? { ...o, order_status: orderStatus } : o));
    await fetch("/api/sales", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, orderStatus }) });
    setPendingStatus(null);
  }
  async function doDelete() {
    if (!confirmDel) return;
    await fetch(`/api/sales?id=${confirmDel}`, { method: "DELETE" });
    toast("Order deleted — linked expense removed"); setConfirmDel(null); load();
  }

  function load() {
    Promise.all([
      fetch("/api/sales").then((r) => r.json()),
      fetch("/api/sales?customers=1").then((r) => r.json()),
    ]).then(([s, c]) => {
      setOrders(s.sales || []);
      const map: Record<string, string> = {};
      for (const cust of c.customers || []) map[cust.id] = cust.name;
      setCustomers(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const filtered = orders.filter((o) => {
    const name = customers[o.contact_id] || "";
    const matchesQuery = name.toLowerCase().includes(query.toLowerCase()) || (o.items || []).some((it: any) => it.name.toLowerCase().includes(query.toLowerCase()));
    const matchesStatus = statusFilter === "All" || o.status === statusFilter.toLowerCase();
    return matchesQuery && matchesStatus;
  });

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Orders" />
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div><h1 className="font-display font-semibold text-2xl text-navy">Orders</h1><p className="text-muted text-sm mt-1">Every purchase, and a tap to create a new one.</p></div>
          <button onClick={() => setModal(true)} className="flex items-center gap-2 bg-navy text-white font-medium px-4 py-2 rounded-xl hover:bg-navy-soft transition-colors shrink-0"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">New order</span></button>
        </div>

        {!loading && orders.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 border border-navy-line rounded-xl px-3 flex-1 bg-white">
              <Search className="w-4 h-4 text-navy/40" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by customer or item…" className="flex-1 py-2.5 text-sm text-navy focus:outline-none" />
            </div>
            <div className="flex gap-1.5">
              {["All", "Paid", "Partial", "Pending"].map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`text-sm font-medium px-3 py-2 rounded-xl whitespace-nowrap ${statusFilter === s ? "bg-navy text-white" : "bg-white border border-navy-line text-muted"}`}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-navy-line p-12 text-center shadow-card">
            <div className="w-14 h-14 rounded-2xl bg-amber/15 flex items-center justify-center mx-auto mb-4"><ShoppingBag className="w-7 h-7 text-amber-deep" /></div>
            <h2 className="text-lg font-semibold text-navy mb-2">No orders yet</h2>
            <p className="text-muted text-sm max-w-sm mx-auto mb-5">Create an order for a customer or a walk-in. Prices pull from your Price List automatically.</p>
            <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 bg-navy text-white font-medium px-5 py-2.5 rounded-xl hover:bg-navy-soft"><Plus className="w-4 h-4" /> Create your first order</button>
          </div>
        ) : (
          <div className="grid gap-2">
            {filtered.map((o) => (
              <div key={o.id} className="bg-white rounded-xl border border-navy-line p-4 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy text-sm">
                      {o.contact_id ? (
                        <Link href={`/dashboard/contacts/${o.contact_id}`} className="hover:text-amber-deep hover:underline">{customers[o.contact_id] || "Customer"}</Link>
                      ) : "Walk-in"}
                      <span className="text-muted font-normal"> · {money(Number(o.total), currency)}</span>
                    </p>
                    <p className="text-xs text-muted truncate">{(o.items || []).map((it: any) => `${it.qty}× ${it.name}`).join(", ")}</p>
                    <p className="text-xs text-muted mt-0.5">{new Date(o.date).toLocaleDateString()} · {o.payment_method}{o.fixed_cost > 0 ? ` · cost ${money(Number(o.fixed_cost), currency)}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${o.status === "paid" ? "bg-emerald-50 text-emerald-700" : o.status === "partial" ? "bg-amber/10 text-amber-deep" : "bg-red-50 text-red-600"}`}>{o.status}</span>
                    <a href={`/receipt/${o.id}?owner=1`} target="_blank" className="p-1.5 text-navy/40 hover:text-navy" title="Receipt"><Receipt className="w-4 h-4" /></a>
                    <button onClick={() => setConfirmDel(o.id)} className="p-1.5 text-navy/40 hover:text-red-500" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-navy-line">
                  <Truck className="w-3.5 h-3.5 text-navy/40" />
                  <div className="flex gap-1 flex-wrap">
                    {ORDER_STATUSES.map((st) => (
                      <button key={st} onClick={() => { if ((o.order_status || "Placed") !== st) setPendingStatus({ id: o.id, status: st }); }} className={`text-[11px] font-medium px-2 py-1 rounded-lg ${(o.order_status || "Placed") === st ? statusStyle[st] : "text-navy/40 hover:bg-surface"}`}>{st}</button>
                    ))}
                  </div>
                </div>
                {Number(o.balance) > 0 && (
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-amber-deep">Balance: {money(Number(o.balance), currency)}</p>
                    <button onClick={() => setPayFor(o)} className="text-[11px] font-semibold text-white bg-amber-deep px-2.5 py-1 rounded-lg hover:opacity-90">Record payment</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {modal && <OrderModal onClose={() => setModal(false)} onDone={() => { setModal(false); load(); }} />}
      {payFor && (
        <PaymentModal
          balance={Number(payFor.balance) || 0}
          currency={currency}
          onClose={() => setPayFor(null)}
          onSubmit={async (amount, method) => {
            const res = await fetch("/api/sales", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: payFor.id, addPayment: amount, method }) });
            if (!res.ok) throw new Error();
            toast("Payment recorded");
            load();
          }}
        />
      )}
      <ConfirmDialog open={!!confirmDel} title="Delete this order?" body="This also removes its linked cost expense. Can't be undone." onConfirm={doDelete} onCancel={() => setConfirmDel(null)} />
      <ConfirmDialog open={!!pendingStatus} title="Update order status?" body={pendingStatus ? `Mark this order as "${pendingStatus.status}"?` : ""} confirmLabel="Update" onConfirm={() => pendingStatus && setOrderStatus(pendingStatus.id, pendingStatus.status)} onCancel={() => setPendingStatus(null)} />
    </DashboardShell>
  );
}

export default function Orders() {
  return <ToastProvider><OrdersInner /></ToastProvider>;
}
