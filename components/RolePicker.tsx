"use client";

// Choosing someone's job role.
//
// The dropdown applies a template; the permissions below stay editable. That
// combination is what keeps the role list short — without it, every variation
// ("sales rep who can also see expenses") becomes another role, and you arrive
// at forty roles that are just permission lists wearing names.
//
// Changing role OVERWRITES rather than merges, so the preview isn't decoration:
// it's the only chance to see that someone is about to lose access before they
// lose it.

import { useState } from "react";
import { SELECTABLE_ROLES, permissionsForRole, previewRoleChange, detectRole } from "@/lib/roles";
import { permissionLabel } from "@/lib/permissions";
import { ArrowRight, Minus, Plus, ShieldCheck } from "lucide-react";

export function RolePicker({
  permissions, onApply, disabled,
}: {
  permissions: string[];
  onApply: (next: string[], roleId: string) => void;
  disabled?: boolean;
}) {
  const current = detectRole(permissions);
  const [pending, setPending] = useState<string | null>(null);

  const preview = pending ? previewRoleChange(permissions, pending) : null;
  const pendingRole = pending ? SELECTABLE_ROLES.find((r) => r.id === pending) : null;

  function choose(id: string) {
    if (id === current) { setPending(null); return; }
    if (id === "custom") {
      // "Custom" describes what the permissions already are — it isn't a
      // template to apply, and wiping someone's access because they were
      // labelled would be a nasty surprise.
      setPending(null);
      return;
    }
    setPending(id);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="t-label block mb-1.5">Job role</label>
        <select
          className="inp"
          value={pending || current}
          disabled={disabled}
          onChange={(e) => choose(e.target.value)}>
          {SELECTABLE_ROLES.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        <p className="t-micro text-muted mt-1">
          {(pendingRole || SELECTABLE_ROLES.find((r) => r.id === current))?.description ||
            "Permissions have been set individually."}
        </p>
      </div>

      {preview && pendingRole && (
        <div className="dawn-card p-4 border-amber/40">
          <p className="text-sm font-semibold text-navy flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-deep" />
            Switching to {pendingRole.label}
          </p>

          {preview.gained.length === 0 && preview.lost.length === 0 ? (
            <p className="t-small text-muted mt-1.5">Nothing would change.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {preview.lost.length > 0 && (
                <div>
                  <p className="t-micro font-semibold text-red-600 flex items-center gap-1">
                    <Minus className="w-3 h-3" /> Loses {preview.lost.length}
                  </p>
                  <p className="t-small text-navy/70 mt-0.5">
                    {preview.lost.slice(0, 6).map(permissionLabel).join(", ")}
                    {preview.lost.length > 6 && ` and ${preview.lost.length - 6} more`}
                  </p>
                </div>
              )}
              {preview.gained.length > 0 && (
                <div>
                  <p className="t-micro font-semibold text-emerald-600 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Gains {preview.gained.length}
                  </p>
                  <p className="t-small text-navy/70 mt-0.5">
                    {preview.gained.slice(0, 6).map(permissionLabel).join(", ")}
                    {preview.gained.length > 6 && ` and ${preview.gained.length - 6} more`}
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="t-micro text-muted mt-2">
            This replaces their current permissions rather than adding to them. You can adjust the details afterwards.
          </p>

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => { onApply(permissionsForRole(pending!), pending!); setPending(null); }}
              className="btn btn-primary btn-sm">
              Apply <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setPending(null)} className="btn btn-quiet btn-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
