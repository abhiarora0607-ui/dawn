"use client";

// Expense claims, employee side (V53).
//
// Submit a claim, watch its journey. Deciding doesn't happen here — that's
// the Inbox (V52), because one queue for every decision beats five scattered
// ones. Submitting writes only a pending claim; the amount reaches the books
// the moment finance approves, and not a moment before.

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { Loader2, ReceiptText, Plus, Camera } from "lucide-react";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber/15 text-amber-deep",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
};

export function TeamExpenses() {
  const state = useApi<any>("/api/team/expense");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Travel");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  function onPickReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true); setMsg("");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/upload", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: reader.result }),
        });
        const out = await res.json();
        if (out.url) setReceiptUrl(out.url);
        else setMsg(out.error || "Couldn't upload that photo.");
      } catch { setMsg("Couldn't upload that photo."); }
      setUploading(false);
    };
    reader.onerror = () => { setUploading(false); setMsg("Couldn't read that photo."); };
    reader.readAsDataURL(file);
  }

  async function submit() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/team/expense", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", amount: Number(amount), category, expenseDate, note, receiptUrl }),
    });
    const out = await res.json();
    setBusy(false);
    if (out.ok) {
      setMsg(out.note || "Sent."); setOpen(false);
      setAmount(""); setNote(""); setReceiptUrl("");
      state.retry();
    } else setMsg(out.error || "Couldn't send that");
  }

  if (state.loading) return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>;
  if (state.error) {
    return (
      <div className="dawn-card p-6 text-center">
        <p className="t-small text-muted">{state.error}</p>
        <button onClick={state.retry} className="btn btn-quiet btn-sm mt-3">Try again</button>
      </div>
    );
  }
  const d = state.data;
  if (!d) return null;
  const cats: string[] = d.categories || ["Travel", "Food", "Supplies", "Client", "Other"];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy flex items-center gap-2">
            <ReceiptText className="w-6 h-6 text-amber-deep" /> Expenses
          </h1>
          <p className="text-muted text-sm mt-1">Claim what you spent for work. Finance approves; approved claims go straight into the books.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn btn-primary btn-sm shrink-0"><Plus className="w-4 h-4" /> New claim</button>
      </div>

      {msg && <p className="t-small text-navy bg-surface border border-navy-line rounded-xl px-3 py-2">{msg}</p>}

      <div className="space-y-2">
        {(d.mine || []).length === 0 && (
          <div className="dawn-card p-8 text-center">
            <ReceiptText className="w-8 h-8 text-navy/20 mx-auto mb-2" />
            <p className="t-small text-muted">No claims yet. Spent something for work — an auto to a client, supplies for the shop? Claim it here.</p>
          </div>
        )}
        {(d.mine || []).map((r: any) => (
          <div key={r.id} className="dawn-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-navy">₹{Number(r.amount).toLocaleString("en-IN")} · {r.category}</p>
              <span className={`t-micro px-2 py-0.5 rounded-full shrink-0 ${STATUS_TONE[r.status] || STATUS_TONE.pending}`}>{r.status}</span>
            </div>
            <p className="t-small text-muted mt-0.5">{[r.expense_date, r.note].filter(Boolean).join(" · ")}</p>
            {r.status === "pending" && <p className="t-micro text-muted mt-1">Waiting with Finance.</p>}
            {r.status === "rejected" && r.decision_note && <p className="t-micro text-red-600 mt-1">{r.decision_note}</p>}
          </div>
        ))}
      </div>

      {open && (
        <div className="dawn-scrim z-50" onClick={() => setOpen(false)}>
          <div className="dawn-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-navy">New expense claim</p>
            <p className="t-small text-muted mt-1">It goes to finance for approval — the books only change once they sign off.</p>
            <label className="t-label block mt-3 mb-1">Amount</label>
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="inp" placeholder="850" />
            <label className="t-label block mt-3 mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="inp">
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="t-label block mt-3 mb-1">Date</label>
            <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="inp" />
            <label className="t-label block mt-3 mb-1">What was it for?</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="inp" placeholder="Auto to the client meeting" />
            <label className="t-label block mt-3 mb-1">Receipt (optional)</label>
            {receiptUrl ? (
              <div className="flex items-center gap-2">
                <a href={receiptUrl} target="_blank" className="t-small text-amber-deep underline truncate flex-1">Photo attached — view</a>
                <button onClick={() => setReceiptUrl("")} className="btn btn-quiet btn-sm shrink-0">Remove</button>
              </div>
            ) : (
              <label className="btn btn-quiet btn-sm w-full cursor-pointer">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Camera className="w-4 h-4" /> Attach a photo</>}
                <input type="file" accept="image/*" className="hidden" onChange={onPickReceipt} disabled={uploading} />
              </label>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={submit} disabled={busy || uploading || !(Number(amount) > 0)} className="btn btn-primary btn-sm flex-1">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send to finance"}
              </button>
              <button onClick={() => setOpen(false)} disabled={busy} className="btn btn-quiet btn-sm flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
