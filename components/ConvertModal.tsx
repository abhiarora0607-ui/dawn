"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useSettings } from "@/lib/use-settings";
import { Loader2, X, Plus, Trash2, ShoppingBag } from "lucide-react";

type Contact = { id: string; name: string; interested_item_ids?: string[] };
type CatItem = { id: string; name: string; price: number | null; cost?: number; variants: any[] };
type LineItem = { itemId: string; name: string; qty: number; unitPrice: number; cost: number };

const METHODS = ["UPI", "bank transfer", "cash", "card", "other"];
const STATUSES = ["Paid", "Partial", "Pending"];

export function ConvertModal({ contact, onClose, onDone }: { contact: Contact; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const { currency } = useSettings();
  const [catalog, setCatalog] = useState<CatItem[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; status: string }[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [status, setStatus] = useState("Paid");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noOrder, setNoOrder] = useState(false);
  const [wonNote, setWonNote] = useState("");

  async function markWonNoOrder() {
    if (!wonNote.trim()) { toast("A reason is required.", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contact.id, stage: "Customer (Won)", wonNote: wonNote.trim(), logStage: true }),
      });
      if (res.ok) { toast(`${contact.name} marked as won`); onDone(); }
      else { const d = await res.json(); toast(d.error || "Failed", "error"); }
    } catch { toast("Network error", "error"); }
    setSaving(false);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/catalog").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json()),
    ]).then(([d, emp]) => {
      const items: CatItem[] = d.items || [];
      setCatalog(items);
      setEmployees((emp.employees || []).filter((e: any) => e.status === "active"));
      const pre = (contact.interested_item_ids || []).map((id) => items.find((i) => i.id === id)).filter(Boolean) as CatItem[];
      if (pre.length) setLines(pre.map((i) => ({ itemId: i.id, name: i.name, qty: 1, unitPrice: Number(i.price) || 0, cost: Number(i.cost) || 0 })));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [contact]);

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0));

  // Keep amountPaid synced to status
  useEffect(() => {
    if (status === "Paid") setAmountPaid(String(total));
    else if (status === "Pending") setAmountPaid("0");
  }, [status, total]);

  function addLine(itemId: string) {
    const item = catalog.find((i) => i.id === itemId);
    if (!item) return;
    setLines([...lines, { itemId: item.id, name: item.name, qty: 1, unitPrice: Number(item.price) || 0, cost: Number(item.cost) || 0 }]);
  }
  function setLine(i: number, k: string, v: any) {
    const arr = [...lines]; (arr[i] as any)[k] = v; setLines(arr);
  }
  const orderCost = lines.reduce((s, l) => s + (Number(l.cost) || 0) * l.qty, 0);

  async function save() {
    if (lines.length === 0) { toast("Add at least one item.", "error"); return; }
    if (!employeeId) { toast("Select the employee for this customer.", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id, items: lines, discount: Number(discount) || 0,
          amountPaid: Number(amountPaid) || 0, paymentMethod: status === "Pending" ? "" : method, notes,
          orderCost, employeeId: employeeId || null,
        }),
      });
      if (res.ok) { toast(`${contact.name} is now a customer`); onDone(); }
      else { const d = await res.json(); toast(d.error || "Failed", "error"); }
    } catch { toast("Network error", "error"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto animate-rise">
        <div className="sticky top-0 bg-white border-b border-navy-line px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-navy">Record sale</h3>
            <p className="text-xs text-muted">Convert {contact.name} to a customer</p>
          </div>
          <button onClick={onClose} className="btn-icon p-1.5 text-navy/40 hover:text-navy"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="py-8 flex items-center justify-center text-muted"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading your items…</div>
          ) : (
            <>
              {/* Item picker */}
              <div>
                <label className="block text-sm font-semibold text-navy mb-1.5">Add products / services</label>
                {catalog.length === 0 ? (
                  <p className="text-xs text-muted bg-surface rounded-lg p-3">No items in your Price List yet. You can still type amounts below, or add items in Price List first.</p>
                ) : (
                  <select onChange={(e) => { if (e.target.value) { addLine(e.target.value); e.target.value = ""; } }} className="inp">
                    <option value="">Select an item…</option>
                    {catalog.map((i) => <option key={i.id} value={i.id}>{i.name} — {currency}{i.price ?? 0}</option>)}
                  </select>
                )}
              </div>

              {/* Line items */}
              {lines.length > 0 && (
                <div className="space-y-2">
                  {lines.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 bg-surface rounded-xl p-2">
                      <span className="flex-1 text-sm text-navy truncate pl-1">{l.name}</span>
                      <input type="number" min="1" value={l.qty} onChange={(e) => setLine(i, "qty", Number(e.target.value))} className="w-14 inp-sm" title="Qty" />
                      <span className="text-xs text-muted">×</span>
                      <input type="number" min="0" value={l.unitPrice} onChange={(e) => setLine(i, "unitPrice", Number(e.target.value))} className="w-20 inp-sm" title="Price" />
                      <button onClick={() => setLines(lines.filter((_, x) => x !== i))} className="btn-icon p-1 text-navy/40 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              <div className="bg-navy rounded-xl p-4 text-white space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-white/60">Subtotal</span><span>{currency}{subtotal}</span></div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-white/60">Discount</span>
                  <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="w-20 bg-white/10 rounded px-2 py-1 text-right text-white text-sm focus:outline-none" />
                </div>
                <div className="flex justify-between font-semibold pt-1 border-t border-white/10"><span>Total</span><span className="text-amber">{currency}{total}</span></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">Payment status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="inp">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">Method</label>
                  <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={status === "Pending"} className="inp disabled:opacity-50 disabled:bg-surface disabled:cursor-not-allowed">{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
                </div>
              </div>

              {status === "Partial" && (
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">Amount received</label>
                  <input type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="inp" />
                  <p className="text-xs text-muted mt-1">Balance: {currency}{Math.max(0, total - (Number(amountPaid) || 0))}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-[12px] text-muted uppercase tracking-wide">Item cost</p>
                  <p className="text-sm font-semibold text-navy">{currency}{orderCost}</p>
                  <p className="text-[12px] text-muted">Auto-added to expenses</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">Handled by</label>
                  <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="inp">
                    <option value="">— None —</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              </div>

              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className="inp resize-none" />

              <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />} Record sale &amp; convert
              </button>

              {/* Escape hatch: won without an order — reason required, logged. */}
              {!noOrder ? (
                <button onClick={() => setNoOrder(true)} className="w-full text-xs text-muted hover:text-navy underline underline-offset-2">Mark as won without recording an order</button>
              ) : (
                <div className="bg-amber/5 border border-amber/30 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-navy">Winning without an order is unusual — add the reason (e.g. "paid offline last month", "barter deal"). It's saved to the timeline.</p>
                  <textarea autoFocus value={wonNote} onChange={(e) => setWonNote(e.target.value)} rows={2} placeholder="Reason (required)" className="inp resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => { setNoOrder(false); setWonNote(""); }} className="flex-1 border border-navy-line text-navy text-sm font-medium py-2 rounded-xl">Back</button>
                    <button onClick={markWonNoOrder} disabled={saving} className="flex-1 bg-emerald-600 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-60">Mark won</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <style jsx>{`
          .inp{width:100%;padding:0.6rem 0.75rem;border:1px solid #E4E8F0;border-radius:0.75rem;font-size:0.875rem;color:#16233F;outline:none;background:#fff}
          .inp:focus{border-color:#FF9E43}
          .inp-sm{padding:0.4rem 0.5rem;border:1px solid #E4E8F0;border-radius:0.5rem;font-size:0.8125rem;color:#16233F;outline:none;text-align:center}
        `}</style>
      </div>
    </div>
  );
}
