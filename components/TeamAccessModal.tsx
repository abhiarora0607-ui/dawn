"use client";

import { useEffect, useState } from "react";
import { useToast, ConfirmDialog } from "@/components/Toast";
import { Loader2, X, KeyRound, Copy, Check, Shield } from "lucide-react";

const ALL_PERMISSIONS = [
  "dashboard", "leads", "customers", "orders",
  "edit_leads", "edit_customers", "edit_orders",
  "messaging", "tasks", "calendar", "notes",
  "reports", "data_export", "financials", "settings",
];
const LABELS: Record<string, string> = {
  dashboard: "Dashboard", leads: "Leads", customers: "Customers", orders: "Orders",
  edit_leads: "Edit leads", edit_customers: "Edit customers", edit_orders: "Edit orders & payments",
  messaging: "Messaging", tasks: "Tasks", calendar: "Calendar", notes: "Notes",
  reports: "My reports", data_export: "Data export", financials: "Financial info", settings: "Profile & settings",
};
const DEFAULTS = ["dashboard", "leads", "customers", "orders", "tasks", "calendar", "notes", "settings"];

export function TeamAccessModal({ employee, onClose }: { employee: { id: string; name: string }; onClose: () => void }) {
  const { toast } = useToast();
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [perms, setPerms] = useState<string[]>(DEFAULTS);
  const [loginId, setLoginId] = useState("");
  const [creds, setCreds] = useState<{ loginId: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  function load() {
    fetch("/api/employee-accounts").then((r) => r.json()).then((d) => {
      const acc = (d.accounts || []).find((a: any) => a.employee_id === employee.id);
      setAccount(acc || null);
      if (acc) { setPerms(acc.permissions || DEFAULTS); setLoginId(acc.login_id); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, [employee.id]);

  function togglePerm(p: string) {
    setPerms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);
  }

  async function createLogin() {
    setBusy(true);
    try {
      const res = await fetch("/api/employee-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: employee.id, permissions: perms }) });
      const d = await res.json();
      if (res.ok) { setCreds({ loginId: d.loginId, password: d.tempPassword }); toast("Login created"); load(); }
      else toast(d.error || "Failed", "error");
    } catch { toast("Network error", "error"); }
    setBusy(false);
  }

  async function savePermissions() {
    setBusy(true);
    try {
      const res = await fetch("/api/employee-accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id, permissions: perms, loginId }) });
      if (res.ok) { toast("Saved"); load(); } else { const d = await res.json(); toast(d.error || "Failed", "error"); }
    } catch { toast("Network error", "error"); }
    setBusy(false);
  }

  async function resetPassword() {
    setBusy(true);
    try {
      const res = await fetch("/api/employee-accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id, resetPassword: true }) });
      const d = await res.json();
      if (res.ok) { setCreds({ loginId: account.login_id, password: d.tempPassword }); toast("Password reset"); }
      else toast(d.error || "Failed", "error");
    } catch { toast("Network error", "error"); }
    setBusy(false);
  }

  async function toggleActive() {
    await fetch("/api/employee-accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id, active: !account.active }) });
    toast(account.active ? "Login disabled" : "Login enabled"); load();
  }

  async function removeLogin() {
    setConfirmRemove(false);
    await fetch(`/api/employee-accounts?id=${account.id}`, { method: "DELETE" });
    toast("Login removed"); setAccount(null); setCreds(null); load();
  }

  const shareText = creds ? `Dawn team login\nURL: ${typeof window !== "undefined" ? window.location.origin : ""}/team-login\nLogin ID: ${creds.loginId}\nPassword: ${creds.password}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto animate-rise">
        <div className="sticky top-0 bg-white border-b border-navy-line px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-amber-deep" /><h3 className="font-semibold text-navy">Login access — {employee.name}</h3></div>
          <button aria-label="Close" onClick={onClose} className="btn-icon p-1.5 text-navy/40 hover:text-navy"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="py-8 flex justify-center text-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <>
              {creds && (
                <div className="bg-amber/10 border border-amber/30 rounded-xl p-4">
                  <p className="text-sm font-semibold text-navy mb-2">Share these with {employee.name} — the password won&apos;t be shown again</p>
                  <div className="text-sm text-navy space-y-0.5 font-mono">
                    <p>URL: /team-login</p>
                    <p>Login ID: {creds.loginId}</p>
                    <p>Password: {creds.password}</p>
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-amber-deep">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy all"}
                  </button>
                </div>
              )}

              {!account ? (
                <>
                  <p className="text-sm text-muted">Create a login so {employee.name} can sign in at <span className="font-medium text-navy">/team-login</span> and see only their assigned work.</p>
                  <PermissionGrid perms={perms} toggle={togglePerm} />
                  <button onClick={createLogin} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-60">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Create login
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">Login ID</label>
                    <input value={loginId} onChange={(e) => setLoginId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
                  </div>
                  <PermissionGrid perms={perms} toggle={togglePerm} />
                  <div className="flex flex-wrap gap-2">
                    <button onClick={savePermissions} disabled={busy} className="flex-1 min-w-[120px] bg-navy text-white font-medium py-2.5 rounded-xl hover:bg-navy-soft disabled:opacity-60">Save changes</button>
                    <button onClick={resetPassword} disabled={busy} className="flex items-center gap-1.5 border border-navy-line text-navy font-medium px-4 py-2.5 rounded-xl hover:bg-surface"><KeyRound className="w-4 h-4" /> Reset password</button>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-navy-line">
                    <button onClick={toggleActive} className={`text-sm font-medium ${account.active ? "text-navy" : "text-emerald-600"}`}>{account.active ? "Disable login" : "Enable login"}</button>
                    <button onClick={() => setConfirmRemove(true)} className="text-sm font-medium text-red-600">Remove login</button>
                  </div>
                  {account.last_login_at && <p className="text-xs text-muted">Last login: {new Date(account.last_login_at).toLocaleString()}</p>}
                </>
              )}
            </>
          )}
        </div>
      </div>
      <ConfirmDialog open={confirmRemove} title="Remove login access?" body={`${employee.name} will no longer be able to sign in. Their HR record stays.`} confirmLabel="Remove" onConfirm={removeLogin} onCancel={() => setConfirmRemove(false)} />
    </div>
  );
}

function PermissionGrid({ perms, toggle }: { perms: string[]; toggle: (p: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-navy mb-2">Permissions</label>
      <div className="grid grid-cols-2 gap-2">
        {ALL_PERMISSIONS.map((p) => (
          <label key={p} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border cursor-pointer ${perms.includes(p) ? "border-amber bg-amber/5 text-navy" : "border-navy-line text-muted"}`}>
            <input type="checkbox" checked={perms.includes(p)} onChange={() => toggle(p)} className="accent-amber-deep" />
            {LABELS[p]}
          </label>
        ))}
      </div>
    </div>
  );
}
