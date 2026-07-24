// V59 adapter rules: the seam's contract, pinned. The mock pays instantly
// with a visibly-test reference; the active adapter IS the mock until a real
// gateway is wired — and swapping it must never change this contract's shape.
import { mockAdapter, activeAdapter } from "../lib/payments.ts";

const t: [string, any, string][] = [];
const res = await mockAdapter.createCheckout({ uid: "u", planId: "p", planName: "Pro", cycle: "monthly", amount: 999 });
t.push(["the mock always pays", res.kind, "paid"]);
t.push(["…as the mock gateway", (res as any).gateway, "mock"]);
t.push(["…with a visibly-test reference", String((res as any).reference?.startsWith("MOCK-")), "true"]);
t.push(["the active adapter is the mock until a gateway is wired", activeAdapter().name, "mock"]);

let bad = 0;
for (const [name, got, want] of t) {
  const g = String(got);
  if (g === want) console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  else { console.log(`  \x1b[31m✗\x1b[0m ${name} — got ${g}, wanted ${want}`); bad++; }
}
if (bad) { console.log(`\x1b[31m*** ${bad} PAYMENTS RULE FAILURE(S) ***\x1b[0m`); process.exit(1); }
console.log(`\x1b[32m*** ALL ${t.length} PAYMENTS RULES CORRECT ***\x1b[0m`);
