// app/p/[slug]/page.tsx
// Public, read-only, mobile-first price list. No auth. Grouped by category
// with WhatsApp enquiry buttons per item.

import { DawnLogo } from "@/components/DawnLogo";

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
    const itemsRes = await fetch(`${url}/rest/v1/catalog_items?uid=eq.${sf.uid}&is_active=eq.true&order=sort_order.asc`, { headers: h, cache: "no-store" });
    const items = await itemsRes.json();
    return { sf, items: Array.isArray(items) ? items : [] };
  } catch { return null; }
}

export default async function PublicList({ params }: { params: { slug: string } }) {
  const data = await getData(params.slug);

  if (!data) {
    return (
      <main className="min-h-screen bg-cream flex items-center justify-center p-6">
        <p className="text-muted">This price list isn&apos;t available.</p>
      </main>
    );
  }

  const { sf, items } = data;
  const currency = sf.currency || "₹";
  const wa = (sf.whatsapp || sf.phone || "").replace(/[^0-9]/g, "");
  const cats: Record<string, any[]> = {};
  for (const it of items) { const c = it.category || "Menu"; (cats[c] = cats[c] || []).push(it); }

  return (
    <main className="min-h-screen bg-cream">
      <header className="bg-navy text-white px-5 py-8 text-center">
        {sf.logo_url ? <img src={sf.logo_url} alt="" className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3" /> : null}
        <h1 className="font-display font-semibold text-2xl">{sf.business_name || "Price List"}</h1>
        {(sf.phone || sf.whatsapp) && <p className="text-white/60 text-sm mt-1">{sf.whatsapp || sf.phone}</p>}
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {items.length === 0 ? (
          <p className="text-center text-muted py-12">No items to show yet.</p>
        ) : (
          Object.entries(cats).map(([cat, list]) => (
            <section key={cat}>
              <h2 className="font-display font-semibold text-navy text-lg mb-3">{cat}</h2>
              <div className="space-y-2.5">
                {list.map((it) => (
                  <div key={it.id} className="bg-white rounded-2xl border border-navy-line p-4 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {it.images?.[0] && <img src={it.images[0]} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />}
                        <div className="min-w-0">
                        <p className="font-semibold text-navy">{it.name}</p>
                        {it.description && <p className="text-xs text-muted leading-snug mt-0.5">{it.description}</p>}
                        <div className="flex items-baseline gap-2 mt-1.5">
                          {it.price != null && <span className="text-lg font-bold text-navy">{currency}{it.price}</span>}
                          {it.compare_at_price != null && <span className="text-sm text-muted line-through">{currency}{it.compare_at_price}</span>}
                          <span className="text-xs text-muted">{it.unit}</span>
                        </div>
                        {it.variants?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {it.variants.map((v: any, i: number) => <span key={i} className="text-[11px] bg-navy/5 text-navy/60 px-2 py-0.5 rounded-full">{v.name} {currency}{v.price}</span>)}
                          </div>
                        )}
                        </div>
                      </div>
                      {wa && (
                        <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi! I'm interested in ${it.name}`)}`} target="_blank"
                          className="shrink-0 text-xs font-semibold bg-emerald-500 text-white px-3 py-2 rounded-xl hover:bg-emerald-600 transition-colors">
                          Enquire
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <footer className="py-6 text-center">
        <a href="/" className="inline-flex items-center gap-1.5 text-xs text-muted">
          <DawnLogo className="h-6" /> <span>Powered by Dawn</span>
        </a>
      </footer>
    </main>
  );
}
