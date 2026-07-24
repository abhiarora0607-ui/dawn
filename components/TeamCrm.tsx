"use client";

// components/TeamCrm.tsx — the employee CRM, re-homed (V61).
//
// This is the /team monolith's CRM half, MOVED nearly verbatim into the app
// shell: same list components, same modals, same stage-confirm dialogs, same
// server-enforced permissions. The one structural change: `view` is a prop
// the shell's router sets (one page per view), where the portal used a local
// tab. The variable keeps the old name so every render line below is a
// byte-for-byte copy — a move, not a rewrite.
//
// Each mount loads the employee's own book via /api/team/data (401 → the
// login page). The portal itself is a redirect now; this file is where its
// CRM lives on.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { PeopleSearch } from "@/components/PeopleSearch";
import { LostDialog, PaymentModal, WonDialog } from "@/components/SharedModals";
import {
  Loader2, Users, ShoppingBag, LogOut, Phone, MessageCircle, TrendingUp, Plus, X, Send,
  MessageSquare, KeyRound, Bell, Clock, CheckSquare, CalendarDays, StickyNote, BarChart3,
  Settings as SettingsIcon, MoreHorizontal, Pencil, Download, Trash2, Home, CalendarClock, Palmtree, Wallet, Search, Users2, ReceiptText, IndianRupee, Sparkles,
} from "lucide-react";

const STAGES = ["New Lead", "Contacted", "Negotiating", "Customer (Won)", "Lost"];

export type CrmView = "leads" | "customers" | "orders" | "messages" | "tasks" | "calendar" | "notes" | "reports" | "settings";

export function TeamCrm({ view }: { view: CrmView }) {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [modal, setModal] = useState<null | "lead" | "order">(null);
  const [pwModal, setPwModal] = useState(false);
  const [editContact, setEditContact] = useState<any>(null);
  const [payOrder, setPayOrder] = useState<any>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<any>(null);
  const [wonFor, setWonFor] = useState<any>(null);
  const [backFor, setBackFor] = useState<{ c: any; stage: string } | null>(null);
  const [flash, setFlash] = useState("");

  function say(msg: string) { setFlash(msg); setTimeout(() => setFlash(""), 3500); }

  async function quickStage(c: any, stage: string, extra?: any, confirmedBack?: boolean) {
    if (c.stage === stage) return;
    if (stage === "Lost" && !extra?.lostNote) { setLostFor(c); return; }
    if (stage === "Customer (Won)" && !extra?.wonNote) { setWonFor(c); return; }
    if (c.stage === "Customer (Won)" && stage !== "Lost" && !confirmedBack) { setBackFor({ c, stage }); return; }
    const res = await fetch("/api/team/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, stage, ...(extra || {}) }) });
    if (res.ok) { say(`${c.name} → ${stage}`); loadAll(); }
    else { const d = await res.json().catch(() => ({})); say(d.error || "Couldn't move — try again."); }
  }

  function loadAll() {
    fetch("/api/team/data").then((r) => { if (r.status === 401) { router.push("/team-login"); return null; } return r.json(); })
      .then((d) => {
        if (!d) return;
        setMe(d.me); setLeads(d.leads || []); setCustomers(d.customers || []); setOrders(d.orders || []);
        if (d.me?.mustChangePassword) setPwModal(true);
        setLoading(false);
      }).catch(() => setLoading(false));
  }
  useEffect(() => { loadAll(); }, []);

  async function logout() { await fetch("/api/employee-login", { method: "DELETE" }); router.push("/team-login"); }

  if (loading) return <Spinner />;
  if (!me) return null;

  const perms: string[] = me.permissions || [];
  const can = (p: string) => perms.includes(p);
  // Same name as the portal's tab variable ON PURPOSE — the renders below are
  // verbatim copies keyed on it; here the shell's route decides it.
  const activeTab: CrmView = view;
  function contactChanged() { loadAll(); }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
        {(activeTab === "leads" || activeTab === "customers") && (
          <ContactList
            title={activeTab === "leads" ? "My leads" : "My customers"}
            items={activeTab === "leads" ? leads : customers}
            canEdit={can(activeTab === "leads" ? "edit_leads" : "edit_customers")}
            isLeads={activeTab === "leads"}
            onAdd={activeTab === "leads" && can("leads") ? () => setModal("lead") : undefined}
            onEdit={setEditContact}
            onQuickStage={quickStage}
            onOpen={(c) => setDetailId(c.id)}
          />
        )}

        {activeTab === "orders" && can("orders") && (
          <OrderList orders={orders} canEdit={can("edit_orders")} onAdd={() => setModal("order")} onChanged={loadAll} onPay={setPayOrder} />
        )}

        {activeTab === "messages" && can("messaging") && <Messages />}
        {activeTab === "tasks" && can("tasks") && <Tasks contacts={[...leads, ...customers]} />}
        {activeTab === "calendar" && can("calendar") && <CalendarView leads={leads} />}
        {activeTab === "notes" && can("notes") && <Notes />}
        {activeTab === "reports" && can("reports") && <Reports />}
        {activeTab === "settings" && can("settings") && <Profile me={me} canExport={can("data_export")} onChangePassword={() => setPwModal(true)} onLogout={logout} />}
      
      {modal === "lead" && <LeadModal onClose={() => setModal(null)} onSaved={loadAll} />}
      {modal === "order" && <OrderModal customers={customers} onClose={() => setModal(null)} onSaved={loadAll} />}
      {pwModal && <PasswordModal force={me.mustChangePassword} onClose={() => setPwModal(false)} />}
      {detailId && <ContactDetail id={detailId} canEdit={can("edit_leads") || can("edit_customers")} onClose={() => setDetailId(null)} onEdit={(c) => { setDetailId(null); setEditContact(c); }} />}
      {editContact && <EditContactModal contact={editContact} onClose={() => setEditContact(null)} onSaved={() => { setEditContact(null); contactChanged(); }} />}
      {lostFor && <LostDialog name={lostFor.name} onCancel={() => setLostFor(null)} onConfirm={(note) => { const c = lostFor; setLostFor(null); quickStage(c, "Lost", { lostNote: note }); }} />}
      {wonFor && <WonDialog name={wonFor.name} onCancel={() => setWonFor(null)} onConfirm={(note) => { const c = wonFor; setWonFor(null); quickStage(c, "Customer (Won)", { wonNote: note }); }} />}
      {backFor && (
        <ConfirmSheet
          title="Move customer back into the pipeline?"
          body={`${backFor.c.name} is a customer. Their order history stays.`}
          onCancel={() => setBackFor(null)}
          onConfirm={() => { const { c, stage } = backFor; setBackFor(null); quickStage(c, stage, undefined, true); }}
        />
      )}
      {flash && <div className="fixed bottom-24 inset-x-4 z-[70] max-w-md mx-auto bg-navy text-white text-sm px-4 py-3 rounded-xl shadow-lg text-center pb-safe">{flash}</div>}
      {payOrder && (
        <PaymentModal
          balance={Number(payOrder.balance) || 0}
          onClose={() => setPayOrder(null)}
          onSubmit={async (amount, method) => {
            const res = await fetch("/api/team/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: payOrder.id, addPayment: amount, method }) });
            if (!res.ok) throw new Error();
            loadAll();
          }}
        />
      )}
    </div>
  );
}

function logOutreach(contactId: string, channel: "whatsapp" | "call") {
  fetch("/api/team/log-outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId, channel }) }).catch(() => {});
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="dawn-card p-4 shadow-card">
      <Icon className="w-4 h-4 text-amber-deep mb-1" />
      <p className="text-xl font-bold text-navy">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function ActivityFeed() {
  const [items, setItems] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/team/activity").then((r) => r.json()).then((d) => { setItems(d.activity || []); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);
  if (!loaded || items.length === 0) return null;
  const LABELS: Record<string, string> = { "contact.create": "Added a lead", "contact.update": "Updated a contact", "order.create": "Created an order", "order.status": "Updated order status", "order.payment": "Recorded a payment", "message.send": "Sent a message" };
  return (
    <div className="dawn-card p-4">
      <p className="text-sm font-semibold text-navy mb-2 flex items-center gap-1.5"><Clock className="w-4 h-4 text-navy/40" /> Recent activity</p>
      <div className="space-y-2">
        {items.slice(0, 8).map((it, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-navy/70">{LABELS[it.action] || it.action}</span>
            <span className="text-xs text-muted">{new Date(it.at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactList({ title, items, canEdit, isLeads, onAdd, onEdit, onQuickStage, onOpen }: { title: string; items: any[]; canEdit: boolean; isLeads?: boolean; onAdd?: () => void; onEdit: (c: any) => void; onQuickStage: (c: any, stage: string) => void; onOpen: (c: any) => void }) {
  const [q, setQ] = useState("");
  const [pill, setPill] = useState("All");
  const PILLS = ["All", "New Lead", "Contacted", "Negotiating", "Due today"];
  const today = new Date(new Date().toDateString());
  let shown = items.filter((c) => (c.name || "").toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q) || (c.instagram_handle || "").toLowerCase().includes(q.toLowerCase()));
  if (isLeads && pill !== "All") {
    shown = pill === "Due today"
      ? shown.filter((c) => c.follow_up_date && new Date(c.follow_up_date) <= today)
      : shown.filter((c) => c.stage === pill);
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg text-navy">{title}</h2>
        {onAdd && <button onClick={onAdd} className="flex items-center gap-1.5 text-sm font-medium bg-navy text-white px-3 py-1.5 rounded-lg"><Plus className="w-4 h-4" /> Add</button>}
      </div>
      {items.length > 3 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, handle…" className="inp" />}
      {isLeads && items.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {PILLS.map((p) => (
            <button key={p} onClick={() => setPill(p)} className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border ${pill === p ? "bg-navy text-white border-navy" : "bg-white text-navy/60 border-navy-line"}`}>{p}</button>
          ))}
        </div>
      )}
      {shown.length === 0 ? <div className="dawn-card p-10 text-center text-muted text-sm">{items.length === 0 ? "Nothing here yet." : "No matches."}</div> : (
        <div className="grid gap-2">
          {shown.map((c) => {
            const wa = (c.phone || "").replace(/[^0-9]/g, "");
            return (
              <div key={c.id} className="dawn-card-flat p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <button onClick={() => onOpen(c)} className="min-w-0 text-left flex-1">
                    <p className="font-semibold text-navy text-sm">{c.name}</p>
                    <p className="text-xs text-muted">{c.phone || (c.instagram_handle ? "@" + c.instagram_handle : c.source)}</p>
                    {c.follow_up_date && <p className={`text-[12px] mt-0.5 ${new Date(c.follow_up_date) <= today ? "text-red-600 font-semibold" : "text-amber-deep"}`}>Follow up: {new Date(c.follow_up_date).toLocaleDateString()}</p>}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {canEdit && <button onClick={() => onEdit(c)} className="p-2 text-navy/40 hover:text-navy rounded-lg" title="Edit"><Pencil className="w-4 h-4" /></button>}
                    {wa && <a href={`https://wa.me/${wa}`} target="_blank" onClick={() => logOutreach(c.id, "whatsapp")} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"><MessageCircle className="w-4 h-4" /></a>}
                    {c.phone && <a href={`tel:${c.phone}`} onClick={() => logOutreach(c.id, "call")} className="p-2 text-navy/50 hover:bg-navy/5 rounded-lg"><Phone className="w-4 h-4" /></a>}
                  </div>
                </div>
                {canEdit && (
                  <select value={c.stage} onChange={(e) => onQuickStage(c, e.target.value)} className="mt-2.5 w-full text-[12px] text-navy/70 border border-navy-line rounded-lg px-2 py-1.5 bg-surface focus:outline-none focus:border-amber" aria-label={`Move ${c.name} to another stage`}>
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditContactModal({ contact, onClose, onSaved }: { contact: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({
    name: contact.name || "", phone: contact.phone || "", instagramHandle: contact.instagram_handle || "",
    source: contact.source || "Other", notes: contact.notes || "", followUpDate: contact.follow_up_date || "", stage: contact.stage,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [lostAsk, setLostAsk] = useState(false);
  const [wonAsk, setWonAsk] = useState(false);

  async function save(extra?: { lostNote?: string; wonNote?: string }) {
    if (!f.name.trim()) { setErr("Name is required."); return; }
    if (f.stage === "Lost" && contact.stage !== "Lost" && !extra?.lostNote) { setLostAsk(true); return; }
    if (f.stage === "Customer (Won)" && contact.stage !== "Customer (Won)" && !extra?.wonNote) { setWonAsk(true); return; }
    setBusy(true);
    const res = await fetch("/api/team/contacts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contact.id, ...f, ...(extra || {}) }),
    });
    if (res.ok) onSaved(); else { const d = await res.json(); setErr(d.error || "Failed"); setBusy(false); }
  }

  return (
    <>
      <Sheet title="Edit" onClose={onClose}>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name *" className="inp" />
        <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" className="inp" />
        <input value={f.instagramHandle} onChange={(e) => setF({ ...f, instagramHandle: e.target.value.replace("@", "") })} placeholder="Instagram handle" className="inp" />
        <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} className="inp">{["Instagram DM", "WhatsApp", "Referral", "Walk-in", "Website", "Other"].map((s) => <option key={s}>{s}</option>)}</select>
        <div>
          <label className="block text-xs font-semibold text-navy mb-1">Stage</label>
          <select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} className="inp">{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-navy mb-1">Follow up on</label>
          <input type="date" value={f.followUpDate || ""} onChange={(e) => setF({ ...f, followUpDate: e.target.value })} className="inp" />
        </div>
        <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} placeholder="Notes" className="inp resize-none" />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button onClick={() => save()} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl disabled:opacity-60">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save changes</button>
      </Sheet>
      {lostAsk && <LostDialog name={f.name} onCancel={() => setLostAsk(false)} onConfirm={(note) => { setLostAsk(false); save({ lostNote: note }); }} />}
      {wonAsk && <WonDialog name={f.name} onCancel={() => setWonAsk(false)} onConfirm={(note) => { setWonAsk(false); save({ wonNote: note }); }} />}
    </>
  );
}

function OrderList({ orders, canEdit, onAdd, onChanged, onPay }: { orders: any[]; canEdit: boolean; onAdd: () => void; onChanged: () => void; onPay: (o: any) => void }) {
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
      {orders.length === 0 ? <div className="dawn-card p-10 text-center text-muted text-sm">No orders yet.</div> : (
        <div className="grid gap-2">
          {orders.map((o) => (
            <div key={o.id} className="dawn-card-flat p-4 shadow-card">
              <div className="flex items-center justify-between">
                <div><p className="font-semibold text-navy text-sm">₹{o.total} <span className="text-xs font-normal text-muted">· {(o.items || []).length} item(s)</span></p><p className="text-xs text-muted">{new Date(o.date).toLocaleDateString()}</p></div>
                <span className={`text-[12px] font-bold uppercase px-2 py-1 rounded ${o.status === "paid" ? "bg-emerald-50 text-emerald-700" : o.status === "partial" ? "bg-amber/10 text-amber-deep" : "bg-red-50 text-red-600"}`}>{o.status}</span>
              </div>
              {canEdit && (
                <div className="flex gap-1 mt-3 pt-3 border-t border-navy-line flex-wrap">
                  {STATUSES.map((s) => <button key={s} onClick={() => setStatus(o.id, s)} className={`text-[12px] font-medium px-2 py-1 rounded-lg ${(o.order_status || "Placed") === s ? "bg-navy text-white" : "text-navy/40 hover:bg-surface"}`}>{s}</button>)}
                </div>
              )}
              {Number(o.balance) > 0 && (
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-amber-deep">Balance: ₹{o.balance}</p>
                  {canEdit && <button onClick={() => onPay(o)} className="text-[12px] font-semibold text-white bg-amber-deep px-2.5 py-1 rounded-lg">Record payment</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tasks({ contacts }: { contacts: any[] }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [loading, setLoading] = useState(true);
  function load() { fetch("/api/team/tasks").then((r) => r.json()).then((d) => { setTasks(d.tasks || []); setLoading(false); }); }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!title.trim()) return;
    await fetch("/api/team/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, dueDate: due || null }) });
    setTitle(""); setDue(""); load();
  }
  async function toggle(t: any) {
    await fetch("/api/team/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, done: !t.done }) });
    load();
  }
  async function remove(id: string) {
    await fetch(`/api/team/tasks?id=${id}`, { method: "DELETE" }); load();
  }
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const overdue = (t: any) => t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
  if (loading) return <Spinner />;
  return (
    <div className="space-y-3">
      <h2 className="font-display font-semibold text-lg text-navy">Tasks</h2>
      <div className="dawn-card p-3 space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a task…" className="inp" />
        <div className="flex gap-2">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="inp flex-1" />
          <button onClick={add} className="bg-navy text-white px-4 rounded-xl text-sm font-medium">Add</button>
        </div>
      </div>
      {open.length === 0 && done.length === 0 ? <div className="dawn-card p-10 text-center text-muted text-sm">No tasks yet — add your first above.</div> : (
        <>
          <div className="grid gap-2">
            {open.map((t) => (
              <div key={t.id} className="dawn-card-flat p-3 shadow-card flex items-center gap-3">
                <input type="checkbox" checked={false} onChange={() => toggle(t)} className="w-4 h-4 accent-amber-deep shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-navy">{t.title}</p>
                  {t.due_date && <p className={`text-[12px] ${overdue(t) ? "text-red-600 font-semibold" : "text-muted"}`}>{overdue(t) ? "Overdue · " : "Due "}{new Date(t.due_date).toLocaleDateString()}</p>}
                </div>
                <button aria-label="Delete" onClick={() => remove(t.id)} className="btn-icon p-1.5 text-navy/30 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          {done.length > 0 && (
            <details className="text-sm text-muted">
              <summary className="cursor-pointer font-medium">Completed ({done.length})</summary>
              <div className="grid gap-2 mt-2">
                {done.map((t) => (
                  <div key={t.id} className="bg-white/60 rounded-xl border border-navy-line p-3 flex items-center gap-3">
                    <input type="checkbox" checked onChange={() => toggle(t)} className="w-4 h-4 accent-amber-deep shrink-0" />
                    <p className="text-sm text-navy/50 line-through flex-1">{t.title}</p>
                    <button aria-label="Delete" onClick={() => remove(t.id)} className="btn-icon p-1.5 text-navy/30 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function CalendarView({ leads }: { leads: any[] }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/team/tasks").then((r) => r.json()).then((d) => { setTasks((d.tasks || []).filter((t: any) => !t.done && t.due_date)); setLoading(false); }).catch(() => setLoading(false)); }, []);
  if (loading) return <Spinner />;
  // Merge follow-ups + task due dates into a date-grouped agenda.
  const entries: { date: string; label: string; kind: string }[] = [];
  for (const t of tasks) entries.push({ date: t.due_date, label: t.title, kind: "Task" });
  for (const l of leads) if (l.follow_up_date) entries.push({ date: l.follow_up_date, label: `Follow up: ${l.name}`, kind: "Follow-up" });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const groups: Record<string, typeof entries> = {};
  for (const e of entries) { (groups[e.date] = groups[e.date] || []).push(e); }
  const dates = Object.keys(groups);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-3">
      <h2 className="font-display font-semibold text-lg text-navy">Calendar</h2>
      {dates.length === 0 ? <div className="dawn-card p-10 text-center text-muted text-sm">Nothing scheduled. Add tasks with due dates or set follow-up dates on leads.</div> : (
        <div className="space-y-3">
          {dates.map((d) => (
            <div key={d} className="dawn-card p-4">
              <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${d < today ? "text-red-600" : d === today ? "text-amber-deep" : "text-muted"}`}>
                {d < today ? "Overdue · " : ""}{new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </p>
              <div className="space-y-1.5">
                {groups[d].map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-navy">{e.label}</span>
                    <span className="text-[12px] text-muted bg-surface px-2 py-0.5 rounded">{e.kind}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Notes() {
  const [notes, setNotes] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  function load() { fetch("/api/team/notes").then((r) => r.json()).then((d) => { setNotes(d.notes || []); setLoading(false); }); }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!body.trim()) return;
    await fetch("/api/team/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    setBody(""); load();
  }
  async function remove(id: string) { await fetch(`/api/team/notes?id=${id}`, { method: "DELETE" }); load(); }
  if (loading) return <Spinner />;
  return (
    <div className="space-y-3">
      <h2 className="font-display font-semibold text-lg text-navy">Notes</h2>
      <div className="dawn-card p-3 space-y-2">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Write a note…" className="inp resize-none" />
        <button onClick={add} className="w-full bg-navy text-white py-2.5 rounded-xl text-sm font-medium">Save note</button>
      </div>
      <div className="grid gap-2">
        {notes.map((n) => (
          <div key={n.id} className="dawn-card-flat p-3 shadow-card">
            <p className="text-sm text-navy whitespace-pre-wrap">{n.body}</p>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-navy-line">
              <span className="text-[12px] text-muted">{new Date(n.updated_at).toLocaleString()}</span>
              <button aria-label="Delete" onClick={() => remove(n.id)} className="btn-icon p-1 text-navy/30 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Reports() {
  const WINDOWS = [{ id: "day", label: "Today" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "year", label: "Year" }, { id: "all", label: "All" }];
  const [win, setWin] = useState("month");
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/team/reports?window=${win}`).then((r) => r.json()).then((d) => { setStats(d.stats); setLoading(false); }).catch(() => setLoading(false));
  }, [win]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display font-semibold text-lg text-navy">My reports</h2>
        <div className="flex gap-1 bg-white p-1 rounded-xl border border-navy-line">
          {WINDOWS.map((w) => <button key={w.id} onClick={() => setWin(w.id)} className={`text-xs font-medium px-2.5 py-1.5 rounded-lg ${win === w.id ? "bg-navy text-white" : "text-muted"}`}>{w.label}</button>)}
        </div>
      </div>
      {loading || !stats ? <Spinner /> : (
        <>
          {stats.revenue != null && (
            <div className="bg-navy rounded-2xl p-5 text-white">
              <p className="text-xs text-white/50 uppercase tracking-wide">Revenue collected</p>
              <p className="text-2xl font-bold text-amber">₹{stats.revenue}</p>
              {stats.avgOrderValue != null && <p className="text-xs text-white/50 mt-1">Avg order ₹{stats.avgOrderValue}</p>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Leads" value={stats.leads} icon={Users} />
            <Stat label="Customers" value={stats.customers} icon={Users} />
            <Stat label="Orders" value={stats.orders} icon={ShoppingBag} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Delivered" value={stats.delivered} icon={CheckSquare} />
            <Stat label="Pending orders" value={stats.pendingOrders} icon={Clock} />
            <Stat label="Conversion %" value={stats.conversion} icon={TrendingUp} />
          </div>
          {stats.pendingAmount > 0 && <p className="text-xs text-amber-deep">₹{stats.pendingAmount} still to collect from your orders.</p>}
        </>
      )}
    </div>
  );
}

function Profile({ me, canExport, onChangePassword, onLogout }: { me: any; canExport: boolean; onChangePassword: () => void; onLogout: () => void }) {
  return (
    <div className="space-y-3">
      <h2 className="font-display font-semibold text-lg text-navy">Profile & settings</h2>
      <div className="dawn-card p-4">
        <p className="font-semibold text-navy">{me.name || "Team member"}</p>
        <p className="text-xs text-muted mt-0.5">Access: {(me.permissions || []).length} permissions granted by your admin</p>
      </div>
      <button onClick={onChangePassword} className="w-full flex items-center gap-2 bg-white border border-navy-line rounded-xl p-4 text-sm font-medium text-navy hover:bg-surface"><KeyRound className="w-4 h-4 text-amber-deep" /> Change password</button>
      {canExport && <a href="/api/team/export" className="w-full flex items-center gap-2 bg-white border border-navy-line rounded-xl p-4 text-sm font-medium text-navy hover:bg-surface"><Download className="w-4 h-4 text-amber-deep" /> Export my data (CSV)</a>}
      <button onClick={onLogout} className="w-full flex items-center gap-2 bg-white border border-navy-line rounded-xl p-4 text-sm font-medium text-red-600 hover:bg-red-50"><LogOut className="w-4 h-4" /> Sign out</button>
    </div>
  );
}

function Spinner() { return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-navy/40" /></div>; }

function LeadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ name: "", phone: "", instagramHandle: "", source: "Instagram DM", notes: "", followUpDate: "" });
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
      <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name *" className="inp" />
      <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" className="inp" />
      <input value={f.instagramHandle} onChange={(e) => setF({ ...f, instagramHandle: e.target.value })} placeholder="Instagram handle" className="inp" />
      <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} className="inp">{["Instagram DM", "WhatsApp", "Referral", "Walk-in", "Website", "Other"].map((s) => <option key={s}>{s}</option>)}</select>
      <div>
        <label className="block text-xs font-semibold text-navy mb-1">Follow up on (optional)</label>
        <input type="date" value={f.followUpDate} onChange={(e) => setF({ ...f, followUpDate: e.target.value })} className="inp" />
      </div>
      <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} placeholder="Notes" className="inp resize-none" />
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
      <select value={contactId} onChange={(e) => { setContactId(e.target.value); setWalkIn(""); }} className="inp">
        <option value="">Select my customer…</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {!contactId && <input value={walkIn} onChange={(e) => setWalkIn(e.target.value)} placeholder="…or walk-in name" className="inp" />}
      <select onChange={(e) => { if (e.target.value) { addLine(e.target.value); e.target.value = ""; } }} className="inp">
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
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="inp">{["Paid", "Pending"].map((s) => <option key={s}>{s}</option>)}</select>
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
        <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" className="inp" />
        <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} placeholder="New password (min 6 chars)" className="inp" />
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
  if (loading) return <Spinner />;
  if (active) return (
    <div className="space-y-3">
      <button onClick={() => { setActive(null); setNote(""); }} className="text-sm text-muted">← All conversations</button>
      <div className="dawn-card p-4 min-h-[300px] flex flex-col">
        <p className="font-semibold text-navy text-sm mb-3">{active.external_username || "Customer"}</p>
        <div className="flex-1 space-y-2 overflow-y-auto max-h-[50vh]">
          {msgs.map((m) => (
            <div key={m.id} className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${m.direction === "out" ? "ml-auto bg-navy text-white" : "bg-surface text-navy"}`}>{m.body}{m.direction === "out" && m.delivered === false && <span className="block text-[12px] text-amber mt-0.5">not delivered</span>}</div>
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
      {convs.length === 0 ? <div className="dawn-card p-10 text-center text-muted text-sm">No conversations yet.</div> : (
        <div className="grid gap-2">
          {convs.map((c) => (
            <button key={c.id} onClick={() => open(c)} className="dawn-card-flat p-4 shadow-card text-left flex items-center justify-between w-full">
              <div className="min-w-0"><p className="font-semibold text-navy text-sm">{c.external_username || "Customer"}</p><p className="text-xs text-muted truncate">{c.last_message_preview || "…"}</p></div>
              {c.unread_count > 0 && <span className="text-[12px] font-bold bg-amber text-navy px-2 py-0.5 rounded-full">{c.unread_count}</span>}
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
        <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-navy">{title}</h3><button aria-label="Close" onClick={onClose} className="btn-icon p-1.5 text-navy/40"><X className="w-5 h-5" /></button></div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function ConfirmSheet({ title, body, onConfirm, onCancel }: { title: string; body: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-5 animate-rise">
        <h3 className="font-semibold text-navy mb-2">{title}</h3>
        <p className="text-sm text-muted mb-4">{body}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 border border-navy-line text-navy font-medium py-2.5 rounded-xl hover:bg-surface">Cancel</button>
          <button onClick={onConfirm} className="flex-1 bg-navy text-white font-medium py-2.5 rounded-xl hover:bg-navy-soft">Confirm</button>
        </div>
      </div>
    </div>
  );
}

function ContactDetail({ id, canEdit, onClose, onEdit }: { id: string; canEdit: boolean; onClose: () => void; onEdit: (c: any) => void }) {
  const state = useApi<any>(`/api/team/contact-detail?id=${id}`, [id]);
  const d = state.data;
  const loading = state.loading;
  const c = d?.contact;
  const wa = (c?.phone || "").replace(/[^0-9]/g, "");
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 animate-rise max-h-[92vh] overflow-y-auto">
        {loading ? <Spinner /> : state.error ? <div className="text-center py-6"><p className="dawn-empty">{state.error}</p><button onClick={state.retry} className="btn btn-quiet btn-sm mt-2">Try again</button></div> : !c ? <p className="dawn-empty">Couldn&apos;t load this contact.</p> : (
          <>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-navy text-lg">{c.name}</h3>
                <p className="text-xs text-muted">{c.stage} · {c.source}</p>
              </div>
              <button aria-label="Close" onClick={onClose} className="btn-icon p-1.5 text-navy/40"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" onClick={() => logOutreach(c.id, "whatsapp")} className="flex items-center gap-1.5 text-xs font-medium bg-emerald-500 text-white px-3 py-2 rounded-xl"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>}
              {c.phone && <a href={`tel:${c.phone}`} onClick={() => logOutreach(c.id, "call")} className="flex items-center gap-1.5 text-xs font-medium border border-navy-line text-navy px-3 py-2 rounded-xl"><Phone className="w-3.5 h-3.5" /> Call</a>}
              {canEdit && <button onClick={() => onEdit(c)} className="flex items-center gap-1.5 text-xs font-medium border border-navy-line text-navy px-3 py-2 rounded-xl ml-auto"><Pencil className="w-3.5 h-3.5" /> Edit</button>}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {c.phone && <Field label="Phone" value={c.phone} />}
              {c.instagram_handle && <Field label="Instagram" value={"@" + c.instagram_handle} />}
              {c.follow_up_date && <Field label="Follow up" value={new Date(c.follow_up_date).toLocaleDateString()} />}
              {d.ltv != null && <Field label="Collected" value={`₹${d.ltv}`} />}
              {d.outstanding != null && d.outstanding > 0 && <Field label="Outstanding" value={`₹${d.outstanding}`} />}
            </div>

            {c.notes && <div className="bg-surface rounded-xl p-3 mb-4"><p className="text-[12px] uppercase tracking-wide text-muted mb-1">Notes</p><p className="text-sm text-navy whitespace-pre-wrap">{c.notes}</p></div>}
            {c.lost_reason && <div className="bg-red-50 rounded-xl p-3 mb-4"><p className="text-[12px] uppercase tracking-wide text-red-500 mb-1">Lost reason</p><p className="text-sm text-navy">{c.lost_reason}</p></div>}

            {d.orders?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-navy mb-2">Orders ({d.orders.length})</p>
                <div className="space-y-1.5">
                  {d.orders.map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
                      <span className="text-xs text-navy">{new Date(o.date).toLocaleDateString()} · {(o.items || []).length} item(s)</span>
                      <span className="text-[12px] font-bold uppercase text-muted">{o.order_status || "Placed"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-navy mb-2">History</p>
              {d.activities?.length === 0 ? <p className="text-xs text-muted">Nothing logged yet.</p> : (
                <div className="space-y-2">
                  {d.activities.map((a: any) => (
                    <div key={a.id} className="border-l-2 border-navy-line pl-3">
                      <p className="text-sm text-navy">{a.content}</p>
                      <p className="text-[12px] text-muted">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="bg-surface rounded-lg px-3 py-2"><p className="text-[12px] uppercase tracking-wide text-muted">{label}</p><p className="text-sm text-navy truncate">{value}</p></div>;
}


// The People tab is the shared search, presented as a tab rather than a
// keyboard shortcut — most employees will never think to press a hotkey.
function PeopleTab() {
  const [open, setOpen] = useState(true);
  return open
    ? <PeopleSearch onClose={() => setOpen(false)} />
    : (
      <div className="dawn-card p-6 text-center">
        <button onClick={() => setOpen(true)} className="btn btn-primary">Find a colleague</button>
      </div>
    );
}


// A compact answer to "am I punched in, and what's waiting on me?" — the two
// things every employee opens the portal for, whatever else their job involves.
