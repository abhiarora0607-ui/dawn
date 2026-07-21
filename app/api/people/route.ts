// app/api/people/route.ts
// Find a colleague: name, phone, email, department, joining date, and whether
// they're in today.
//
// Two scopes deliberately differ here. Contact details are directory
// information — in a real workplace anyone can find a colleague's desk number,
// and hiding it would make the feature useless at the two-person end of the
// range. Records are not: attendance detail, salary and CRM data stay behind
// the org scope. So everyone is findable, but only your own people are
// openable.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { getEmployee } from "@/lib/employee-auth";
import { loadOrg } from "@/lib/org-db";
import { roleOf, ROLE_LABEL } from "@/lib/org";
import { istDate } from "@/lib/attendance";
import { approvedLeaveMap } from "@/lib/leave-db";

export const dynamic = "force-dynamic";
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function resolve() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const ownerUid = await getUid();
  if (ownerUid) return { uid: ownerUid, meId: null as string | null, url, key };
  const emp = await getEmployee();
  if (emp) return { uid: emp.uid, meId: emp.employeeId, url, key };
  return null;
}

export async function GET(req: Request) {
  const c = await resolve();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { uid, meId, url, key } = c;

  const q = (new URL(req.url).searchParams.get("q") || "").trim().toLowerCase();
  const today = istDate();

  const org = await loadOrg(url, key, uid, meId);

  // Contact fields for everyone; the scope decides what's openable, not what's
  // findable.
  const rows = await fetch(
    `${url}/rest/v1/employees?uid=eq.${uid}&status=eq.active&select=id,name,phone,email,joining_date,job_title,department_id,is_owner,is_admin,reports_to&order=name.asc`,
    { headers: H(key), cache: "no-store" },
  ).then((r) => r.json()).catch(() => []);
  const all = Array.isArray(rows) ? rows : [];

  const matched = q
    ? all.filter((e: any) =>
        (e.name || "").toLowerCase().includes(q) ||
        (e.job_title || "").toLowerCase().includes(q) ||
        (e.email || "").toLowerCase().includes(q) ||
        (e.phone || "").includes(q))
    : all.slice(0, 20);

  // Presence, for the matched set only — no point pulling the whole company's
  // attendance to answer a search for one name.
  const ids = matched.map((e: any) => e.id);
  let dayRows: any[] = [], leaveMap: Record<string, Record<string, string>> = {};
  if (ids.length) {
    [dayRows, leaveMap] = await Promise.all([
      fetch(`${url}/rest/v1/attendance_days?uid=eq.${uid}&work_date=eq.${today}&employee_id=in.(${ids.join(",")})&select=employee_id,classification,worked_minutes`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      approvedLeaveMap(url, key, uid, today, today),
    ]);
  }
  const dayBy: Record<string, any> = {};
  for (const d of Array.isArray(dayRows) ? dayRows : []) dayBy[d.employee_id] = d;

  const visibleSet = org.visible === "all" ? null : new Set(org.visible);

  return NextResponse.json({
    today,
    results: matched.slice(0, 40).map((e: any) => {
      const day = dayBy[e.id];
      const onLeave = leaveMap[e.id]?.[today];
      // A plain-language answer to "are they in today?", which is what someone
      // searching a colleague actually wants to know.
      const presence = onLeave ? "On leave"
        : day?.classification === "full" ? "In today"
        : day?.classification === "half" ? "In (half day)"
        : day?.classification === "weekly_off" ? "Day off"
        : day?.classification === "holiday" ? "Holiday"
        : day?.classification === "absent" ? "Not in"
        : "No record yet";

      return {
        id: e.id,
        name: e.name,
        jobTitle: e.job_title || null,
        phone: e.phone || null,
        email: e.email || null,
        joiningDate: e.joining_date || null,
        department: org.departments.find((d) => d.id === e.department_id)?.name || null,
        role: ROLE_LABEL[roleOf(e, org.employees, org.departments)],
        presence,
        workedMinutes: day?.worked_minutes || 0,
        isMe: e.id === meId,
        // Whether the caller may open this person's records, as opposed to
        // merely finding their phone number.
        canOpen: !visibleSet || visibleSet.has(e.id),
      };
    }),
  });
}
