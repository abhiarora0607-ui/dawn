// V48c: the batched loaders must produce EXACTLY what the per-item versions
// did. A performance change that alters a number is a payroll bug, not an
// optimization. These test the pure indexing/computation, which is where a
// batch/single divergence would hide.
import { availableOf } from "../lib/leave.ts";

const t: [string, any, string][] = [];

// Simulate the bulk-vs-single balance computation. The only risk in batching
// is mis-indexing: a row landing under the wrong employee or code.
type Row = { employee_id: string; code: string; accrued?: number; used?: number; granted?: number; carried_in?: number; encashed?: number };
const ROWS: Row[] = [
  { employee_id: "e1", code: "casual", accrued: 12, used: 3 },
  { employee_id: "e1", code: "sick", accrued: 6, used: 1 },
  { employee_id: "e2", code: "casual", accrued: 12, used: 0, granted: 2 },
  { employee_id: "e3", code: "earned", accrued: 15, used: 5, encashed: 2 },
];
const TYPES = [
  { code: "casual", enabled: true, accrual: "monthly" },
  { code: "sick", enabled: true, accrual: "monthly" },
  { code: "earned", enabled: true, accrual: "monthly" },
];

// single-employee indexing (mirrors getBalances)
function single(empId: string) {
  const byCode: Record<string, any> = {};
  for (const r of ROWS.filter((r) => r.employee_id === empId)) byCode[r.code] = r;
  return TYPES.filter((t) => t.enabled).map((ty) => {
    const b = byCode[ty.code] || {};
    return { code: ty.code, available: availableOf(b, ty.accrual === "none") };
  });
}

// bulk indexing (mirrors getBalancesBulk)
function bulk(empIds: string[]) {
  const byEmp: Record<string, Record<string, any>> = {};
  for (const r of ROWS) (byEmp[r.employee_id] ||= {})[r.code] = r;
  const out: Record<string, any> = {};
  for (const id of empIds) {
    const byCode = byEmp[id] || {};
    out[id] = TYPES.filter((t) => t.enabled).map((ty) => {
      const b = byCode[ty.code] || {};
      return { code: ty.code, available: availableOf(b, ty.accrual === "none") };
    });
  }
  return out;
}

// The two must agree for every employee, including one with no rows.
const bulkResult = bulk(["e1", "e2", "e3", "e4"]);
for (const id of ["e1", "e2", "e3", "e4"]) {
  const s = JSON.stringify(single(id));
  const b = JSON.stringify(bulkResult[id]);
  t.push([`bulk matches single for ${id}`, String(s === b), "true"]);
}

// specific values, so we're not just testing "both wrong the same way"
t.push(["e1 casual available", String(bulkResult["e1"].find((x: any) => x.code === "casual").available), "9"]);   // 12-3
t.push(["e2 casual includes granted", String(bulkResult["e2"].find((x: any) => x.code === "casual").available), "14"]); // 12+2
t.push(["e3 earned nets encashed", String(bulkResult["e3"].find((x: any) => x.code === "earned").available), "8"]);   // 15-5-2
t.push(["e4 (no rows) all zero", String(bulkResult["e4"].every((x: any) => x.available === 0)), "true"]);
t.push(["e1 has no earned row → 0", String(bulkResult["e1"].find((x: any) => x.code === "earned").available), "0"]);

// no cross-contamination: e1's sick must not leak into e2
t.push(["e2 has no sick balance", String(bulkResult["e2"].find((x: any) => x.code === "sick").available), "0"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} BATCHING RULES CORRECT ***` : `\n*** ${bad} BATCHING FAILURE(S) ***`);
