"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DawnLogo } from "@/components/DawnLogo";
import { Loader2, Users, ShoppingBag, LogOut, Phone, MessageCircle, TrendingUp, Plus, X, Send, MessageSquare, KeyRound } from "lucide-react";

type Tab = "dashboard" | "leads" | "customers" | "orders" | "messages";

export default function TeamDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [leads, setLeads] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [modal, setModal] = useState<null | "lead" | "order">(null);
  const [pwModal, setPwModal] = useState(false);

  function loadAll() {
    fetch("/api/team/data").then((r) => { if (r.status === 401) { router.push("/team-login"); return null; } return r.json(); })
      .then((d) => {
        if (!d) return;
        setMe(d.me); setLeads(d.leads || []); setCustomers(d.customers || []); setOrders(d.orders || []); setStats(d.stats || {});
        if (d.me?.mustChangePassword) setPwModal(true);
        setLoading(false);
      }).catch(() => setLoading(false));
  }
  useEffect(() => { loadAll(); }, []);

  async function logout() { await fetch("/api/employee-login", { method: "DELETE" }); router.push("/team-login"); }

  if (loading) return <div className="min-h-screen bg-surface flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/40" /></div>;
  if (!me) return null;

  const perms: string[] = me.permissions || [];
  const can = (p: string) => perms.includes(p);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    can("dashboard") && { id: "dashboard", label: "Home", icon: TrendingUp },
    can("leads") && { id: "leads", label: "Leads", icon: Users },
    can("customers") && { id: "customers", label: "Customers", icon: Users },
    can("orders") && { id: "orders", label: "Orders", icon: ShoppingBag },
    can("messaging") && { id: "messages", label: "Messages", icon: MessageSquare },
  ].filter(Boolean) as any;

  return (
    <div className="min-h-screen bg-surface pb-20">
      <header className="bg-white border-b border-navy-line sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <DawnLogo className="h-8" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-navy/60 hidden sm:inline">Hi, {me.name || "there"}</span>
            <button onClick={() => setPwModal(true)} className="p-2 text-navy/40 hover:text-navy" title="Change password"><KeyRound className="w-4 h-4" /></button>
            <button onClick={logout} className="p-2 text-navy/40 hover:text-navy" title="Sign out"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {tab === "dashboard" && can("dashboard") && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="My leads" value={stats.leads ?? leads.length} icon={Users} />
              <Stat label="My customers" value={stats.customers ?? customers.length} icon={Users} />
              <Stat label="My orders" value={stats.orders ?? orders.length} icon={ShoppingBag} />
            </div>
            {stats.revenue != null && (
              <div className="bg-navy rounded-2xl p-5 text-white flex items-center justify-between">
                <div><p className="text-xs text-white/50 uppercase tracking-wide">My collected revenue</p><p className="text-2xl font-bold text-amber">₹{stats.revenue}</p></div>
                <TrendingUp className="w-8 h-8 text-white/20" />
              </div>
            )}
            <div className="flex gap-2">
              {can("leads") && <button onClick={() => setModal("lead")} className="flex-1 flex items-center justify-center gap-2 bg-white border border-navy-line rounded-xl py-3 text-sm font-medium text-navy hover:bg-surface"><Plus className="w-4 h-4" /> Add lead</button>}
              {can("orders") && <button onClick={() => setModal("order")} className="flex-1 flex items-center justify-center gap-2 bg-navy text-white rounded-xl py-3 text-sm font-medium hover:bg-navy-soft"><Plus className="w-4 h-4" /> New order</button>}
            </div>
          </>
        )}

        {(tab === "leads" || tab === "customers") && (
          <ContactList
            title={tab === "leads" ? "My leads" : "My customers"}
            items={tab === "leads" ? leads : customers}
            onAdd={tab === "leads" && can("leads") ? () => setModal("lead") : undefined}
            onChanged={loadAll}
          />
        )}

        {tab === "orders" && can("orders") && (
          <OrderList orders={orders} onAdd={() => setModal("order")} onChanged={loadAll} />
        )}

        {tab === "messages" && can("messaging") && <Messages />}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-navy-line flex items-center justify-around h-16 z-20">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-col items-center gap-0.5 flex-1 py-1 ${tab === t.id ? "text-amber-deep" : "text-navy/50"}`}>
            <t.icon className="w-5 h-5" /><span className="text-[10px] font-medium">{t.label}</span>
          </button>
        ))}
      </nav>

      {modal === "lead" && <LeadModal onClose={() => setModal(null)} onSaved={loadAll} />}
      {modal === "order" && <OrderModal customers={customers} onClose={() => setModal(null)} onSaved={loadAll} />}
      {pwModal && <PasswordModal force={me.mustChangePassword} onClose={() => setPwModal(false)} />}
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

function ContactList({ title, items, onAdd, onChanged }: { title: string; items: any[]; onAdd?: () => void; onChanged: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg text-navy">{title}</h2>
        {onAdd && <button onClick={onAdd} className="flex items-center gap-1.5 text-sm font-medium bg-navy text-white px-3 py-1.5 rounded-lg"><Plus className="w-4 h-4" /> Add</button>}
      </div>
      {items.length === 0 ? <div className="bg-white rounded-2xl border border-navy-line p-10 text-center text-muted text-sm">Nothing here yet.</div> : (
        <div className="grid gap-2">
          {items.map((c) => {
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
          })}
        </div>
      )}
    </div>
  );
}

function OrderList({ orders, onAdd, onChanged }: { orders: any[]; onAdd: () => void; onChanged: () => void }) {
  const STATUSES = ["Placed", "Processing", "Shipped", "Delivered"];
  async function setStatus(id: string, s: string) {
    await fetch("/api/team/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, orderStatus: s }) });
    onChanged();
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg text-navy">My orders</h2>
        <button onClick={onAdd} className="flex items-center gap-1.5 text-sm font-medium bg-navy text-white px-3 py-1.5 rounded-lg"><Plus className="w-4 h-4" /> New</button>
      </div>
      {orders.length === 0 ? <div className="bg-white rounded-2xl border border-navy-line p-10 text-center text-muted text-sm">No orders yet.</div> : (
        <div className="grid gap-2">
          {orders.map((o) => (
            <div key={o.id} className="bg-white rounded-xl border border-navy-line p-4 shadow-card">
              <div className="flex items-center justify-between">
                <div><p className="font-semibold text-navy text-sm">₹{o.total} <span className="text-xs font-normal text-muted">· {(o.items || []).length} item(s)</span></p><p className="text-xs text-muted">{new Date(o.date).toLocaleDateString()}</p></div>
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${o.status === "paid" ? "bg-emerald-50 text-emerald-700" : o.status === "partial" ? "bg-amber/10 text-amber-deep" : "bg-red-50 text-red-600"}`}>{o.status}</span>
              </div>
              <div className="flex gap-1 mt-3 pt-3 border-t border-navy-line flex-wrap">
                {STATUSES.map((s) => <button key={s} onClick={() => setStatus(o.id, s)} className={`text-[11px] font-medium px-2 py-1 rounded-lg ${(o.order_status || "Placed") === s ? "bg-navy text-white" : "text-navy/40 hover:bg-surface"}`}>{s}</button>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ name: "", phone: "", instagramHandle: "", source: "Instagram DM", notes: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function save() {
    if (!f.name.trim()) { setErr("Name is required."); return; }
    setBusy(true);
    const res = await fetch("/api/team/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    if (res.ok) { onSaved(); onClose(); } else { const d = await res.json(); setErr(d.error || "Failed"); }
    setBusy(false);
  }
  return (
    <Sheet title="Add lead" onClose={onClose}>
      <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name *" className="tinp" />
      <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" className="tinp" />
      <input value={f.instagramHandle} onChange={(e) => setF({ ...f, instagramHandle: e.target.value })} placeholder="Instagram handle" className="tinp" />
      <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} className="tinp">{["Instagram DM", "WhatsApp", "Referral", "Walk-in", "Website", "Other"].map((s) => <option key={s}>{s}</option>)}</select>
      <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} placeholder="Notes" className="tinp resize-none" />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button onClick={save} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl disabled:opacity-60">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Add lead</button>
    </Sheet>
  );
}

function OrderModal({ customers, onClose, onSaved }: { customers: any[]; onClose: () => void; onSaved: () => void }) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [contactId, setContactId] = useState("");
  const [walkIn, setWalkIn] = useState("");
  const [status, setStatus] = useState("Paid");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { fetch("/api/team/catalog").then((r) => r.json()).then((d) => setCatalog(d.items || [])); }, []);
  const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  function addLine(id: string) { const it = catalog.find((i) => i.id === id); if (it) setLines([...lines, { itemId: it.id, name: it.name, qty: 1, unitPrice: Number(it.price) || 0, cost: Number(it.cost) || 0 }]); }
  async function save() {
    if (!contactId && !walkIn.trim()) { setErr("Pick a customer or enter a walk-in name."); return; }
    if (lines.length === 0) { setErr("Add at least one item."); return; }
    setBusy(true);
    const body: any = { items: lines, amountPaid: status === "Paid" ? total : 0, paymentMethod: "cash" };
    if (contactId) body.contactId = contactId; else body.customerName = walkIn.trim();
    const res = await fetch("/api/team/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { onSaved(); onClose(); } else { const d = await res.json(); setErr(d.error || "Failed"); }
    setBusy(false);
  }
  return (
    <Sheet title="New order" onClose={onClose}>
      <select value={contactId} onChange={(e) => { setContactId(e.target.value); setWalkIn(""); }} className="tinp">
        <option value="">Select my customer…</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {!contactId && <input value={walkIn} onChange={(e) => setWalkIn(e.target.value)} placeholder="…or walk-in name" className="tinp" />}
      <select onChange={(e) => { if (e.target.value) { addLine(e.target.value); e.target.value = ""; } }} className="tinp">
        <option value="">Add item…</option>
        {catalog.map((i) => <option key={i.id} value={i.id}>{i.name} — ₹{i.price ?? 0}</option>)}
      </select>
      {lines.map((l, i) => (
        <div key={i} className="flex items-center gap-2 bg-surface rounded-lg p-2">
          <span className="flex-1 text-sm text-navy truncate">{l.name}</span>
          <input type="number" min="1" value={l.qty} onChange={(e) => { const a = [...lines]; a[i].qty = Number(e.target.value); setLines(a); }} className="w-14 text-center text-sm border border-navy-line rounded px-1 py-1" />
          <span className="text-sm text-navy w-16 text-right">₹{l.unitPrice * l.qty}</span>
        </div>
      ))}
      <div className="flex justify-between font-semibold text-navy"><span>Total</span><span>₹{total}</span></div>
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="tinp">{["Paid", "Pending"].map((s) => <option key={s}>{s}</option>)}</select>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button onClick={save} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl disabled:opacity-60">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Create order</button>
    </Sheet>
  );
}

function PasswordModal({ force, onClose }: { force?: boolean; onClose: () => void }) {
  const [cur, setCur] = useState(""); const [nw, setNw] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState(false);
  async function save() {
    setBusy(true); setErr("");
    const res = await fetch("/api/team/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
    if (res.ok) { setDone(true); setTimeout(onClose, 1000); } else { const d = await res.json(); setErr(d.error || "Failed"); }
    setBusy(false);
  }
  return (
    <Sheet title={force ? "Set your password" : "Change password"} onClose={force ? () => {} : onClose}>
      {force && <p className="text-sm text-muted">Please set your own password to continue.</p>}
      {done ? <p className="text-emerald-600 font-medium">Password updated.</p> : <>
        <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" className="tinp" />
        <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} placeholder="New password (min 6 chars)" className="tinp" />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button onClick={save} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl disabled:opacity-60">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save password</button>
      </>}
    </Sheet>
  );
}

function Messages() {
  const [convs, setConvs] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState(""); const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  useEffect(() => { fetch("/api/team/messages").then((r) => r.json()).then((d) => { setConvs(d.conversations || []); setLoading(false); }); }, []);
  function open(c: any) {
    setActive(c);
    fetch(`/api/team/messages?conversationId=${c.id}`).then((r) => r.json()).then((d) => setMsgs(d.messages || []));
  }
  async function send() {
    if (!text.trim() || !active) return;
    const res = await fetch("/api/team/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: active.id, text }) });
    const d = await res.json();
    setMsgs([...msgs, { id: Math.random(), direction: "out", body: text, delivered: d.delivered }]);
    setText("");
    if (d.delivered === false) setNote(d.note || "Message saved but not delivered.");
  }
  if (loading) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-navy/40" /></div>;
  if (active) return (
    <div className="space-y-3">
      <button onClick={() => { setActive(null); setNote(""); }} className="text-sm text-muted">← All conversations</button>
      <div className="bg-white rounded-2xl border border-navy-line p-4 min-h-[300px] flex flex-col">
        <p className="font-semibold text-navy text-sm mb-3">{active.external_username || "Customer"}</p>
        <div className="flex-1 space-y-2 overflow-y-auto max-h-[50vh]">
          {msgs.map((m) => (
            <div key={m.id} className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${m.direction === "out" ? "ml-auto bg-navy text-white" : "bg-surface text-navy"}`}>{m.body}{m.direction === "out" && m.delivered === false && <span className="block text-[10px] text-amber mt-0.5">not delivered</span>}</div>
          ))}
          {msgs.length === 0 && <p className="text-sm text-muted text-center py-8">No messages yet.</p>}
        </div>
        {note && <p className="text-xs text-amber-deep mt-2">{note}</p>}
        <div className="flex gap-2 mt-3">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a reply…" className="flex-1 px-3 py-2 rounded-xl border border-navy-line text-sm focus:outline-none focus:border-amber" />
          <button onClick={send} className="bg-navy text-white px-4 rounded-xl"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <h2 className="font-display font-semibold text-lg text-navy">Messages</h2>
      <div className="bg-amber/10 border border-amber/30 rounded-xl p-3 text-xs text-navy">Instagram messaging goes live once Meta approves the app. Conversations assigned to you will appear here.</div>
      {convs.length === 0 ? <div className="bg-white rounded-2xl border border-navy-line p-10 text-center text-muted text-sm">No conversations yet.</div> : (
        <div className="grid gap-2">
          {convs.map((c) => (
            <button key={c.id} onClick={() => open(c)} className="bg-white rounded-xl border border-navy-line p-4 shadow-card text-left flex items-center justify-between">
              <div className="min-w-0"><p className="font-semibold text-navy text-sm">{c.external_username || "Customer"}</p><p className="text-xs text-muted truncate">{c.last_message_preview || "…"}</p></div>
              {c.unread_count > 0 && <span className="text-[10px] font-bold bg-amber text-navy px-2 py-0.5 rounded-full">{c.unread_count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 animate-rise max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-navy">{title}</h3><button onClick={onClose} className="p-1.5 text-navy/40"><X className="w-5 h-5" /></button></div>
        <div className="space-y-3">{children}</div>
      </div>
      <style jsx>{`.tinp{width:100%;padding:0.6rem 0.75rem;border:1px solid #E4E8F0;border-radius:0.75rem;font-size:0.875rem;color:#16233F;outline:none}.tinp:focus{border-color:#FF9E43}`}</style>
    </div>
  );
}
