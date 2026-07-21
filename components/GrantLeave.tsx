"use client";

// Giving someone leave.
//
// A long shift covered, a goodwill day, a correction after something went
// wrong. Admin only — gifting leave is compensation, and a lead who could
// grant it could grant it to themselves.
//
// The reason field is not optional in spirit even though it is in code: a
// balance that changed with no explanation is what surfaces months later in
// an argument nobody can settle.

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Loader2, Gift, X } from "lucide-react";

const TYPES = [
  ["casual", "Casual"], ["earned", "Earned"], ["sick", "Sick"],
  ["bereavement", "Bereavement"], ["birthday", "Birthday"], ["marriage", "Marriage"],
  ["maternity", "Maternity"], ["paternity", "Paternity"], ["unpaid", "Unpaid"],
];

export function GrantLeave({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const { toast } = useToast();
  const [people, setPeople] = useState<any[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [code, setCode] = useState("casual");
  const [days, setDays] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/org").then((r) => r.json())
      .then((d) => setPeople(d.nodes || [])).catch(() => {});
  }, []);

  async function submit() {
    if (!employeeId || !(Number(days) > 0)) return;
    setBusy(true);
    const res = await fetch("/api/leave", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "grant", employeeId, code, days: Number(days), reason }),
    });
    const out = await res.json();
    setBusy(false);
    if (out.ok) { toast(out.note || "Added"); onDone?.(); onClose(); }
    else toast(out.error || "Couldn't add that", "error");
  }

  // Encashable types turn into money later, so say so at the point of giving
  // rather than letting it surface on a payslip.
  const costsMoney = ["earned", "casual"].includes(code);

  return (
    <div className="dawn-scrim z-50" onClick={onClose}>
      <div className="dawn-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="font-semibold text-navy flex items-center gap-1.5">
            <Gift className="w-4 h-4 text-amber-deep" /> Give leave
          </p>
          <button onClick={onClose} className="btn-icon" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="t-label block mb-1">Who</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="inp">
              <option value="">Choose someone</option>
              {people.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="t-label block mb-1">Type</label>
              <select value={code} onChange={(e) => setCode(e.target.value)} className="inp">
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="t-label block mb-1">Days</label>
              <input type="number" step="0.5" min="0.5" value={days}
                onChange={(e) => setDays(e.target.value)} className="inp" />
            </div>
          </div>

          <div>
            <label className="t-label block mb-1">Why</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Covered the Diwali weekend" className="inp" />
            <p className="t-micro text-muted mt-1">
              Recorded against the grant, so the balance can be explained later.
            </p>
          </div>

          {costsMoney && (
            <p className="t-micro text-amber-deep">
              This type can be encashed — giving days here may become a payment later.
            </p>
          )}

          <button onClick={submit} disabled={busy || !employeeId || !(Number(days) > 0)}
            className="btn btn-primary w-full">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
            Add {Number(days) > 0 ? `${days} ${Number(days) === 1 ? "day" : "days"}` : "leave"}
          </button>
        </div>
      </div>
    </div>
  );
}
