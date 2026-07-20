"use client";

// Shared small modals used across admin + employee portals:
//  - LostDialog: marking a lead "Lost" always requires a reason note.
//  - PaymentModal: record a payment against an order's balance.

import { useState } from "react";
import { X, Loader2, IndianRupee } from "lucide-react";

export function LostDialog({ name, onConfirm, onCancel }: { name: string; onConfirm: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-5 animate-rise">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-navy">Mark {name} as Lost?</h3>
          <button onClick={onCancel} className="btn-icon p-1.5 text-navy/40"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-muted mb-3">A short reason is required — it helps you spot patterns in why leads drop off.</p>
        <textarea autoFocus value={note} onChange={(e) => { setNote(e.target.value); setErr(""); }} rows={3} placeholder="Why was this lead lost? (required)" className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber resize-none" />
        {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 border border-navy-line text-navy font-medium py-2.5 rounded-xl hover:bg-surface">Cancel</button>
          <button onClick={() => { if (!note.trim()) { setErr("Please add a reason."); return; } onConfirm(note.trim()); }} className="flex-1 bg-red-600 text-white font-medium py-2.5 rounded-xl hover:bg-red-700">Mark Lost</button>
        </div>
      </div>
    </div>
  );
}

export function WonDialog({ name, onConfirm, onCancel }: { name: string; onConfirm: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-5 animate-rise">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-navy">Mark {name} as won?</h3>
          <button onClick={onCancel} className="btn-icon p-1.5 text-navy/40"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-muted mb-3">The normal way to win a customer is recording their first order — that moves them automatically. To mark won <span className="font-medium text-navy">without</span> an order, a reason is required.</p>
        <textarea autoFocus value={note} onChange={(e) => { setNote(e.target.value); setErr(""); }} rows={3} placeholder="Why won without an order? (required)" className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber resize-none" />
        {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 border border-navy-line text-navy font-medium py-2.5 rounded-xl hover:bg-surface">Cancel</button>
          <button onClick={() => { if (!note.trim()) { setErr("Please add a reason."); return; } onConfirm(note.trim()); }} className="flex-1 bg-emerald-600 text-white font-medium py-2.5 rounded-xl hover:bg-emerald-700">Mark won</button>
        </div>
      </div>
    </div>
  );
}

const METHODS = ["cash", "upi", "card", "bank transfer", "other"];

export function PaymentModal({ balance, currency = "₹", onSubmit, onClose }: { balance: number; currency?: string; onSubmit: (amount: number, method: string) => Promise<void>; onClose: () => void }) {
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    const n = Number(amount);
    if (!n || n <= 0) { setErr("Enter a valid amount."); return; }
    if (n > balance + 0.001) { setErr(`Can't exceed the balance of ${currency}${balance}.`); return; }
    setBusy(true);
    try { await onSubmit(n, method); onClose(); } catch { setErr("Failed to record payment."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-5 animate-rise">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-navy flex items-center gap-1.5"><IndianRupee className="w-4 h-4 text-amber-deep" /> Record payment</h3>
          <button onClick={onClose} className="btn-icon p-1.5 text-navy/40"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-muted mb-3">Balance due: <span className="font-semibold text-navy">{currency}{balance}</span></p>
        <div className="space-y-3">
          <input type="number" min="1" value={amount} onChange={(e) => { setAmount(e.target.value); setErr(""); }} placeholder="Amount received" className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber">
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button onClick={save} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Record payment
          </button>
        </div>
      </div>
    </div>
  );
}
