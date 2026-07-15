// app/receipt/[id]/page.tsx
// A clean, print-optimized receipt for a single sale. Opens in a new tab;
// the user taps "Print / Save PDF" (browser print-to-PDF) or screenshots
// for a shareable image. Dependency-free — works on Vercel free tier.

export const dynamic = "force-dynamic";

import { ReceiptSend } from "@/components/ReceiptSend";
import { PrintButton } from "@/components/PrintButton";

// The [id] segment is the SHARE TOKEN, not the internal order id. Tokens are
// permanent — a customer's receipt link works forever, no login, no expiry.
// Internal ids no longer resolve, so knowing one grants nothing.
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
    const sf = await fetch(`${url}/rest/v1/storefront?uid=eq.${sale.uid}&select=*&limit=1`, { headers: h, cache: "no-store" }).then((r) => r.json());
    store = sf?.[0] || null;
    return { sale, contact, store };
  } catch { return null; }
}

export default async function Receipt({ params, searchParams }: { params: { id: string }; searchParams: { owner?: string } }) {
  const data = await getSale(params.id);
  if (!data) return <main style={{ padding: 40, fontFamily: "sans-serif" }}>Receipt not found.</main>;

  const { sale, contact, store } = data;
  const currency = store?.currency || "₹";
  const isOwner = searchParams?.owner === "1";
  const date = new Date(sale.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <html>
      <head><title>Receipt</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body style={{ margin: 0, background: "#F8F9FC", fontFamily: "Inter, system-ui, sans-serif", color: "#16233F" }}>
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "24px 16px" }}>
          <PrintButton />

          <div style={{ background: "#fff", borderRadius: 16, padding: 24, border: "1px solid #E4E8F0" }}>
            <div style={{ textAlign: "center", borderBottom: "1px solid #E4E8F0", paddingBottom: 16, marginBottom: 16 }}>
              {store?.logo_url ? <img src={store.logo_url} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover", marginBottom: 8 }} /> : null}
              <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>{store?.business_name || "Receipt"}</h1>
              {store?.phone && <p style={{ fontSize: 13, color: "#5B6478", margin: 0 }}>{store.phone}</p>}
              {store?.gst_number && <p style={{ fontSize: 12, color: "#5B6478", margin: "2px 0 0" }}>GST: {store.gst_number}</p>}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#5B6478", marginBottom: 16 }}>
              <span>{date}</span>
              <span>#{String(sale.id).slice(0, 8)}</span>
            </div>

            {contact && <p style={{ fontSize: 14, margin: "0 0 16px" }}>Billed to: <strong>{contact.name}</strong>{contact.phone ? ` · ${contact.phone}` : ""}</p>}

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "#5B6478", fontSize: 12 }}>
                <th style={{ padding: "6px 0" }}>Item</th><th style={{ textAlign: "center" }}>Qty</th><th style={{ textAlign: "right" }}>Amount</th>
              </tr></thead>
              <tbody>
                {(sale.items || []).map((it: any, i: number) => (
                  <tr key={i} style={{ borderTop: "1px solid #F0F2F6" }}>
                    <td style={{ padding: "8px 0" }}>{it.name}</td>
                    <td style={{ textAlign: "center" }}>{it.qty}</td>
                    <td style={{ textAlign: "right" }}>{currency}{(Number(it.unitPrice) * Number(it.qty)).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ borderTop: "1px solid #E4E8F0", marginTop: 12, paddingTop: 12, fontSize: 14 }}>
              <Row label="Subtotal" value={`${currency}${Number(sale.subtotal).toFixed(0)}`} />
              {Number(sale.discount) > 0 && <Row label="Discount" value={`−${currency}${Number(sale.discount).toFixed(0)}`} />}
              <Row label="Total" value={`${currency}${Number(sale.total).toFixed(0)}`} bold />
              <Row label="Paid" value={`${currency}${Number(sale.amount_paid).toFixed(0)}`} />
              {Number(sale.balance) > 0 && <Row label="Balance due" value={`${currency}${Number(sale.balance).toFixed(0)}`} bold />}
            </div>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", padding: "4px 12px", borderRadius: 999,
                background: sale.status === "paid" ? "#D1FAE5" : sale.status === "partial" ? "#FEF3C7" : "#FEE2E2",
                color: sale.status === "paid" ? "#065F46" : sale.status === "partial" ? "#92400E" : "#991B1B" }}>
                {sale.status}
              </span>
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
          <p style={{ textAlign: "center", fontSize: 11, color: "#9AA1B0", marginTop: 16 }}>Powered by Dawn</p>
        </div>
        <style dangerouslySetInnerHTML={{ __html: `@media print { .noprint { display: none !important; } body { background: #fff; } }` }} />
      </body>
    </html>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: bold ? "#16233F" : "#5B6478" }}>{label}</span><span>{value}</span>
    </div>
  );
}
