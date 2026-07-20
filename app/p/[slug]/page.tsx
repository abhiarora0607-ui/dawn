// app/p/[slug]/page.tsx
// The business's public face: a branded, mobile-first showcase / menu card.
// No auth, opens forever, designed to be shared on Instagram bios and printed
// as a QR target. The business's logo (circular), name and colors lead; Dawn
// steps back to a whisper at the bottom.

import { DawnLogo } from "@/components/DawnLogo";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

async function getData(slug: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const sfRes = await fetch(`${url}/rest/v1/storefront?slug=eq.${slug}&select=*&limit=1`, { headers: h, cache: "no-store" });
    const sf = (await sfRes.json())?.[0];
    if (!sf) return null;
    const [itemsRes, setRes] = await Promise.all([
      fetch(`${url}/rest/v1/catalog_items?uid=eq.${sf.uid}&is_active=eq.true&deleted_at=is.null&order=sort_order.asc`, { headers: h, cache: "no-store" }),
      // GST lives in business_settings (storefront has no such column); also a
      // fallback source for name/logo if the mirror is ever stale.
      fetch(`${url}/rest/v1/business_settings?uid=eq.${sf.uid}&select=business_name,logo_url,phone,whatsapp,gst_number&limit=1`, { headers: h, cache: "no-store" }),
    ]);
    const items = await itemsRes.json();
    const settings = (await setRes.json().catch(() => []))?.[0] || null;
    // Count the view (kind + uid only — no visitor identity; privacy wall intact).
    try {
      await fetch(`${url}/rest/v1/events`, {
        method: "POST", headers: { ...h, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ uid: sf.uid, kind: "pricelist_view" }),
      });
    } catch {}
    return { sf, settings, items: Array.isArray(items) ? items : [] };
  } catch { return null; }
}

// Shared links look professional on WhatsApp/Instagram: title + logo preview.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await getData(params.slug);
  const name = data?.sf?.business_name || (data as any)?.settings?.business_name || "Price List";
  return {
    title: `${name} — Menu & Prices`,
    description: `Browse ${name}'s items and prices. Message to order.`,
    openGraph: {
      title: name,
      description: "Menu & prices — tap to browse.",
      images: (data?.sf?.logo_url || (data as any)?.settings?.logo_url) ? [data?.sf?.logo_url || (data as any)?.settings?.logo_url] : [],
    },
  };
}

export default async function PublicList({ params }: { params: { slug: string } }) {
  const data = await getData(params.slug);

  if (!data) {
    return (
      <main className="min-h-screen dawn-app-bg flex items-center justify-center p-6">
        <p className="text-muted">This price list isn&apos;t available.</p>
      </main>
    );
  }

  const { sf, settings, items } = data as any;
  const bizName = sf.business_name || settings?.business_name || "Price List";
  const logo = sf.logo_url || settings?.logo_url || null;
  const gst = settings?.gst_number || sf.gst_number || null;
  const currency = sf.currency || "₹";
  const wa = (sf.whatsapp || sf.phone || settings?.whatsapp || settings?.phone || "").replace(/[^0-9]/g, "");
  const cats: Record<string, any[]> = {};
  for (const it of items) { const c = it.category || "Menu"; (cats[c] = cats[c] || []).push(it); }
  const catNames = Object.keys(cats);
  const anchor = (c: string) => c.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <main className="min-h-screen bg-[#F7F5F0]">
      {/* ---------- HERO: the brand leads ---------- */}
      <header className="relative overflow-hidden bg-navy text-white">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(600px 260px at 85% -10%, rgba(255,158,67,0.22), transparent 60%), radial-gradient(400px 200px at 0% 110%, rgba(255,158,67,0.10), transparent 60%)" }} />
        <div className="relative max-w-lg mx-auto px-6 pt-14 pb-11 text-center">
          {logo ? (
            <span className="inline-block rounded-full p-1.5 bg-white/10 ring-1 ring-white/20 shadow-2xl">
              <img src={logo} alt="" className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover ring-2 ring-white/30" />
            </span>
          ) : (
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-white/10 ring-4 ring-white/20 mx-auto flex items-center justify-center text-4xl font-display text-amber">{(bizName || "•").slice(0, 1)}</div>
          )}
          <h1 className="font-display font-semibold text-[32px] sm:text-4xl mt-5 tracking-tight">{bizName}</h1>
          <div className="mt-2.5 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-amber/90 font-semibold">
            <span className="w-7 h-px bg-amber/60" /> Menu &amp; Prices <span className="w-7 h-px bg-amber/60" />
          </div>
          {(sf.phone || sf.whatsapp || settings?.phone) && <p className="text-white/50 text-sm mt-3.5">{sf.whatsapp || sf.phone || settings?.phone}</p>}
        </div>
        {/* soft curve into the page */}
        <div className="h-6 bg-[#F7F5F0] rounded-t-[24px]" />
      </header>

      {/* ---------- CATEGORY CHIPS (only when several) ---------- */}
      {catNames.length > 1 && (
        <nav className="sticky top-0 z-10 bg-[#F7F5F0]/95 backdrop-blur border-b border-navy/5">
          <div className="max-w-lg mx-auto px-4 py-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {catNames.map((c) => (
              <a key={c} href={`#${anchor(c)}`} className="shrink-0 text-[13px] font-semibold text-navy/70 bg-white border border-navy/10 px-4 py-2 rounded-full shadow-[0_1px_4px_rgba(22,35,63,0.05)] hover:border-amber hover:text-navy transition-colors">{c}</a>
            ))}
          </div>
        </nav>
      )}

      {/* ---------- THE MENU ---------- */}
      <div className={`max-w-lg mx-auto px-4 pt-7 space-y-9 ${wa ? "pb-28" : "pb-10"}`}>
        {items.length === 0 ? (
          <p className="text-center text-muted py-12">No items to show yet.</p>
        ) : (
          Object.entries(cats).map(([cat, list]) => (
            <section key={cat} id={anchor(cat)} className="scroll-mt-16">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="font-display font-semibold text-navy text-[22px]">{cat}</h2>
                <span className="flex-1 h-px bg-navy/10" />
                <span className="text-[12px] font-semibold text-navy/45 bg-white border border-navy/10 px-2.5 py-1 rounded-full">{list.length} item{list.length > 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-3">
                {list.map((it) => {
                  const img = Array.isArray(it.images) && it.images[0];
                  return (
                    <div key={it.id} className="bg-white rounded-2xl border border-navy/[0.07] shadow-[0_2px_12px_rgba(22,35,63,0.06)] hover:shadow-[0_6px_22px_rgba(22,35,63,0.10)] transition-shadow overflow-hidden">
                      <div className="flex gap-3.5 p-4">
                        {img ? (
                          <img src={img} alt="" className="w-[84px] h-[84px] rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className="w-[52px] h-[52px] rounded-xl bg-gradient-to-br from-amber/15 to-amber/[0.04] border border-amber/20 flex items-center justify-center font-display text-lg text-amber-deep shrink-0">{(it.name || "•").slice(0, 1)}</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold text-navy text-[15px] leading-snug">{it.name}</p>
                            <div className="text-right shrink-0">
                              {it.price != null && <p className="text-[19px] font-bold text-navy leading-none">{currency}{it.price}</p>}
                              {it.compare_at_price != null && <p className="text-xs text-navy/35 line-through mt-1">{currency}{it.compare_at_price}</p>}
                              {it.unit && <p className="text-[12px] text-navy/40 mt-1">{it.unit}</p>}
                            </div>
                          </div>
                          {it.description && <p className="text-xs text-navy/50 leading-relaxed mt-1 line-clamp-2">{it.description}</p>}
                          {it.variants?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {it.variants.map((v: any, i: number) => (
                                <span key={i} className="text-[12px] font-medium bg-[#F7F5F0] text-navy/60 border border-navy/[0.06] px-2.5 py-1 rounded-full">{v.name} · {currency}{v.price}</span>
                              ))}
                            </div>
                          )}
                          {wa && (
                            <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi! I'm interested in ${it.name}`)}`} target="_blank"
                              className="inline-flex items-center gap-1.5 mt-2.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.2 1.1-1.7 1.2-.5 0-1 .2-3.4-.7-2.9-1.1-4.7-4-4.9-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c0 .2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.3 1.4 2.6 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.4 0 .1 0 .8-.2 1.5Z"/></svg>
                              Enquire
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}

        <footer className="pt-2 text-center space-y-3">
          {gst && <p className="text-[12px] text-navy/35">GSTIN: {gst}</p>}
          <a href="/" className="inline-flex items-center gap-1.5 text-[12px] text-navy/30 hover:text-navy/50">
            <a href={`/?ref=${encodeURIComponent(sf.slug || "")}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 hover:opacity-100 opacity-70 transition-opacity">
              <DawnLogo className="h-5" /> <span>Powered by Dawn</span>
            </a>
          </a>
        </footer>
      </div>

      {/* ---------- STICKY ORDER BAR ---------- */}
      {wa && (
        <div className="fixed bottom-0 inset-x-0 z-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#F7F5F0] via-[#F7F5F0]/95 to-transparent">
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${bizName}! I'd like to place an order.`)}`} target="_blank"
            className="max-w-lg mx-auto flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3.5 rounded-2xl shadow-[0_8px_24px_rgba(16,185,129,0.35)] transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.2 1.1-1.7 1.2-.5 0-1 .2-3.4-.7-2.9-1.1-4.7-4-4.9-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c0 .2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.3 1.4 2.6 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.4 0 .1 0 .8-.2 1.5Z"/></svg>
            Message us to order
          </a>
        </div>
      )}
    </main>
  );
}
