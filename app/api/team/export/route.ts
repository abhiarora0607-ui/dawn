// app/api/team/export/route.ts
// CSV export of the employee's OWN contacts and orders (data_export perm).

import { guardEmployee, empHeaders } from "@/lib/employee-auth";

export const dynamic = "force-dynamic";

function csvCell(v: any): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const g = await guardEmployee("data_export");
  if (!g.ok) return new Response("Not allowed", { status: g.status });
  const { ctx, url, key } = g;
  try {
    const [contacts, sales] = await Promise.all([
      // full-scan: an export must be complete
      fetch(`${url}/rest/v1/contacts?uid=eq.${ctx.uid}&deleted_at=is.null&employee_id=eq.${ctx.employeeId}&order=created_at.desc`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${ctx.uid}&deleted_at=is.null&employee_id=eq.${ctx.employeeId}&order=date.desc`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    const lines: string[] = [];
    lines.push("MY CONTACTS");
    lines.push(["Name", "Phone", "Instagram", "Stage", "Source", "Created"].join(","));
    for (const c of Array.isArray(contacts) ? contacts : []) {
      lines.push([csvCell(c.name), csvCell(c.phone), csvCell(c.instagram_handle), csvCell(c.stage), csvCell(c.source), csvCell((c.created_at || "").slice(0, 10))].join(","));
    }
    lines.push("");
    lines.push("MY ORDERS");
    lines.push(["Date", "Total", "Paid", "Balance", "Payment status", "Order status", "Items"].join(","));
    for (const s of Array.isArray(sales) ? sales : []) {
      const items = (s.items || []).map((it: any) => `${it.qty}x ${it.name}`).join("; ");
      lines.push([csvCell((s.date || "").slice(0, 10)), csvCell(s.total), csvCell(s.amount_paid), csvCell(s.balance), csvCell(s.status), csvCell(s.order_status || "Placed"), csvCell(items)].join(","));
    }
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="my-dawn-data.csv"`,
      },
    });
  } catch {
    return new Response("Export failed", { status: 500 });
  }
}
