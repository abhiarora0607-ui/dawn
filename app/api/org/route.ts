// app/api/org/route.ts
// The org chart, departments, and reporting lines.
//
// Reads are scoped: an admin gets the whole company, a lead gets their branch.
// Writes are admin-only — reshaping who reports to whom changes what everyone
// can see, so it isn't something a team lead should be able to do quietly.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { requireArea } from "@/lib/entitlements";
import { getEmployee } from "@/lib/employee-auth";
import { loadOrg } from "@/lib/org-db";
import { wouldCycle, roleOf, childrenOf, ROLE_LABEL } from "@/lib/org";
import { audit } from "@/lib/audit";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Both the owner and a signed-in employee can read the org, so resolve
 * whichever session exists. The employee path carries an employeeId, which is
 * what narrows the tree to their branch.
 */
async function resolve() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;

  const ownerUid = await getUid();
  if (ownerUid) {
    const blocked = await requireArea(url, key, ownerUid, "crm");
    if (blocked) return { blocked };
    return { uid: ownerUid, meId: null as string | null, url, key };
  }
  const emp = await getEmployee();
  if (emp) return { uid: emp.uid, meId: emp.employeeId, url, key };
  return null;
}

export async function GET(req: Request) {
  const c = await resolve();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if ("blocked" in c && c.blocked) return NextResponse.json(c.blocked, { status: 403 });
  const { uid, meId, url, key } = c as any;

  const org = await loadOrg(url, key, uid, meId);
  const view = new URL(req.url).searchParams.get("view") || "tree";

  if (view === "departments") {
    return NextResponse.json({
      departments: org.departments.map((d) => ({
        ...d,
        headName: org.employees.find((e) => e.id === d.head_employee_id)?.name || null,
        memberCount: org.employees.filter((e) => e.department_id === d.id && e.status !== "inactive").length,
      })),
      canManage: org.isAdmin,
      complexity: org.complexity,
    });
  }

  // The tree, pruned to what the caller may see. A lead opening the org chart
  // sees their own branch rooted at themselves rather than an empty page.
  const visibleSet = org.visible === "all" ? null : new Set(org.visible);
  const nodes = org.employees
    .filter((e) => e.status !== "inactive")
    .filter((e) => !visibleSet || visibleSet.has(e.id))
    .map((e) => ({
      id: e.id,
      name: e.name,
      jobTitle: e.job_title || null,
      reportsTo: e.reports_to,
      departmentId: e.department_id,
      departmentName: org.departments.find((d) => d.id === e.department_id)?.name || null,
      role: roleOf(e, org.employees, org.departments),
      roleLabel: ROLE_LABEL[roleOf(e, org.employees, org.departments)],
      directReports: org.employees.filter((x) => x.reports_to === e.id && x.status !== "inactive").length,
      isMe: e.id === meId,
    }));

  // Root = whoever in the visible set has no visible manager. For an admin
  // that's the owner; for a lead it's themselves.
  const ids = new Set(nodes.map((n) => n.id));
  const roots = nodes.filter((n) => !n.reportsTo || !ids.has(n.reportsTo)).map((n) => n.id);

  return NextResponse.json({
    nodes, roots,
    departments: org.departments,
    myId: meId,
    role: org.role,
    canManage: org.isAdmin,
    complexity: org.complexity,
  });
}

export async function POST(req: Request) {
  const c = await resolve();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if ("blocked" in c && c.blocked) return NextResponse.json(c.blocked, { status: 403 });
  const { uid, meId, url, key } = c as any;

  const org = await loadOrg(url, key, uid, meId);
  // Reshaping the org changes what everyone can see. Admin only.
  if (!org.isAdmin) return NextResponse.json({ error: "Only an admin can change the org structure." }, { status: 403 });

  try {
    const b = await req.json();

    // ---- departments ----
    if (b.action === "dept_create") {
      const name = String(b.name || "").trim().slice(0, 60);
      if (!name) return NextResponse.json({ error: "Give the department a name." }, { status: 400 });
      if (org.departments.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
        return NextResponse.json({ error: "There's already a department with that name." }, { status: 400 });
      }
      await fetch(`${url}/rest/v1/departments`, {
        method: "POST", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ uid, name, head_employee_id: b.headId || null, sort_order: org.departments.length }),
      });
      await audit({ uid, action: "org.dept.create", entity: "departments", entityId: name, meta: { name } });
      return NextResponse.json({ ok: true });
    }

    if (b.action === "dept_update") {
      const patch: any = {};
      if (b.name !== undefined) patch.name = String(b.name).trim().slice(0, 60);
      if (b.headId !== undefined) patch.head_employee_id = b.headId || null;
      await fetch(`${url}/rest/v1/departments?uid=eq.${uid}&id=eq.${b.id}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
      });
      await audit({ uid, action: "org.dept.update", entity: "departments", entityId: b.id, meta: patch });
      return NextResponse.json({ ok: true });
    }

    if (b.action === "dept_delete") {
      // Members are detached rather than deleted — losing people because a
      // department was reorganised would be indefensible.
      await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&department_id=eq.${b.id}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ department_id: null }),
      });
      await fetch(`${url}/rest/v1/departments?uid=eq.${uid}&id=eq.${b.id}`, {
        method: "DELETE", headers: H(key, { Prefer: "return=minimal" }),
      });
      await audit({ uid, action: "org.dept.delete", entity: "departments", entityId: b.id });
      return NextResponse.json({ ok: true });
    }

    // ---- reporting line ----
    if (b.action === "set_manager") {
      const empId = String(b.employeeId || "");
      const managerId = b.managerId ? String(b.managerId) : null;
      const emp = org.employees.find((e) => e.id === empId);
      if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
      if (emp.is_owner) return NextResponse.json({ error: "The owner sits at the top and doesn't report to anyone." }, { status: 400 });

      // A cycle would make the tree unwalkable, and the tree is what every
      // permission check depends on.
      if (managerId && wouldCycle(empId, managerId, org.employees)) {
        return NextResponse.json({ error: "That would create a loop — this person is already above them." }, { status: 400 });
      }

      await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${empId}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ reports_to: managerId }),
      });
      await audit({ uid, action: "org.manager.set", entity: "employees", entityId: empId, meta: { managerId } });
      return NextResponse.json({ ok: true });
    }

    // ---- department assignment ----
    if (b.action === "set_department") {
      await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${b.employeeId}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ department_id: b.departmentId || null }),
      });
      await audit({ uid, action: "org.dept.assign", entity: "employees", entityId: b.employeeId, meta: { departmentId: b.departmentId } });
      return NextResponse.json({ ok: true });
    }

    // ---- admin flag ----
    if (b.action === "set_admin") {
      const emp = org.employees.find((e) => e.id === b.employeeId);
      if (emp?.is_owner) return NextResponse.json({ error: "The owner is always an admin." }, { status: 400 });
      await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${b.employeeId}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ is_admin: !!b.isAdmin }),
      });
      await audit({ uid, action: "org.admin.set", entity: "employees", entityId: b.employeeId, meta: { isAdmin: !!b.isAdmin } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch { return NextResponse.json({ error: "Couldn't save that." }, { status: 500 }); }
}
