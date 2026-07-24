import { H } from "@/lib/http";
// lib/mailer.ts
// One place for every email Dawn sends. Uses Resend (already the provider for
// magic-link sign-in), so V28 adds no new infrastructure.
//
// Rules that keep this safe:
// - NEVER throws. Email is a nice-to-have; a mail failure must never break a
//   cron run, a payment, or a page load.
// - No provider configured (no RESEND_API_KEY) → silently no-ops. Dawn works
//   fine without email; it just doesn't nudge.
// - Send-once ledger: lifecycle mails are recorded as events so a daily cron
//   can run repeatedly without spamming the same person twice.

const FROM = process.env.RESEND_FROM || "Dawn <onboarding@resend.dev>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://dawn-jet.vercel.app";


// ---------------------------------------------------------------- template
// Dawn's brand in an email-safe shell: tables, inline styles, no external CSS.
export function shell(opts: { heading: string; body: string; ctaLabel?: string; ctaHref?: string; footnote?: string }): string {
  const { heading, body, ctaLabel, ctaHref, footnote } = opts;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F4F2ED;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2ED;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(22,35,63,.10);">
        <tr><td style="background:linear-gradient(140deg,#16233F 0%,#1E2E52 100%);padding:26px 28px;">
          <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:600;color:#ffffff;">Dawn</p>
          <p style="margin:4px 0 0;font-size:11px;letter-spacing:2.5px;color:#FF9E43;font-family:Arial,sans-serif;font-weight:bold;">YOUR BUSINESS, EVERY MORNING</p>
        </td></tr>
        <tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;color:#16233F;">
          <h1 style="margin:0 0 12px;font-size:20px;font-family:Georgia,serif;font-weight:600;">${heading}</h1>
          <div style="font-size:14.5px;line-height:1.65;color:#41495C;">${body}</div>
          ${ctaLabel && ctaHref ? `<p style="margin:24px 0 0;"><a href="${ctaHref}" style="display:inline-block;background:#F97316;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:12px;">${ctaLabel}</a></p>` : ""}
          ${footnote ? `<p style="margin:22px 0 0;font-size:12px;color:#8A92A6;line-height:1.6;">${footnote}</p>` : ""}
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#A6ACBB;font-family:Arial,sans-serif;">Dawn · Made in India · <a href="${APP_URL}/contact" style="color:#A6ACBB;">Contact</a></p>
    </td></tr>
  </table>
</body></html>`;
}

// ------------------------------------------------------------------- send
export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    return res.ok;
  } catch { return false; }
}

// --------------------------------------------------------- send-once guard
// Lifecycle mails are keyed (uid + kind + optional period tag). The cron can
// run every day; each person still gets each mail exactly once.
export async function alreadySent(url: string, key: string, uid: string, mailKey: string): Promise<boolean> {
  try {
    const rows = await fetch(`${url}/rest/v1/events?uid=eq.${uid}&kind=eq.mail&meta->>key=eq.${encodeURIComponent(mailKey)}&select=id&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
    return Array.isArray(rows) && rows.length > 0;
  } catch { return true; } // on doubt, don't send — better silent than spammy
}

export async function markSent(url: string, key: string, uid: string, mailKey: string): Promise<void> {
  try {
    await fetch(`${url}/rest/v1/events`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ uid, kind: "mail", meta: { key: mailKey } }),
    });
  } catch { /* ignore */ }
}

export const APP = APP_URL;
