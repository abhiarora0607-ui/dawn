"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { ToastProvider, useToast, ConfirmDialog } from "@/components/Toast";
import { useSettings } from "@/lib/use-settings";
import {
  Loader2, Plus, Search, Tag, Package, Wrench, X, Copy, Trash2, Eye, EyeOff, Pencil, ExternalLink, Upload,
} from "lucide-react";

type Variant = { name: string; price: string };
type Item = {
  id: string; type: string; name: string; description: string; category: string;
  price: number | null; compare_at_price: number | null; unit: string; sku: string;
  variants: Variant[]; is_active: boolean; is_public: boolean; images?: string[];
};

const UNITS = ["per item", "per hour", "per session", "per day", "per month", "per project", "custom"];

function ItemModal({ item, onClose, onSaved }: { item: Item | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<any>(item || { type: "product", name: "", description: "", category: "", price: "", cost: "", compareAtPrice: "", unit: "per item", sku: "", variants: [], isActive: true, isPublic: true });
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  async function uploadImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingImg(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: reader.result }) });
        const d = await res.json();
        if (d.url) { set("images", [d.url]); toast("Photo uploaded"); }
        else toast(d.error || "Upload failed", "error");
      } catch { toast("Upload error", "error"); }
      setUploadingImg(false);
    };
    reader.readAsDataURL(file);
  }

  function set(k: string, v: any) { setF((p: any) => ({ ...p, [k]: v })); }
  function addVariant() { set("variants", [...(f.variants || []), { name: "", price: "" }]); }
  function setVariant(i: number, k: string, v: string) {
    const arr = [...(f.variants || [])]; arr[i] = { ...arr[i], [k]: v }; set("variants", arr);
  }

  async function save() {
    if (!f.name?.trim()) { toast("Name is required.", "error"); return; }
    if (f.price !== "" && Number(f.price) < 0) { toast("Price can't be negative.", "error"); return; }
    setSaving(true);
    const payload = {
      ...(item?.id ? { id: item.id } : {}),
      type: f.type, name: f.name.trim(), description: f.description, category: f.category?.trim() || "",
      price: f.price === "" ? null : Number(f.price),
      cost: f.cost === "" || f.cost == null ? 0 : Number(f.cost),
      compareAtPrice: f.compareAtPrice === "" || f.compareAtPrice == null ? null : Number(f.compareAtPrice),
      unit: f.unit, sku: f.sku,
      variants: (f.variants || []).filter((v: Variant) => v.name?.trim()),
      isActive: f.isActive, isPublic: true,
    };
    try {
      const res = await fetch("/api/catalog", { method: item?.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) { toast(item?.id ? "Item updated" : "Item added"); onSaved(); onClose(); }
      else { const d = await res.json(); toast(d.error || "Save failed", "error"); }
    } catch { toast("Network error", "error"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto animate-rise">
        <div className="sticky top-0 bg-white border-b border-navy-line px-5 py-4 flex items-center justify-between">
          <h3 className="font-semibold text-navy">{item?.id ? "Edit item" : "Add item"}</h3>
          <button onClick={onClose} className="p-1.5 text-navy/40 hover:text-navy"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            {["product", "service"].map((t) => (
              <button key={t} onClick={() => set("type", t)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border capitalize ${f.type === t ? "border-amber bg-amber/5 text-navy" : "border-navy-line text-muted"}`}>
                {t === "product" ? <Package className="w-4 h-4" /> : <Wrench className="w-4 h-4" />} {t}
              </button>
            ))}
          </div>

          <Field label="Name *"><input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Cold-pressed green juice" className="inp" /></Field>
          <Field label="Description"><textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Short description" className="inp resize-none" /></Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price"><input type="number" min="0" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="0" className="inp" /></Field>
            <Field label="Cost (your cost)"><input type="number" min="0" value={f.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0" className="inp" /></Field>
          </div>
          <Field label="Compare-at price (optional)"><input type="number" min="0" value={f.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} placeholder="strikethrough price" className="inp" /></Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit"><select value={f.unit} onChange={(e) => set("unit", e.target.value)} className="inp">{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
            <Field label="Category"><input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Juices" className="inp" /></Field>
          </div>

          <Field label="SKU / code (optional)"><input value={f.sku} onChange={(e) => set("sku", e.target.value)} placeholder="optional" className="inp" /></Field>

          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">Photo (optional)</label>
            <div className="flex items-center gap-3">
              {f.images?.[0] ? (
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-navy-line shrink-0">
                  <img src={f.images[0]} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => set("images", [])} className="absolute top-0 right-0 bg-navy/70 text-white p-0.5 rounded-bl-lg"><X className="w-3 h-3" /></button>
                </div>
              ) : null}
              <label className="cursor-pointer flex items-center gap-2 text-sm font-medium border border-navy-line px-4 py-2 rounded-xl hover:bg-surface">
                {uploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {f.images?.[0] ? "Replace" : "Upload"}
                <input type="file" accept="image/*" onChange={uploadImg} className="hidden" />
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-navy">Variants (optional)</label>
              <button onClick={addVariant} className="text-xs font-medium text-amber-deep">+ Add variant</button>
            </div>
            {(f.variants || []).map((v: Variant, i: number) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={v.name} onChange={(e) => setVariant(i, "name", e.target.value)} placeholder="e.g. Large" className="inp flex-1" />
                <input type="number" min="0" value={v.price} onChange={(e) => setVariant(i, "price", e.target.value)} placeholder="price" className="inp w-24" />
              </div>
            ))}
          </div>

          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-navy cursor-pointer">
              <input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active (visible on your public price list)
            </label>
          </div>

          <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {item?.id ? "Save changes" : "Add item"}
          </button>
        </div>
      </div>
      <style jsx>{`.inp{width:100%;padding:0.6rem 0.75rem;border:1px solid #E4E8F0;border-radius:0.75rem;font-size:0.875rem;color:#16233F;outline:none}.inp:focus{border-color:#FF9E43}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-semibold text-navy mb-1.5">{label}</label>{children}</div>;
}

function PriceListInner() {
  const { data } = useBrief();
  const { toast } = useToast();
  const { currency } = useSettings();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(true);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");
  const [modal, setModal] = useState<{ open: boolean; item: Item | null }>({ open: false, item: null });
  const [confirm, setConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  function load() {
    setLoading(true);
    fetch("/api/catalog").then((r) => r.json()).then((d) => { setItems(d.items || []); setAuthed(d.authed); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const categories = ["All", ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))];
  const filtered = items.filter((i) =>
    (cat === "All" || i.category === cat) &&
    (i.name.toLowerCase().includes(query.toLowerCase()) || (i.description || "").toLowerCase().includes(query.toLowerCase()))
  );

  async function duplicate(item: Item) {
    const { id, ...rest } = item as any;
    await fetch("/api/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...rest, name: item.name + " (copy)", compareAtPrice: item.compare_at_price, isActive: item.is_active, isPublic: item.is_public }) });
    toast("Item duplicated"); load();
  }
  async function toggleActive(item: Item) {
    await fetch("/api/catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, isActive: !item.is_active }) });
    load();
  }
  async function doDelete() {
    if (!confirm.id) return;
    await fetch(`/api/catalog?id=${confirm.id}`, { method: "DELETE" });
    toast("Item deleted"); setConfirm({ open: false, id: null }); load();
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Price List" />
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display font-semibold text-2xl text-navy">Price List</h1>
            <p className="text-muted text-sm mt-1">Your products &amp; services — share them anywhere.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <a href="/api/catalog/export" className="hidden sm:flex items-center gap-2 text-sm font-medium border border-navy-line text-navy px-4 py-2 rounded-xl hover:bg-surface">Export</a>
            <button onClick={() => setModal({ open: true, item: null })} className="flex items-center gap-2 bg-navy text-white font-medium px-4 py-2 rounded-xl hover:bg-navy-soft transition-colors">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add item</span>
            </button>
          </div>
        </div>

        {!loading && items.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 border border-navy-line rounded-xl px-3 flex-1 bg-white">
              <Search className="w-4 h-4 text-navy/40" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items…" className="flex-1 py-2.5 text-sm text-navy focus:outline-none" />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {categories.map((c) => (
                <button key={c} onClick={() => setCat(c)} className={`text-sm font-medium px-3 py-2 rounded-xl whitespace-nowrap ${cat === c ? "bg-navy text-white" : "bg-white border border-navy-line text-muted"}`}>{c}</button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid gap-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl skeleton" />)}</div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-navy-line p-12 text-center shadow-card">
            <div className="w-14 h-14 rounded-2xl bg-amber/15 flex items-center justify-center mx-auto mb-4"><Tag className="w-7 h-7 text-amber-deep" /></div>
            <h2 className="text-lg font-semibold text-navy mb-2">No items yet</h2>
            <p className="text-muted text-sm max-w-sm mx-auto mb-5">Add your first product or service. You&apos;ll get a shareable price list you can send to customers.</p>
            <button onClick={() => setModal({ open: true, item: null })} className="inline-flex items-center gap-2 bg-navy text-white font-medium px-5 py-2.5 rounded-xl hover:bg-navy-soft">
              <Plus className="w-4 h-4" /> Add your first item
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((item) => (
              <div key={item.id} className={`bg-white rounded-2xl border border-navy-line p-4 shadow-card ${!item.is_active ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  {item.images?.[0] && <img src={item.images[0]} alt="" className="w-14 h-14 rounded-xl object-cover border border-navy-line shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase bg-navy/5 text-navy/60 px-1.5 py-0.5 rounded flex items-center gap-1">
                        {item.type === "service" ? <Wrench className="w-3 h-3" /> : <Package className="w-3 h-3" />}{item.type}
                      </span>
                      {item.category && <span className="text-[10px] text-muted">{item.category}</span>}
                      
                    </div>
                    <p className="font-semibold text-navy mt-1">{item.name}</p>
                    {item.description && <p className="text-xs text-muted leading-snug mt-0.5 line-clamp-2">{item.description}</p>}
                    <div className="flex items-baseline gap-2 mt-1.5">
                      {item.price != null && <span className="text-lg font-bold text-navy">{currency}{item.price}</span>}
                      {item.compare_at_price != null && <span className="text-sm text-muted line-through">{currency}{item.compare_at_price}</span>}
                      <span className="text-xs text-muted">{item.unit}</span>
                    </div>
                    {item.variants?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.variants.map((v, i) => <span key={i} className="text-[11px] bg-navy/5 text-navy/60 px-2 py-0.5 rounded-full">{v.name} {currency}{v.price}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex gap-1">
                      <button onClick={() => setModal({ open: true, item })} className="p-1.5 text-navy/40 hover:text-navy" title="Edit"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => duplicate(item)} className="p-1.5 text-navy/40 hover:text-navy" title="Duplicate"><Copy className="w-4 h-4" /></button>
                      <button onClick={() => toggleActive(item)} className="p-1.5 text-navy/40 hover:text-navy" title={item.is_active ? "Hide" : "Show"}>{item.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
                      <button onClick={() => setConfirm({ open: true, id: item.id })} className="p-1.5 text-navy/40 hover:text-red-500" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <a href="/api/catalog/share" target="_blank" className="flex items-center justify-center gap-2 text-sm font-medium text-amber-deep py-2">
            <ExternalLink className="w-4 h-4" /> Preview your public price list
          </a>
        )}
      </div>

      {modal.open && <ItemModal item={modal.item} onClose={() => setModal({ open: false, item: null })} onSaved={load} />}
      <ConfirmDialog open={confirm.open} title="Delete this item?" body="This can't be undone." onConfirm={doDelete} onCancel={() => setConfirm({ open: false, id: null })} />
    </DashboardShell>
  );
}

export default function PriceList() {
  return <ToastProvider><PriceListInner /></ToastProvider>;
}
