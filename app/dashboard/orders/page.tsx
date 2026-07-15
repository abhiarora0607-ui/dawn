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
import { Loader2, Plus, Receipt, ShoppingBag, Search, Trash2, Truck, Ban, X } from "lucide-react";

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
  const [cancelFor, setCancelFor] = useState<any>(null);
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
            {filtered.map((o) => {
              const cancelled = o.order_status === "Cancelled";
              return (
              <div key={o.id} className={`bg-white rounded-xl border p-4 shadow-card ${cancelled ? "border-navy-line/60 opacity-70" : "border-navy-line"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`font-semibold text-navy text-sm ${cancelled ? "line-through" : ""}`}>
                      {o.contact_id ? (
                        <Link href={`/dashboard/contacts/${o.contact_id}`} className="hover:text-amber-deep hover:underline">{customers[o.contact_id] || "Customer"}</Link>
                      ) : "Walk-in"}
                      <span className="text-muted font-normal"> · {money(Number(o.total), currency)}</span>
                    </p>
                    <p className="text-xs text-muted truncate">{(o.items || []).map((it: any) => `${it.qty}× ${it.name}`).join(", ")}</p>
                    <p className="text-xs text-muted mt-0.5">{new Date(o.date).toLocaleDateString()} · {o.payment_method}{o.fixed_cost > 0 ? ` · cost ${money(Number(o.fixed_cost), currency)}` : ""}</p>
                    {cancelled && o.cancel_reason && <p className="text-xs text-red-500 mt-1">Cancelled — {o.cancel_reason}{o.payment_disposition && o.payment_disposition !== "none" ? ` (payment ${o.payment_disposition})` : ""}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${cancelled ? "bg-navy/10 text-navy/50" : o.status === "paid" ? "bg-emerald-50 text-emerald-700" : o.status === "partial" ? "bg-amber/10 text-amber-deep" : "bg-red-50 text-red-600"}`}>{cancelled ? "Cancelled" : o.status}</span>
                    <a href={`/receipt/${o.share_token || o.id}?owner=1`} target="_blank" className="p-1.5 text-navy/40 hover:text-navy" title="Receipt"><Receipt className="w-4 h-4" /></a>
                    {!cancelled && <button onClick={() => setCancelFor(o)} className="p-1.5 text-navy/40 hover:text-amber-deep" title="Cancel order"><Ban className="w-4 h-4" /></button>}
                    <button onClick={() => setConfirmDel(o.id)} className="p-1.5 text-navy/40 hover:text-red-500" title="Delete permanently"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {!cancelled && <>
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
                </>}
              </div>
              );
            })}
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
      {cancelFor && <CancelOrderModal order={cancelFor} currency={currency} onClose={() => setCancelFor(null)} onDone={() => { setCancelFor(null); toast("Order cancelled"); load(); }} />}
      <ConfirmDialog open={!!confirmDel} title="Delete this order permanently?" body="Delete erases the order and its cost expense with no record. To keep a record, use Cancel instead. Can't be undone." confirmLabel="Delete" onConfirm={doDelete} onCancel={() => setConfirmDel(null)} />
      <ConfirmDialog open={!!pendingStatus} title="Update order status?" body={pendingStatus ? `Mark this order as "${pendingStatus.status}"?` : ""} confirmLabel="Update" onConfirm={() => pendingStatus && setOrderStatus(pendingStatus.id, pendingStatus.status)} onCancel={() => setPendingStatus(null)} />
    </DashboardShell>
  );
}

export default function Orders() {
  return <ToastProvider><OrdersInner /></ToastProvider>;
}

function CancelOrderModal({ order, currency, onClose, onDone }: { order: any; currency: string; onClose: () => void; onDone: () => void }) {
  const paid = Number(order.amount_paid) || 0;
  const [reason, setReason] = useState("");
  const [disposition, setDisposition] = useState<"refunded" | "retained" | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (!reason.trim()) { setErr("A reason is required."); return; }
    if (paid > 0 && !disposition) { setErr("Choose what happened to the payment."); return; }
    setBusy(true);
    const res = await fetch("/api/sales", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: order.id, cancel: true, cancelReason: reason.trim(), disposition: disposition || undefined }),
    });
    if (res.ok) onDone();
    else { const d = await res.json().catch(() => ({})); setErr(d.error || "Couldn't cancel."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-5 animate-rise max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-navy flex items-center gap-1.5"><Ban className="w-4 h-4 text-amber-deep" /> Cancel order</h3>
          <button onClick={onClose} className="p-1.5 text-navy/40"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-muted mb-3">The order stays on record, marked cancelled. Its cost is reversed and it leaves your revenue and reports.</p>

        <textarea autoFocus value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} rows={2} placeholder="Why is this being cancelled? (required)" className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber resize-none" />

        {paid > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-navy mb-2">{currency}{paid} was already paid. What happened to it?</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setDisposition("refunded"); setErr(""); }} className={`text-xs font-medium py-2.5 rounded-xl border ${disposition === "refunded" ? "border-amber bg-amber/5 text-navy" : "border-navy-line text-navy/60"}`}>Refunded<br /><span className="text-[10px] font-normal">money returned</span></button>
              <button onClick={() => { setDisposition("retained"); setErr(""); }} className={`text-xs font-medium py-2.5 rounded-xl border ${disposition === "retained" ? "border-amber bg-amber/5 text-navy" : "border-navy-line text-navy/60"}`}>Retained<br /><span className="text-[10px] font-normal">kept as credit</span></button>
            </div>
            <p className="text-[11px] text-muted mt-1.5">{disposition === "refunded" ? "A refund expense will be logged and revenue reduced." : disposition === "retained" ? "The payment stays counted as revenue." : ""}</p>
          </div>
        )}

        {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 border border-navy-line text-navy font-medium py-2.5 rounded-xl hover:bg-surface">Keep order</button>
          <button onClick={submit} disabled={busy} className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white font-medium py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Cancel order
          </button>
        </div>
      </div>
    </div>
  );
}
