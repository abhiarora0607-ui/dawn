// lib/validate.ts
// Shared, forgiving-but-real validation for contact write paths.
// Philosophy: empty is allowed (info may not exist yet); garbage is not.

export function cleanPhone(v: any): { ok: boolean; value: string; error?: string } {
  const raw = String(v || "").trim();
  if (!raw) return { ok: true, value: "" };
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, value: raw, error: "Phone number should be 8–15 digits." };
  }
  // Keep a leading + if the user typed one; store digits otherwise.
  return { ok: true, value: raw.startsWith("+") ? "+" + digits : digits };
}

export function cleanEmail(v: any): { ok: boolean; value: string; error?: string } {
  const raw = String(v || "").trim();
  if (!raw) return { ok: true, value: "" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) {
    return { ok: false, value: raw, error: "That email address doesn't look valid." };
  }
  return { ok: true, value: raw.toLowerCase() };
}

export function cleanName(v: any): { ok: boolean; value: string; error?: string } {
  const raw = String(v || "").trim().replace(/\s+/g, " ");
  if (!raw) return { ok: false, value: "", error: "Name is required." };
  if (raw.length > 120) return { ok: false, value: raw, error: "Name is too long." };
  // Must contain at least one letter — blocks "...", "123", "-" etc.
  if (!/[\p{L}]/u.test(raw)) return { ok: false, value: raw, error: "Please enter a real name." };
  return { ok: true, value: raw };
}
