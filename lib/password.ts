// lib/password.ts
// Secure password handling using Node's built-in scrypt (no dependency).
// scrypt is memory-hard and appropriate for password storage. Each password
// gets a unique random salt; verification is constant-time.

import crypto from "crypto";

const KEYLEN = 64;
const COST = 16384; // N — CPU/memory cost
const BLOCK = 8;    // r
const PARALLEL = 1; // p

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, KEYLEN, { N: COST, r: BLOCK, p: PARALLEL });
  return { hash: derived.toString("hex"), salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, KEYLEN, { N: COST, r: BLOCK, p: PARALLEL });
    const a = Buffer.from(hash, "hex");
    if (a.length !== derived.length) return false;
    return crypto.timingSafeEqual(a, derived);
  } catch {
    return false;
  }
}

// Generate a readable temporary password for a new employee.
export function generatePassword(): string {
  const words = ["sun", "dawn", "sky", "rise", "gold", "warm", "bright", "day", "morning", "glow"];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w}-${n}`;
}

// Generate a unique-ish login id from a name.
export function loginIdFromName(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "staff";
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${base}${suffix}`;
}

// Password strength check for admin-set / employee-changed passwords.
export function passwordIssue(pw: string): string | null {
  if (!pw || pw.length < 6) return "Password must be at least 6 characters.";
  if (pw.length > 128) return "Password is too long.";
  return null;
}
