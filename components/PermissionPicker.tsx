"use client";

// Choosing what someone can do.
//
// Forty checkboxes in a flat list is a wall nobody reads — they tick roughly
// the right things and move on, which is how people end up with access nobody
// intended. Grouped and collapsed, with only the relevant groups open, it
// becomes a form.
//
// Conflicts warn rather than block. A two-person business has nobody to
// separate duties with, and refusing to let the owner work would make Dawn
// unusable at the small end of the range it serves.

import { useMemo, useState } from "react";
import {
  PERMISSIONS, GROUP_LABELS, GROUP_ORDER, expandImplied, cascadeRemoval,
  conflictsIn, conflictsAdding, permissionLabel, type PermissionGroup,
} from "@/lib/permissions";
import { ChevronDown, ChevronRight, AlertTriangle, Lock } from "lucide-react";

export function PermissionPicker({
  value, onChange, grantable, disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** What the person doing the granting may pass on. Undefined = everything. */
  grantable?: string[];
  disabled?: boolean;
}) {
  const held = new Set(value);
  const canGrant = grantable ? new Set(grantable) : null;

  // Open the groups they already have something in — usually the ones being
  // adjusted — and Basics, which everyone needs.
  const [open, setOpen] = useState<Set<PermissionGroup>>(() => {
    const s = new Set<PermissionGroup>(["core"]);
    for (const p of PERMISSIONS) if (held.has(p.id)) s.add(p.group);
    return s;
  });

  const conflicts = useMemo(() => conflictsIn(value), [value]);

  function toggle(id: string) {
    if (disabled) return;
    if (held.has(id)) {
      onChange(cascadeRemoval(value, id));
    } else {
      onChange(expandImplied([...value, id]));
    }
  }

  const byGroup = useMemo(() => {
    const m: Record<string, typeof PERMISSIONS> = {};
    // Only portal-scope permissions are offered. Owner-scope ones gate
    // dashboard actions the owner holds by definition — showing them as
    // employee checkboxes was the lie V48b removes.
    for (const p of PERMISSIONS) {
      if (p.scope === "owner") continue;
      (m[p.group] ||= []).push(p);
    }
    return m;
  }, []);

  return (
    <div className="space-y-2">
      {conflicts.length > 0 && (
        <div className="dawn-card p-3 border-amber/40 bg-amber/5">
          <p className="text-sm font-semibold text-navy flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-deep" />
            {conflicts.length === 1 ? "One thing worth checking" : `${conflicts.length} things worth checking`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {conflicts.map((c) => (
              <li key={`${c.a}-${c.b}`} className="t-small text-navy/75">
                <strong>{c.labels[0]}</strong> + <strong>{c.labels[1]}</strong> — {c.why}
              </li>
            ))}
          </ul>
          <p className="t-micro text-muted mt-2">
            Fine in a small team where one person wears several hats. Worth splitting as you grow.
          </p>
        </div>
      )}

      {GROUP_ORDER.filter((g) => byGroup[g]?.length).map((g) => {
        const perms = byGroup[g];
        const isOpen = open.has(g);
        const count = perms.filter((p) => held.has(p.id)).length;

        return (
          <div key={g} className="dawn-card overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen((prev) => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; })}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
              <span className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="w-4 h-4 text-navy/40" /> : <ChevronRight className="w-4 h-4 text-navy/40" />}
                <span className="font-medium text-navy text-sm">{GROUP_LABELS[g]}</span>
              </span>
              <span className="t-micro text-muted">{count > 0 ? `${count} of ${perms.length}` : "none"}</span>
            </button>

            {isOpen && (
              <div className="px-4 pb-3 space-y-1.5 border-t border-navy-line/40 pt-3">
                {perms.map((p) => {
                  const on = held.has(p.id);
                  const locked = !!canGrant && !canGrant.has(p.id);
                  const wouldConflict = !on && conflictsAdding(value, p.id);

                  return (
                    <label key={p.id}
                      className={`flex items-start gap-2.5 py-1 ${locked || disabled ? "opacity-50" : "cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={locked || disabled}
                        onChange={() => toggle(p.id)}
                        className="mt-0.5 w-4 h-4 accent-amber-deep shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="text-sm text-navy flex items-center gap-1.5 flex-wrap">
                          {p.label}
                          {p.sensitive && <span className="pill pill-amber">sensitive</span>}
                          {locked && (
                            <span className="t-micro text-muted flex items-center gap-1">
                              <Lock className="w-3 h-3" /> you don&apos;t hold this
                            </span>
                          )}
                        </span>
                        {p.hint && <span className="t-micro text-muted block mt-0.5">{p.hint}</span>}
                        {wouldConflict && wouldConflict.length > 0 && (
                          <span className="t-micro text-amber-deep block mt-0.5">
                            Adding this alongside {wouldConflict[0].labels.find((l) => l !== p.label)} is worth a second thought.
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <p className="t-micro text-muted">
        Ticking something that needs another permission adds it automatically — nobody should be able to edit a list they can&apos;t open.
      </p>
    </div>
  );
}

/** A short human summary, for lists where the full picker would be too much. */
export function permissionSummary(ids: string[]): string {
  if (!ids?.length) return "No access";
  const groups = new Set(PERMISSIONS.filter((p) => ids.includes(p.id)).map((p) => p.group));
  const named = GROUP_ORDER.filter((g) => groups.has(g)).map((g) => GROUP_LABELS[g]);
  if (named.length === 0) return "No access";
  if (named.length <= 2) return named.join(" and ");
  return `${named.slice(0, 2).join(", ")} and ${named.length - 2} more`;
}
