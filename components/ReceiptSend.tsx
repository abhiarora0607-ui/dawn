"use client";

import { useEffect, useState } from "react";

type Employee = { id: string; name: string; status: string };

export function ReceiptSend({ receiptUrl, customerName, customerPhone, total, currency }: {
  receiptUrl: string; customerName: string; customerPhone: string; total: string; currency: string;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");

  useEffect(() => {
    fetch("/api/employees").then((r) => r.json()).then((d) => setEmployees((d.employees || []).filter((e: any) => e.status === "active"))).catch(() => {});
  }, []);

  const empName = employees.find((e) => e.id === employeeId)?.name;
  const msg = `Hi ${customerName || ""}! Here's your receipt for ${currency}${total}${empName ? ` (served by ${empName})` : ""}: ${receiptUrl}`.trim();
  const wa = (customerPhone || "").replace(/[^0-9]/g, "");

  const btn = "flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl transition-colors";

  return (
    <div className="noprint mt-4 bg-white rounded-2xl border border-navy-line p-4">
      <p className="text-sm font-semibold text-navy mb-3">Send receipt to customer</p>

      {employees.length > 0 && (
        <div className="mb-3">
          <label className="block text-xs font-semibold text-muted mb-1.5">Sent by (employee)</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber">
            <option value="">— Select —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <a href={wa ? `https://wa.me/${wa}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" className={`${btn} bg-emerald-500 text-white hover:bg-emerald-600`}>WhatsApp</a>
        <a href={`sms:${customerPhone || ""}?&body=${encodeURIComponent(msg)}`} className={`${btn} bg-blue-500 text-white hover:bg-blue-600`}>SMS</a>
        <a href={`mailto:?subject=${encodeURIComponent("Your receipt")}&body=${encodeURIComponent(msg)}`} className={`${btn} bg-navy text-white hover:bg-navy-soft`}>Email</a>
        <button onClick={() => { navigator.clipboard.writeText(msg); alert("Message copied — paste into Instagram DM"); }} className={`${btn} bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90`}>Instagram</button>
      </div>
      <p className="text-[12px] text-muted mt-2">Instagram doesn&apos;t allow direct links from web — we copy the message so you can paste it into the DM.</p>
    </div>
  );
}
