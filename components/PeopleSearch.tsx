"use client";

// Find a colleague. Used by both the owner's dashboard and the employee portal,
// because the need is identical: who is this person, how do I reach them, and
// are they in today?
//
// Contact details are shown for everyone — in a real workplace you can find a
// colleague's number, and hiding it would make this useless at the small end.
// Opening someone's *records* still respects the org scope.

import { useEffect, useRef, useState } from "react";
import { Search, X, Phone, Mail, Calendar, Loader2, Building2 } from "lucide-react";

const PRESENCE_PILL: Record<string, string> = {
  "In today": "pill-green",
  "In (half day)": "pill-amber",
  "On leave": "pill-sky",
  "Day off": "pill-grey",
  "Holiday": "pill-grey",
  "Not in": "pill-red",
  "No record yet": "pill-grey",
};

export function PeopleSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounced so typing a name doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/people?q=${encodeURIComponent(q)}`)
        .then((r) => r.json()).then((x) => { setD(x); setLoading(false); })
        .catch(() => setLoading(false));
    }, q ? 220 : 0);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="dawn-scrim" onClick={onClose}>
      <div className="dawn-sheet dawn-sheet-wide" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <Search className="w-4 h-4 text-navy/40 shrink-0" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search anyone by name, role, phone or email…"
            className="inp flex-1 border-0 focus:ring-0 px-0" />
          <button onClick={onClose} className="btn-icon" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {loading && !d ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-navy/30" /></div>
        ) : d?.results?.length === 0 ? (
          <p className="dawn-empty">Nobody matches that.</p>
        ) : (
          <div className="divide-y divide-navy-line/40 max-h-[60vh] overflow-y-auto -mx-1">
            {d?.results?.map((p: any) => (
              <div key={p.id} className="px-1 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy truncate">
                      {p.name}{p.isMe && <span className="text-muted font-normal"> (you)</span>}
                    </p>
                    <p className="t-micro text-muted truncate">
                      {p.jobTitle || p.role}
                      {p.department && <> · <Building2 className="w-3 h-3 inline -mt-0.5" /> {p.department}</>}
                    </p>
                  </div>
                  <span className={`pill ${PRESENCE_PILL[p.presence] || "pill-grey"} shrink-0`}>{p.presence}</span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="t-micro text-navy/70 hover:text-amber-deep flex items-center gap-1">
                      <Phone className="w-3 h-3" />{p.phone}
                    </a>
                  )}
                  {p.email && (
                    <a href={`mailto:${p.email}`} className="t-micro text-navy/70 hover:text-amber-deep flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3" />{p.email}
                    </a>
                  )}
                  {p.joiningDate && (
                    <span className="t-micro text-muted flex items-center gap-1">
                      <Calendar className="w-3 h-3" />joined {new Date(p.joiningDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
