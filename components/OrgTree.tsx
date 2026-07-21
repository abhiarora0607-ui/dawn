"use client";

// The org chart.
//
// A pan-and-zoom chart is the right shape on a laptop and unusable on a phone —
// you end up dragging a canvas around hunting for a name. So this is one
// component with two renderings: connected columns on desktop, an indented
// list on mobile. Both read from the same tree, and both collapse, because a
// 200-person company opened flat is a wall.

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Users, Building2 } from "lucide-react";

type Node = {
  id: string; name: string; jobTitle: string | null;
  reportsTo: string | null; departmentName: string | null;
  role: string; roleLabel: string; directReports: number; isMe: boolean;
};

const ROLE_PILL: Record<string, string> = {
  owner: "pill-navy", admin: "pill-navy",
  dept_head: "pill-sky", lead: "pill-amber", member: "pill-grey",
};

export function OrgTree({ nodes, roots }: { nodes: Node[]; roots: string[] }) {
  const kids = useMemo(() => {
    const m: Record<string, Node[]> = {};
    for (const n of nodes) {
      if (!n.reportsTo) continue;
      (m[n.reportsTo] ||= []).push(n);
    }
    return m;
  }, [nodes]);

  // Open the first two levels: enough to see the shape, not so much that a
  // large company arrives as a wall of names.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const c = new Set<string>();
    for (const n of nodes) {
      const depth = depthOf(n.id, nodes);
      if (depth >= 2 && (kidsOf(n.id, nodes).length > 0)) c.add(n.id);
    }
    return c;
  });

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (nodes.length === 0) return <p className="dawn-empty">Nobody to show yet.</p>;

  return (
    <>
      {/* Phone: indentation carries the hierarchy, which a thumb can actually
          navigate. */}
      <div className="md:hidden dawn-card divide-y divide-navy-line/40">
        {roots.map((r) => <MobileBranch key={r} id={r} nodes={nodes} kids={kids} depth={0} collapsed={collapsed} toggle={toggle} />)}
      </div>

      {/* Laptop: the familiar chart. */}
      <div className="hidden md:block dawn-card p-6 overflow-x-auto">
        <div className="flex flex-col items-center gap-8 min-w-fit">
          {roots.map((r) => <DeskBranch key={r} id={r} nodes={nodes} kids={kids} collapsed={collapsed} toggle={toggle} />)}
        </div>
      </div>
    </>
  );
}

function kidsOf(id: string, nodes: Node[]) { return nodes.filter((n) => n.reportsTo === id); }
function depthOf(id: string, nodes: Node[]): number {
  let d = 0, cur = nodes.find((n) => n.id === id)?.reportsTo, guard = 0;
  while (cur && guard++ < 50) { d++; cur = nodes.find((n) => n.id === cur)?.reportsTo; }
  return d;
}

/* ------------------------------------------------------------------ mobile */

function MobileBranch({ id, nodes, kids, depth, collapsed, toggle }: any) {
  const n: Node | undefined = nodes.find((x: Node) => x.id === id);
  if (!n) return null;
  const children = kids[id] || [];
  const isCollapsed = collapsed.has(id);

  return (
    <>
      <div className="flex items-center gap-2 py-2.5 pr-3" style={{ paddingLeft: `${0.75 + depth * 1.1}rem` }}>
        {children.length > 0 ? (
          <button onClick={() => toggle(id)} className="btn-icon -ml-2" aria-label={isCollapsed ? "Expand" : "Collapse"}>
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        ) : <span className="w-6" />}

        <div className="min-w-0 flex-1">
          <p className={`text-sm truncate ${n.isMe ? "font-bold text-amber-deep" : "font-semibold text-navy"}`}>
            {n.name}{n.isMe && " (you)"}
          </p>
          {n.jobTitle && <p className="t-micro text-muted truncate">{n.jobTitle}</p>}
        </div>

        {children.length > 0 && (
          <span className="t-micro text-muted flex items-center gap-1 shrink-0">
            <Users className="w-3 h-3" />{n.directReports}
          </span>
        )}
      </div>
      {!isCollapsed && children.map((c: Node) => (
        <MobileBranch key={c.id} id={c.id} nodes={nodes} kids={kids} depth={depth + 1} collapsed={collapsed} toggle={toggle} />
      ))}
    </>
  );
}

/* ----------------------------------------------------------------- desktop */

function DeskBranch({ id, nodes, kids, collapsed, toggle }: any) {
  const n: Node | undefined = nodes.find((x: Node) => x.id === id);
  if (!n) return null;
  const children = kids[id] || [];
  const isCollapsed = collapsed.has(id);

  return (
    <div className="flex flex-col items-center">
      <Card n={n} onToggle={children.length ? () => toggle(id) : undefined} collapsed={isCollapsed} />

      {children.length > 0 && !isCollapsed && (
        <>
          <span className="w-px h-6 bg-navy-line" />
          <div className="flex items-start gap-6 relative">
            {/* The horizontal rule that joins siblings; hidden when there's
                only one child, where it would just be a stub. */}
            {children.length > 1 && (
              <span className="absolute top-0 left-0 right-0 h-px bg-navy-line"
                    style={{ marginLeft: "6rem", marginRight: "6rem" }} />
            )}
            {children.map((c: Node) => (
              <div key={c.id} className="flex flex-col items-center">
                <span className="w-px h-6 bg-navy-line" />
                <DeskBranch id={c.id} nodes={nodes} kids={kids} collapsed={collapsed} toggle={toggle} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Card({ n, onToggle, collapsed }: { n: Node; onToggle?: () => void; collapsed: boolean }) {
  return (
    <div className={`dawn-card-flat px-4 py-3 w-48 text-center relative ${n.isMe ? "ring-2 ring-amber" : ""}`}>
      <p className={`text-sm truncate ${n.isMe ? "font-bold text-amber-deep" : "font-semibold text-navy"}`}>{n.name}</p>
      {n.jobTitle && <p className="t-micro text-muted truncate mt-0.5">{n.jobTitle}</p>}
      <span className={`pill ${ROLE_PILL[n.role] || "pill-grey"} mt-2`}>{n.roleLabel}</span>
      {n.departmentName && (
        <p className="t-micro text-muted truncate mt-1.5 flex items-center justify-center gap-1">
          <Building2 className="w-3 h-3" />{n.departmentName}
        </p>
      )}
      {onToggle && (
        <button onClick={onToggle}
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border border-navy-line flex items-center justify-center text-navy/50 hover:text-navy hover:border-navy/30 z-10"
          aria-label={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <span className="text-xs font-bold">{n.directReports}</span> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}
