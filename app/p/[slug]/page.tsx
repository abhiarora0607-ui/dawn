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
    const itemsRes = await fetch(`${url}/rest/v1/catalog_items?uid=eq.${sf.uid}&is_active=eq.true&deleted_at=is.null&order=sort_order.asc`, { headers: h, cache: "no-store" });
    const items = await itemsRes.json();
    return { sf, items: Array.isArray(items) ? items : [] };
  } catch { return null; }
}

// Shared links look professional on WhatsApp/Instagram: title + logo preview.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await getData(params.slug);
  const name = data?.sf?.business_name || "Price List";
  return {
    title: `${name} — Menu & Prices`,
    description: `Browse ${name}'s items and prices. Message to order.`,
    openGraph: {
      title: name,
      description: "Menu & prices — tap to browse.",
      images: data?.sf?.logo_url ? [data.sf.logo_url] : [],
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

  const { sf, items } = data;
  const currency = sf.currency || "₹";
  const wa = (sf.whatsapp || sf.phone || "").replace(/[^0-9]/g, "");
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
        <div className="relative max-w-md mx-auto px-6 pt-12 pb-10 text-center">
          {sf.logo_url ? (
            <img src={sf.logo_url} alt="" className="w-24 h-24 rounded-full object-cover mx-auto ring-4 ring-white/15 shadow-2xl" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-white/10 ring-4 ring-white/15 mx-auto flex items-center justify-center text-3xl font-display">{(sf.business_name || "•").slice(0, 1)}</div>
          )}
          <h1 className="font-display font-semibold text-3xl mt-4 tracking-tight">{sf.business_name || "Price List"}</h1>
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-amber/90 font-semibold">
            <span className="w-5 h-px bg-amber/60" /> Menu &amp; Prices <span className="w-5 h-px bg-amber/60" />
          </div>
          {(sf.phone || sf.whatsapp) && <p className="text-white/50 text-sm mt-3">{sf.whatsapp || sf.phone}</p>}
        </div>
        {/* soft curve into the page */}
        <div className="h-6 bg-[#F7F5F0] rounded-t-[24px]" />
      </header>

      {/* ---------- CATEGORY CHIPS (only when several) ---------- */}
      {catNames.length > 1 && (
        <nav className="sticky top-0 z-10 bg-[#F7F5F0]/95 backdrop-blur border-b border-navy/5">
          <div className="max-w-md mx-auto px-4 py-2.5 flex gap-2 overflow-x-auto dawn-scroll">
            {catNames.map((c) => (
              <a key={c} href={`#${anchor(c)}`} className="shrink-0 text-xs font-semibold text-navy/70 bg-white border border-navy/10 px-3.5 py-1.5 rounded-full hover:border-amber hover:text-navy transition-colors">{c}</a>
            ))}
          </div>
        </nav>
      )}

      {/* ---------- THE MENU ---------- */}
      <div className={`max-w-md mx-auto px-4 pt-6 space-y-8 ${wa ? "pb-28" : "pb-10"}`}>
        {items.length === 0 ? (
          <p className="text-center text-muted py-12">No items to show yet.</p>
        ) : (
          Object.entries(cats).map(([cat, list]) => (
            <section key={cat} id={anchor(cat)} className="scroll-mt-16">
              <div className="flex items-center gap-3 mb-3.5">
                <h2 className="font-display font-semibold text-navy text-xl">{cat}</h2>
                <span className="flex-1 h-px bg-navy/10" />
                <span className="text-[11px] text-navy/40 font-medium">{list.length}</span>
              </div>
              <div className="space-y-3">
                {list.map((it) => {
                  const img = Array.isArray(it.images) && it.images[0];
                  return (
                    <div key={it.id} className="bg-white rounded-2xl border border-navy/[0.07] shadow-[0_2px_12px_rgba(22,35,63,0.06)] overflow-hidden">
                      <div className="flex gap-3.5 p-4">
                        {img && <img src={img} alt="" className="w-[76px] h-[76px] rounded-xl object-cover shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-navy leading-snug">{it.name}</p>
                            <div className="text-right shrink-0">
                              {it.price != null && <p className="text-lg font-bold text-navy leading-none">{currency}{it.price}</p>}
                              {it.compare_at_price != null && <p className="text-xs text-navy/35 line-through mt-0.5">{currency}{it.compare_at_price}</p>}
                            </div>
                          </div>
                          {it.description && <p className="text-xs text-navy/50 leading-relaxed mt-1 line-clamp-2">{it.description}</p>}
                          {it.unit && <p className="text-[11px] text-navy/40 mt-1">{it.unit}</p>}
                          {it.variants?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {it.variants.map((v: any, i: number) => (
                                <span key={i} className="text-[11px] font-medium bg-[#F7F5F0] text-navy/60 border border-navy/[0.06] px-2.5 py-1 rounded-full">{v.name} · {currency}{v.price}</span>
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
          {sf.gst_number && <p className="text-[11px] text-navy/35">GST: {sf.gst_number}</p>}
          <a href="/" className="inline-flex items-center gap-1.5 text-[11px] text-navy/30 hover:text-navy/50">
            <DawnLogo className="h-5 opacity-60" /> <span>Powered by Dawn</span>
          </a>
        </footer>
      </div>

      {/* ---------- STICKY ORDER BAR ---------- */}
      {wa && (
        <div className="fixed bottom-0 inset-x-0 z-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#F7F5F0] via-[#F7F5F0]/95 to-transparent">
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${sf.business_name || ""}! I'd like to place an order.`)}`} target="_blank"
            className="max-w-md mx-auto flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3.5 rounded-2xl shadow-[0_8px_24px_rgba(16,185,129,0.35)] transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.2 1.1-1.7 1.2-.5 0-1 .2-3.4-.7-2.9-1.1-4.7-4-4.9-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c0 .2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.3 1.4 2.6 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.4 0 .1 0 .8-.2 1.5Z"/></svg>
            Message us to order
          </a>
        </div>
      )}
    </main>
  );
}
