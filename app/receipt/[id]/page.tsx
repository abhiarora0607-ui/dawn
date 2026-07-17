// app/receipt/[id]/page.tsx
// The customer-facing receipt — designed like a real ticket, branded with the
// business's circular logo and Dawn's navy/amber system. Renders its own HTML
// (outside the app layout), so everything is inline styles + a Google Fonts
// link; no Tailwind exists here. Print-optimized: shadows and buttons drop
// away, the ticket prints clean on white.

export const dynamic = "force-dynamic";

import { ReceiptSend } from "@/components/ReceiptSend";
import { PrintButton } from "@/components/PrintButton";

// The [id] segment is the SHARE TOKEN, not the internal order id. Tokens are
// permanent — a customer's receipt link works forever, no login, no expiry.
async function getSale(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const sRes = await fetch(`${url}/rest/v1/sales?share_token=eq.${encodeURIComponent(token)}&select=*&limit=1`, { headers: h, cache: "no-store" });
    const sale = (await sRes.json())?.[0];
    if (!sale) return null;
    let contact = null, store = null;
    if (sale.contact_id) {
      const c = await fetch(`${url}/rest/v1/contacts?id=eq.${sale.contact_id}&select=name,phone&limit=1`, { headers: h, cache: "no-store" }).then((r) => r.json());
      contact = c?.[0] || null;
    }
    const [sf, st] = await Promise.all([
      fetch(`${url}/rest/v1/storefront?uid=eq.${sale.uid}&select=*&limit=1`, { headers: h, cache: "no-store" }).then((r) => r.json()),
      // GST + address live in business_settings, not storefront.
      fetch(`${url}/rest/v1/business_settings?uid=eq.${sale.uid}&select=business_name,logo_url,phone,gst_number,address&limit=1`, { headers: h, cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    store = sf?.[0] || null;
    const settings = st?.[0] || null;
    return { sale, contact, store, settings };
  } catch { return null; }
}

const NAVY = "#16233F", MUTED = "#5B6478", SOFT = "#8A92A6", LINE = "#EEF1F7", PAGE = "#F4F2ED";

export default async function Receipt({ params, searchParams }: { params: { id: string }; searchParams: { owner?: string } }) {
  const data = await getSale(params.id);
  if (!data) {
    return (
      <html><head><title>Receipt</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body style={{ margin: 0, background: PAGE, fontFamily: "Inter, system-ui, sans-serif", color: NAVY }}>
        <main style={{ maxWidth: 420, margin: "0 auto", padding: "80px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 15, color: MUTED }}>This receipt isn&apos;t available.</p>
        </main>
      </body></html>
    );
  }

  const { sale, contact, store, settings } = data as any;
  const currency = store?.currency || "₹";
  const logo = store?.logo_url || settings?.logo_url || null;
  const phone = store?.phone || settings?.phone || null;
  const gst = settings?.gst_number || store?.gst_number || null;
  const address = settings?.address || null;
  const isOwner = searchParams?.owner === "1";
  const cancelled = sale.order_status === "Cancelled";
  const date = new Date(sale.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const bizName = store?.business_name || settings?.business_name || "Receipt";
  const initial = (bizName || "R").trim().charAt(0).toUpperCase();
  const items: any[] = sale.items || [];
  const balance = Number(sale.balance) || 0;
  const statusStyle = cancelled
    ? { bg: "#FEE2E2", fg: "#991B1B", label: "CANCELLED" }
    : sale.status === "paid"
    ? { bg: "#D1FAE5", fg: "#065F46", label: "PAID" }
    : sale.status === "partial"
    ? { bg: "#FEF3C7", fg: "#92400E", label: "PARTIALLY PAID" }
    : { bg: "#FEE2E2", fg: "#991B1B", label: "PAYMENT PENDING" };

  return (
    <html>
      <head>
        <title>{`Receipt · ${bizName}`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, background: PAGE, fontFamily: "'Inter', system-ui, sans-serif", color: NAVY, WebkitFontSmoothing: "antialiased" } as any}>
        <div style={{ maxWidth: 430, margin: "0 auto", padding: "18px 14px 44px" }}>
          <PrintButton />

          {/* ------------------------------------------------ THE TICKET */}
          <div className="rcard" style={{ borderRadius: 22, boxShadow: "0 14px 40px rgba(22,35,63,.14)", position: "relative" }}>

            {/* Branded header */}
            <div style={{ background: "linear-gradient(140deg, #16233F 0%, #1E2E52 100%)", borderRadius: "22px 22px 0 0", padding: "30px 24px 24px", textAlign: "center", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -70, right: -50, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,158,67,.20), transparent 65%)" }} />
              <div style={{ position: "absolute", bottom: -90, left: -60, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,158,67,.10), transparent 65%)" }} />

              {logo ? (
                <img src={logo} alt="" style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,.3)", boxShadow: "0 6px 20px rgba(0,0,0,.3)", position: "relative", display: "block", margin: "0 auto" }} />
              ) : (
                <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(255,255,255,.12)", border: "3px solid rgba(255,255,255,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces', serif", fontSize: 36, fontWeight: 600, color: "#FF9E43", position: "relative", margin: "0 auto" }}>{initial}</div>
              )}

              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 23, fontWeight: 600, color: "#fff", margin: "12px 0 2px", position: "relative", letterSpacing: ".2px" }}>{bizName}</h1>
              {phone && <p style={{ fontSize: 13, color: "rgba(255,255,255,.65)", margin: 0, position: "relative" }}>{phone}</p>}
              {address && <p style={{ fontSize: 11.5, color: "rgba(255,255,255,.5)", margin: "3px auto 0", position: "relative", maxWidth: 300 }}>{address}</p>}
              {gst && <p style={{ fontSize: 11, color: "rgba(255,255,255,.55)", margin: "5px 0 0", position: "relative", letterSpacing: .5, fontVariantNumeric: "tabular-nums" }}>GSTIN: {gst}</p>}

              <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginTop: 16, position: "relative" }}>
                <span style={{ height: 1, width: 34, background: "rgba(255,158,67,.5)" }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 3.5, color: "#FF9E43" }}>RECEIPT</span>
                <span style={{ height: 1, width: 34, background: "rgba(255,158,67,.5)" }} />
              </div>
            </div>

            {/* Body */}
            <div style={{ background: "#fff", borderRadius: "0 0 22px 22px", padding: "22px 22px 24px", position: "relative" }}>

              {cancelled && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 12, padding: "9px 14px", fontSize: 13, fontWeight: 600, textAlign: "center", marginBottom: 16 }}>
                  This order was cancelled
                </div>
              )}

              {/* Meta */}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: SOFT, margin: "0 0 3px" }}>RECEIPT NO</p>
                  <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0, fontVariantNumeric: "tabular-nums" } as any}>#{String(sale.id).slice(0, 8).toUpperCase()}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: SOFT, margin: "0 0 3px" }}>DATE</p>
                  <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>{date}</p>
                </div>
              </div>

              {contact && (
                <div style={{ marginBottom: 18 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: SOFT, margin: "0 0 3px" }}>BILLED TO</p>
                  <p style={{ fontSize: 14.5, fontWeight: 600, margin: 0 }}>{contact.name}{contact.phone ? <span style={{ fontWeight: 400, color: MUTED }}> · {contact.phone}</span> : null}</p>
                </div>
              )}

              {/* Items */}
              <div>
                {items.map((it: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: i === items.length - 1 ? "none" : `1px solid ${LINE}` }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{it.name}</p>
                      <p style={{ fontSize: 12, color: SOFT, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" } as any}>{it.qty} × {currency}{Number(it.unitPrice).toFixed(0)}</p>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" } as any}>{currency}{(Number(it.unitPrice) * Number(it.qty)).toFixed(0)}</p>
                  </div>
                ))}
              </div>

              {/* Tear line with punch notches */}
              <div style={{ position: "relative", margin: "16px -22px 18px", height: 2 }}>
                <div style={{ position: "absolute", left: 26, right: 26, top: 0, borderTop: "2px dashed #E3E8F1" }} />
                <span className="notch" style={{ position: "absolute", top: -9, left: -10, width: 20, height: 20, borderRadius: "50%", background: PAGE }} />
                <span className="notch" style={{ position: "absolute", top: -9, right: -10, width: 20, height: 20, borderRadius: "50%", background: PAGE }} />
              </div>

              {/* Totals */}
              <div style={{ background: "#FAF7F1", border: "1px solid #F0EADD", borderRadius: 14, padding: "14px 16px" }}>
                {Number(sale.discount) > 0 && (
                  <>
                    <TotalRow label="Subtotal" value={`${currency}${(Number(sale.subtotal) || items.reduce((a: number, it: any) => a + Number(it.unitPrice) * Number(it.qty), 0)).toFixed(0)}`} />
                    <TotalRow label="Discount" value={`−${currency}${Number(sale.discount).toFixed(0)}`} accent="#059669" />
                    <div style={{ borderTop: "1px solid #EDE6D8", margin: "9px 0" }} />
                  </>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: MUTED }}>TOTAL</span>
                  <span style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" } as any}>{currency}{Number(sale.total).toFixed(0)}</span>
                </div>
                {!cancelled && (
                  <>
                    <div style={{ marginTop: 9 }}>
                      <TotalRow label="Paid" value={`${currency}${Number(sale.amount_paid).toFixed(0)}`} accent="#059669" />
                    </div>
                    {balance > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFF4E8", border: "1px solid #FFE0BD", borderRadius: 10, padding: "8px 12px", marginTop: 9 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#C2570A" }}>Balance due</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "#C2570A", fontVariantNumeric: "tabular-nums" } as any}>{currency}{balance.toFixed(0)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Status */}
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, padding: "6px 16px", borderRadius: 999, background: statusStyle.bg, color: statusStyle.fg }}>
                  {statusStyle.label}
                </span>
              </div>

              {/* Thank you */}
              {!cancelled && (
                <div style={{ textAlign: "center", marginTop: 20 }}>
                  <p style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, margin: 0 }}>Thank you!</p>
                  <p style={{ fontSize: 12, color: SOFT, margin: "3px 0 0" }}>We appreciate your business.</p>
                </div>
              )}


            </div>
          </div>

          {isOwner && (
            <ReceiptSend
              receiptUrl={`https://dawn-jet.vercel.app/receipt/${sale.share_token || sale.id}`}
              customerName={contact?.name || ""}
              customerPhone={contact?.phone || ""}
              total={Number(sale.total).toFixed(0)}
              currency={currency}
            />
          )}
          <p style={{ textAlign: "center", fontSize: 11, color: "#A6ACBB", marginTop: 18 }}>Powered by Dawn</p>
        </div>
        <style dangerouslySetInnerHTML={{ __html: `@media print { .noprint { display: none !important; } body { background: #fff !important; } .rcard { box-shadow: none !important; } .notch { background: #fff !important; } }` }} />
      </body>
    </html>
  );
}

function TotalRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13.5 }}>
      <span style={{ color: "#5B6478" }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent || "#16233F", fontVariantNumeric: "tabular-nums" } as any}>{value}</span>
    </div>
  );
}
