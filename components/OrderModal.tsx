"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useSettings } from "@/lib/use-settings";
import { Loader2, X, Trash2, ShoppingBag, Search, UserPlus } from "lucide-react";

type CatItem = { id: string; name: string; price: number | null; cost?: number };
type LineItem = { itemId: string; name: string; qty: number; unitPrice: number; cost: number };
type Customer = { id: string; name: string; phone: string; stage: string; employee_id?: string };

const METHODS = ["UPI", "bank transfer", "cash", "card", "other"];
const STATUSES = ["Paid", "Partial", "Pending"];

// contact: pre-selected customer (from profile). If null, user picks/creates one.
export function OrderModal({ contact, onClose, onDone }: { contact?: Customer | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const { currency } = useSettings();
  const [catalog, setCatalog] = useState<CatItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; status: string }[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [selected, setSelected] = useState<Customer | null>(contact || null);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [custMode, setCustMode] = useState<"existing" | "walkin">(contact ? "existing" : "existing");
  const [custSearch, setCustSearch] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [status, setStatus] = useState("Paid");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/catalog").then((r) => r.json()),
      fetch("/api/sales?customers=1").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json()),
    ]).then(([cat, cust, emp]) => {
      setCatalog(cat.items || []);
      setCustomers(cust.customers || []);
      const active = (emp.employees || []).filter((e: any) => e.status === "active");
      setEmployees(active);
      if (active[0]) setEmployeeId((prev: string) => prev || active[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0));
  useEffect(() => { if (status === "Paid") setAmountPaid(String(total)); else if (status === "Pending") setAmountPaid("0"); }, [status, total]);

  // Auto-fill employee from the chosen customer (editable). Only when empty.
  useEffect(() => {
    if (selected?.employee_id && !employeeId) setEmployeeId(selected.employee_id);
  }, [selected]);

  function addLine(itemId: string) {
    const item = catalog.find((i) => i.id === itemId); if (!item) return;
    setLines([...lines, { itemId: item.id, name: item.name, qty: 1, unitPrice: Number(item.price) || 0, cost: Number(item.cost) || 0 }]);
  }
  function setLine(i: number, k: string, v: any) { const arr = [...lines]; (arr[i] as any)[k] = v; setLines(arr); }

  const orderCost = lines.reduce((s, l) => s + (Number(l.cost) || 0) * l.qty, 0);

  async function save() {
    if (custMode === "existing" && !selected) { toast("Pick a customer.", "error"); return; }
    if (custMode === "walkin" && !walkInName.trim()) { toast("Enter a name.", "error"); return; }
    if (lines.length === 0) { toast("Add at least one item.", "error"); return; }
    setSaving(true);
    try {
      const body: any = {
        items: lines, discount: Number(discount) || 0, amountPaid: Number(amountPaid) || 0,
        paymentMethod: status === "Pending" ? "" : method, notes, orderCost, employeeId: employeeId || null,
      };
      if (custMode === "existing") body.contactId = selected!.id;
      else { body.customerName = walkInName.trim(); body.customerPhone = walkInPhone; }
      const res = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { toast("Order created"); onDone(); }
      else { const d = await res.json(); toast(d.error || "Failed", "error"); }
    } catch { toast("Network error", "error"); }
    setSaving(false);
  }

  const filteredCust = customers.filter((c) => c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone || "").includes(custSearch));

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto animate-rise">
        <div className="sticky top-0 bg-white border-b border-navy-line px-5 py-4 flex items-center justify-between">
          <h3 className="font-semibold text-navy">New order</h3>
          <button onClick={onClose} className="p-1.5 text-navy/40 hover:text-navy"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="py-8 flex items-center justify-center text-muted"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          ) : (
            <>
              {/* Customer selection (hidden if pre-selected) */}
              {!contact && (
                <div>
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => setCustMode("existing")} className={`flex-1 text-sm font-medium py-2 rounded-lg border ${custMode === "existing" ? "border-amber bg-amber/5 text-navy" : "border-navy-line text-muted"}`}>Existing customer</button>
                    <button onClick={() => setCustMode("walkin")} className={`flex-1 text-sm font-medium py-2 rounded-lg border ${custMode === "walkin" ? "border-amber bg-amber/5 text-navy" : "border-navy-line text-muted"}`}>Walk-in</button>
                  </div>
                  {custMode === "existing" ? (
                    <div>
                      {selected ? (
                        <div className="flex items-center justify-between bg-surface rounded-xl p-3">
                          <span className="text-sm font-medium text-navy">{selected.name} {selected.phone ? `· ${selected.phone}` : ""}</span>
                          <button onClick={() => setSelected(null)} className="text-xs text-amber-deep">Change</button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2 border border-navy-line rounded-xl px-3 mb-2">
                            <Search className="w-4 h-4 text-navy/40" />
                            <input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Search customers…" className="flex-1 py-2.5 text-sm text-navy focus:outline-none" />
                          </div>
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {filteredCust.length === 0 ? <p className="text-xs text-muted p-2">No contacts. Use Walk-in, or add a contact first.</p> :
                              filteredCust.map((c) => (
                                <button key={c.id} onClick={() => setSelected(c)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface text-sm text-navy flex items-center justify-between">
                                  <span>{c.name}</span>
                                  <span className="text-xs text-muted">{c.stage === "Customer (Won)" ? "Customer" : c.stage}</span>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="Customer name *" className="inp" />
                      <input value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} placeholder="Phone (optional)" className="inp" />
                    </div>
                  )}
                </div>
              )}
              {contact && <div className="bg-surface rounded-xl p-3 text-sm font-medium text-navy">Order for {contact.name}</div>}

              {/* Items */}
              <div>
                <label className="block text-sm font-semibold text-navy mb-1.5">Items</label>
                {catalog.length === 0 ? (
                  <p className="text-xs text-muted bg-surface rounded-lg p-3">No items in your Price List yet. Add items there first for auto-pricing.</p>
                ) : (
                  <select onChange={(e) => { if (e.target.value) { addLine(e.target.value); e.target.value = ""; } }} className="inp">
                    <option value="">Add an item…</option>
                    {catalog.map((i) => <option key={i.id} value={i.id}>{i.name} — {currency}{i.price ?? 0}</option>)}
                  </select>
                )}
              </div>

              {lines.length > 0 && (
                <div className="space-y-2">
                  {lines.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 bg-surface rounded-xl p-2">
                      <span className="flex-1 text-sm text-navy truncate pl-1">{l.name}</span>
                      <input type="number" min="1" value={l.qty} onChange={(e) => setLine(i, "qty", Number(e.target.value))} className="w-14 inp-sm" />
                      <span className="text-xs text-muted">×</span>
                      <input type="number" min="0" value={l.unitPrice} onChange={(e) => setLine(i, "unitPrice", Number(e.target.value))} className="w-20 inp-sm" />
                      <button onClick={() => setLines(lines.filter((_, x) => x !== i))} className="p-1 text-navy/40 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-navy rounded-xl p-4 text-white space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-white/60">Subtotal</span><span>{currency}{subtotal}</span></div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-white/60">Discount</span>
                  <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="w-20 bg-white/10 rounded px-2 py-1 text-right text-white text-sm focus:outline-none" />
                </div>
                <div className="flex justify-between font-semibold pt-1 border-t border-white/10"><span>Total</span><span className="text-amber">{currency}{total}</span></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-semibold text-navy mb-1.5">Status</label><select value={status} onChange={(e) => setStatus(e.target.value)} className="inp">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
                <div><label className="block text-sm font-semibold text-navy mb-1.5">Method</label><select value={method} onChange={(e) => setMethod(e.target.value)} disabled={status === "Pending"} className="inp disabled:opacity-50 disabled:bg-surface disabled:cursor-not-allowed">{METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
              </div>
              {status === "Partial" && (
                <div><label className="block text-sm font-semibold text-navy mb-1.5">Amount received</label><input type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="inp" /><p className="text-xs text-muted mt-1">Balance: {currency}{Math.max(0, total - (Number(amountPaid) || 0))}</p></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-[11px] text-muted uppercase tracking-wide">Item cost</p>
                  <p className="text-sm font-semibold text-navy">{currency}{orderCost}</p>
                  <p className="text-[11px] text-muted">Auto-added to expenses</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">Handled by *</label>
                  <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="inp">
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              </div>

              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className="inp resize-none" />

              <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />} Create order
              </button>
            </>
          )}
        </div>
        <style jsx>{`.inp{width:100%;padding:0.6rem 0.75rem;border:1px solid #E4E8F0;border-radius:0.75rem;font-size:0.875rem;color:#16233F;outline:none;background:#fff}.inp:focus{border-color:#FF9E43}.inp-sm{padding:0.4rem 0.5rem;border:1px solid #E4E8F0;border-radius:0.5rem;font-size:0.8125rem;color:#16233F;outline:none;text-align:center}`}</style>
      </div>
    </div>
  );
}
