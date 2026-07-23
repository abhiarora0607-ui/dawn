"use client";

// Customize the portal home (V54): pin what you live in, hide what you don't
// use. The available list comes straight from the widget registry, so a new
// widget is customizable the day it ships. Two safety rails, mirrored
// server-side: the Today card can't be hidden, and unknown ids are ignored.

import { useState } from "react";
import { WIDGETS, type WorkspacePrefs } from "@/lib/workspace";
import { Loader2, Pin, EyeOff, Eye } from "lucide-react";

export function HomeCustomize({
  prefs = {},
  onClose,
  onSaved,
}: {
  prefs?: WorkspacePrefs;
  onClose?: () => void;
  onSaved?: () => void;
}) {
  const [hidden, setHidden] = useState<string[]>(prefs.hidden || []);
  const [pinned, setPinned] = useState<string[]>(prefs.pinned || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function save() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/team/workspace", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_prefs", hidden, pinned }),
    });
    const out = await res.json();
    setBusy(false);
    if (out.ok) { onSaved?.(); onClose?.(); }
    else setMsg(out.error || "Couldn't save");
  }

  return (
    <div className="dawn-scrim z-50" onClick={onClose}>
      <div className="dawn-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold text-navy">Customize your home</p>
        <p className="t-small text-muted mt-1">
          Pinned cards come first. Hidden cards go away until you bring them back. Cards you don't have access to never appear either way.
        </p>
        {msg && <p className="t-small text-red-600 mt-2">{msg}</p>}
        <div className="space-y-1.5 mt-3">
          {WIDGETS.map((w) => {
            const isFloor = w.id === "today";
            const isHidden = hidden.includes(w.id);
            const isPinned = pinned.includes(w.id);
            return (
              <div key={w.id} className={`flex items-center justify-between gap-2 rounded-xl border border-navy-line px-3 py-2 ${isHidden ? "opacity-50" : ""}`}>
                <p className="text-sm text-navy min-w-0 truncate">{w.label}{isFloor ? " · always shown" : ""}</p>
                {!isFloor && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => { setPinned(toggle(pinned, w.id)); if (isHidden) setHidden(hidden.filter((x) => x !== w.id)); }}
                      className={`btn btn-sm ${isPinned ? "btn-primary" : "btn-quiet"}`} title="Pin">
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setHidden(toggle(hidden, w.id)); if (isPinned) setPinned(pinned.filter((x) => x !== w.id)); }}
                      className="btn btn-quiet btn-sm" title={isHidden ? "Show" : "Hide"}>
                      {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={save} disabled={busy} className="btn btn-primary btn-sm flex-1">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </button>
          <button onClick={onClose} disabled={busy} className="btn btn-quiet btn-sm flex-1">Cancel</button>
        </div>
      </div>
    </div>
  );
}
