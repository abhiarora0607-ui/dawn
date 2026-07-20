"use client";

// Attendance, for the owner.
//
// Four tabs, because these are genuinely four different questions:
//   Today    — who's here right now?
//   Month    — how many days did each person work? (the payroll question)
//   Requests — who's asking me to fix a day?
//   Setup    — where's the shop, how long is a day, when are the holidays?

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { ToastProvider, useToast } from "@/components/Toast";
import {
  Loader2, MapPin, Clock, Check, X, CalendarClock, Users, Search,
  AlertTriangle, Plus, Trash2, Crosshair, Inbox,
} from "lucide-react";
import { fmtDuration, minutesToLabel, istMinutes, CLASS_LABEL } from "@/lib/attendance";

const TABS = [
  { id: "today", label: "Today", icon: Users },
  { id: "month", label: "Month", icon: CalendarClock },
  { id: "requests", label: "Requests", icon: Inbox },
  { id: "setup", label: "Setup", icon: MapPin },
] as const;
type TabId = (typeof TABS)[number]["id"];

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export default function AttendancePage() {
  return (
    <ToastProvider>
      <DashboardShell>
        <DashTopbar pageTitle="Attendance" />
        <Inner />
      </DashboardShell>
    </ToastProvider>
  );
}

function Inner() {
  const [tab, setTab] = useState<TabId>("today");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    fetch("/api/attendance/requests?status=pending").then((r) => r.json()).then((d) => setPending((d.requests || []).length)).catch(() => {});
  }, [tab]);

  return (
    <div className="dawn-page space-y-5">
      <div>
        <h1 className="font-display font-semibold text-2xl text-navy">Attendance</h1>
        <p className="text-muted text-sm mt-1">Who worked, when, and for how long.</p>
      </div>

      <div className="flex gap-1 border-b border-navy-line overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? "border-amber-deep text-navy" : "border-transparent text-muted hover:text-navy"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
            {t.id === "requests" && pending > 0 && (
              <span className="text-[12px] font-bold bg-amber text-navy px-1.5 py-0.5 rounded-full">{pending}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "today" && <TodayTab />}
      {tab === "month" && <MonthTab />}
      {tab === "requests" && <RequestsTab onChange={() => setPending((p) => Math.max(0, p - 1))} />}
      {tab === "setup" && <SetupTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ TODAY */

function TodayTab() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/attendance?view=today").then((r) => r.json()).then(setD).catch(() => {}); }, []);
  if (!d) return <Loading />;
  if (d.error) return <p className="text-muted text-sm py-8">{d.error}</p>;

  const s = d.summary || {};
  const line = d.holidayName
    ? `Holiday — ${d.holidayName}`
    : s.onShift > 0
      ? `${s.onShift} ${s.onShift === 1 ? "person is" : "people are"} on shift`
      : s.present > 0 ? `${s.present} worked today` : "Nobody has punched in yet";

  return (
    <>
      <div className="dawn-card p-5">
        <p className="font-display font-semibold text-xl text-navy">{line}</p>
        <p className="text-sm text-muted mt-0.5">
          {s.absent > 0 && `${s.absent} absent · `}
          {s.off > 0 && `${s.off} off · `}
          {s.flagged > 0 ? <span className="text-amber-deep font-medium">{s.flagged} needs a look</span> : "Nothing flagged"}
        </p>
        {!d.shopSet && (
          <p className="text-xs text-amber-deep mt-3 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            No shop location set yet, so punches aren&apos;t location-checked. Add it under Setup.
          </p>
        )}
      </div>

      {d.rows.length === 0 ? (
        <Empty>No employees are set up for attendance yet.</Empty>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {d.rows.map((r: any) => (
            <div key={r.id} className="dawn-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-navy truncate">{r.name}</p>
                  <p className="text-xs text-muted">{r.role || "Team member"}{r.remote && " · Remote"}</p>
                </div>
                <StatusPill c={r.classification} onShift={r.onShift} />
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm">
                {r.firstIn && <span className="text-navy">In <span className="font-medium">{minutesToLabel(istMinutes(r.firstIn))}</span></span>}
                {r.lastOut && !r.onShift && <span className="text-navy">Out <span className="font-medium">{minutesToLabel(istMinutes(r.lastOut))}</span></span>}
                {r.minutes > 0 && <span className="text-navy">Worked <span className="font-medium">{fmtDuration(r.minutes)}</span></span>}
                {r.lateMinutes > 0 && <span className="text-amber-deep font-medium">{fmtDuration(r.lateMinutes)} late</span>}
              </div>

              {r.flagged && r.flagReason && (
                <p className="text-xs text-amber-deep mt-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {r.flagReason}</p>
              )}
              <Link href={`/dashboard/attendance/${r.id}`} className="text-xs font-medium text-navy/50 hover:text-amber-deep mt-2 inline-block">View history →</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ MONTH */

function MonthTab() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    setD(null);
    fetch(`/api/attendance?view=month&month=${month}`).then((r) => r.json()).then(setD).catch(() => {});
  }, [month]);

  function exportCsv() {
    const head = ["Employee", "Present days", "Half days", "Absent", "Leave", "Off", "Hours"];
    const rows = d.grid.map((g: any) => [g.name, g.totals.presentDays, g.totals.halfDays, g.totals.absentDays, g.totals.leaveDays, g.totals.offDays, (g.totals.workedMinutes / 60).toFixed(1)]);
    const csv = [head, ...rows].map((r: any[]) => r.map((c: any) => `"${String(c ?? "")}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `attendance-${month}.csv`; a.click();
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="inp w-44" />
        {d?.grid?.length > 0 && <button onClick={exportCsv} className="text-sm font-medium text-navy/60 hover:text-navy border border-navy-line px-3 py-2 rounded-xl">Export CSV</button>}
      </div>

      {!d ? <Loading /> : d.grid.length === 0 ? <Empty>No employees to show.</Empty> : (
        <>
        <MonthSummary d={d} />
        <MonthCards d={d} />

        <div className="dawn-card dawn-table-wrap hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-line">
                <th className="text-left px-3 py-2.5 font-semibold text-navy sticky-col min-w-[130px]">Employee</th>
                {d.dates.map((dt: string) => {
                  const isToday = dt === d.today;
                  return (
                    <th key={dt} className={`px-0.5 py-2.5 text-[12px] font-medium w-7 ${isToday ? "text-amber-deep" : "text-muted"}`}>
                      {isToday ? <span className="block w-5 h-5 mx-auto rounded-full bg-amber/20 leading-5">{dt.slice(8)}</span> : dt.slice(8)}
                      <span className="block text-[12px] text-navy/30">{DAY_LETTERS[new Date(`${dt}T00:00:00Z`).getUTCDay()]}</span>
                    </th>
                  );
                })}
                <th className="px-3 py-2.5 text-right font-semibold text-navy whitespace-nowrap">Days</th>
                <th className="px-3 py-2.5 text-right font-semibold text-navy whitespace-nowrap">Hours</th>
              </tr>
            </thead>
            <tbody>
              {d.grid.map((g: any) => (
                <tr key={g.id} className="border-b border-navy-line/40 last:border-0">
                  <td className="px-3 py-2 sticky-col">
                    <Link href={`/dashboard/attendance/${g.id}`} className="font-medium text-navy hover:text-amber-deep truncate block max-w-[130px]">{g.name}</Link>
                  </td>
                  {g.cells.map((c: any) => <td key={c.date} className="px-0.5 py-2 text-center"><Cell c={c} /></td>)}
                  <td className="px-3 py-2 text-right font-semibold text-navy">{g.totals.presentDays}</td>
                  <td className="px-3 py-2 text-right text-muted whitespace-nowrap">{(g.totals.workedMinutes / 60).toFixed(1)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-3 px-3 py-3 border-t border-navy-line text-[12px] text-muted">
            <Legend cls="bg-emerald-500" label="Full day" />
            <Legend cls="bg-amber" label="Half day" />
            <Legend cls="bg-red-400" label="Absent" />
            <Legend cls="bg-sky-300" label="Leave / holiday" />
            <Legend cls="bg-slate-200" label="Weekly off" />
            <Legend cls="bg-white border border-dashed border-navy-line" label="Not yet" />
          </div>
        </div>
        </>
      )}
    </>
  );
}

// A sentence before the grid, because a wall of squares doesn't tell an owner
// what happened this month.
function MonthSummary({ d }: { d: any }) {
  const people = d.grid.length;
  const totalDays = d.grid.reduce((n: number, g: any) => n + g.totals.presentDays, 0);
  const absent = d.grid.reduce((n: number, g: any) => n + g.totals.absentDays, 0);
  const leave = d.grid.reduce((n: number, g: any) => n + g.totals.leaveDays, 0);
  const hours = d.grid.reduce((n: number, g: any) => n + g.totals.workedMinutes, 0) / 60;
  const flagged = d.grid.reduce((n: number, g: any) => n + (g.totals.flaggedDays || 0), 0);

  return (
    <div className="dawn-card p-5">
      <p className="font-display font-semibold text-xl text-navy">
        {totalDays === 0 ? "Nothing recorded yet this month" : `${totalDays} ${totalDays === 1 ? "day" : "days"} worked across ${people} ${people === 1 ? "person" : "people"}`}
      </p>
      <p className="text-sm text-muted mt-0.5">
        {hours > 0 && `${hours.toFixed(1)} hours · `}
        {absent > 0 && `${absent} absent · `}
        {leave > 0 && `${leave} on leave · `}
        {flagged > 0 ? <span className="text-amber-deep font-medium">{flagged} to look at</span> : "nothing flagged"}
      </p>
      {totalDays === 0 && (
        <p className="text-xs text-muted mt-2">
          Days only appear once someone punches in. If your team hasn&apos;t started using the portal yet, this stays empty.
        </p>
      )}
    </div>
  );
}

// Phone view of the month: one card per person, the month as a wrapped strip
// of small squares, and the numbers said in words underneath. Tapping a square
// still reveals the date and hours via title, and the whole card links through
// to that person's full history.
function MonthCards({ d }: { d: any }) {
  return (
    <div className="grid gap-3 md:hidden">
      {d.grid.map((g: any) => {
        const worked = g.cells.filter((c: any) => c.c === "full" || c.c === "half");
        const flagged = g.cells.filter((c: any) => c.f).length;
        return (
          <div key={g.id} className="dawn-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/dashboard/attendance/${g.id}`} className="font-semibold text-navy hover:text-amber-deep block truncate">{g.name}</Link>
                {g.role && <p className="t-micro text-muted truncate">{g.role}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="font-display font-semibold text-xl text-navy leading-none">{g.totals.presentDays}</p>
                <p className="t-micro text-muted mt-0.5">{g.totals.presentDays === 1 ? "day" : "days"}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 mt-3">
              {g.cells.map((c: any) => <Cell key={c.date} c={c} />)}
            </div>

            <p className="t-micro text-muted mt-3">
              {(g.totals.workedMinutes / 60).toFixed(1)}h worked
              {g.totals.absentDays > 0 && ` · ${g.totals.absentDays} absent`}
              {g.totals.leaveDays > 0 && ` · ${g.totals.leaveDays} on leave`}
              {flagged > 0 && <span className="text-amber-deep font-medium"> · {flagged} to check</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Cell({ c }: { c: any }) {
  const map: Record<string, string> = {
    full: "bg-emerald-500", half: "bg-amber", absent: "bg-red-400",
    leave: "bg-sky-300", holiday: "bg-sky-300", weekly_off: "bg-slate-200",
    missing_punch_out: "bg-amber-deep", not_joined: "bg-transparent",
  };
  const title = `${c.date} · ${CLASS_LABEL[c.c] || c.c}${c.m ? ` · ${fmtDuration(c.m)}` : ""}`;
  if (c.c === "not_joined") return <span className="block w-5 h-5 mx-auto rounded border border-dashed border-navy-line/60" title={title} />;
  return <span className={`block w-5 h-5 mx-auto rounded ${map[c.c] || "bg-slate-200"} ${c.f ? "ring-2 ring-amber-deep/40" : ""}`} title={title} />;
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${cls}`} /> {label}</span>;
}

/* --------------------------------------------------------------- REQUESTS */

function RequestsTab({ onChange }: { onChange: () => void }) {
  const { toast } = useToast();
  const [d, setD] = useState<any>(null);
  const [status, setStatus] = useState("pending");
  const [busy, setBusy] = useState("");

  function load() {
    setD(null);
    fetch(`/api/attendance/requests?status=${status}`).then((r) => r.json()).then(setD).catch(() => {});
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    const res = await fetch("/api/attendance/requests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const out = await res.json();
    setBusy("");
    if (out.ok) { toast(action === "approve" ? "Approved — the day has been updated" : "Rejected"); onChange(); load(); }
    else toast(out.error || "Couldn't do that", "error");
  }

  return (
    <>
      <div className="flex gap-1.5">
        {["pending", "approved", "rejected", "all"].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border capitalize ${status === s ? "bg-navy text-white border-navy" : "text-navy/60 border-navy-line"}`}>{s}</button>
        ))}
      </div>

      {!d ? <Loading /> : d.requests?.length === 0 ? (
        <Empty>{status === "pending" ? "No requests waiting. Nothing to do." : `No ${status} requests.`}</Empty>
      ) : (
        <div className="space-y-2">
          {d.requests.map((r: any) => (
            <div key={r.id} className="dawn-card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-navy">
                    {r.employee_name}
                    <span className="font-normal text-muted"> · {new Date(r.work_date).toLocaleDateString()}</span>
                  </p>
                  <p className="text-sm text-navy/70 mt-1">&ldquo;{r.reason}&rdquo;</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(r.proposed_logs || []).map((l: any, i: number) => (
                      <span key={i} className="text-xs bg-surface border border-navy-line rounded-lg px-2 py-1 text-navy">
                        {l.in} → {l.out}
                      </span>
                    ))}
                  </div>
                  <p className="text-[12px] text-muted mt-2">Asked {new Date(r.created_at).toLocaleString()}</p>
                </div>
                {r.status === "pending" ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button disabled={!!busy} onClick={() => decide(r.id, "approve")} className="flex items-center gap-1.5 text-sm font-medium bg-navy text-white px-3 py-2 rounded-xl disabled:opacity-50">
                      {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
                    </button>
                    <button disabled={!!busy} onClick={() => decide(r.id, "reject")} className="flex items-center gap-1.5 text-sm font-medium text-navy/60 border border-navy-line px-3 py-2 rounded-xl disabled:opacity-50">
                      <X className="w-4 h-4" /> Reject
                    </button>
                  </div>
                ) : (
                  <span className={`text-[12px] font-bold uppercase px-2 py-1 rounded shrink-0 ${r.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ SETUP */

function SetupTab() {
  const { toast } = useToast();
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [hol, setHol] = useState({ date: "", name: "" });
  const [locating, setLocating] = useState(false);
  const [locHelp, setLocHelp] = useState("");
  const [pasted, setPasted] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  function load() {
    fetch("/api/attendance/settings").then((r) => r.json()).then((x) => { setD(x); setF(x.settings); }).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/attendance/settings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
    });
    const out = await res.json();
    setSaving(false);
    if (out.ok) { toast("Saved"); load(); } else toast(out.error || "Couldn't save", "error");
  }

  function useMyLocation() {
    if (!navigator.geolocation) { toast("This browser can't share a location. Paste the coordinates instead.", "error"); return; }
    setLocating(true); setLocHelp("");

    // Two attempts, and the order matters.
    //
    // enableHighAccuracy asks for a GPS-grade fix. A laptop has no GPS radio,
    // so the browser can sit waiting for a precision it will never reach and
    // time out — which is why a "use my location" button can fail on a machine
    // where Google Maps works perfectly well. Maps doesn't ask for high
    // accuracy; it takes the wifi-based fix and moves on.
    //
    // So: ask for the cheap fix first with a generous timeout, and only reach
    // for high accuracy as a second try if the first genuinely fails.
    const onOk = (pos: GeolocationPosition) => {
      setF({
        ...f,
        shop_lat: Number(pos.coords.latitude.toFixed(6)),
        shop_lng: Number(pos.coords.longitude.toFixed(6)),
      });
      setLocating(false);
      const acc = Math.round(pos.coords.accuracy || 0);
      setLocHelp("");
      toast(acc > 200
        ? `Location captured, accurate to about ${acc}m — check it on the map before saving`
        : "Location captured — remember to save");
    };

    const onFail = (err: GeolocationPositionError) => {
      setLocating(false);
      setLocHelp(
        err.code === 1
          ? "Your browser blocked the request. Click the icon at the left of the address bar, allow Location for this site, then try again."
          : err.code === 3
            ? "Your device took too long to answer. Paste the coordinates from Google Maps below — it's more accurate for a fixed address anyway."
            : "Your device couldn't work out where it is right now. Paste the coordinates from Google Maps below.",
      );
      toast("Couldn't get your location", "error");
    };

    navigator.geolocation.getCurrentPosition(
      onOk,
      () => {
        // First try failed — now try the precise one before giving up.
        navigator.geolocation.getCurrentPosition(onOk, onFail, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  }

  /** Find the shop by name or address. Works when geolocation won't. */
  async function searchAddress() {
    const q = query.trim();
    if (!q) return;
    setSearching(true); setResults([]); setLocHelp("");
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`, {
        headers: { "Accept-Language": "en" },
      });
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        setLocHelp("Nothing found. Try adding the city, or paste coordinates below.");
      } else {
        setResults(rows.map((r: any) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) })));
      }
    } catch {
      setLocHelp("Couldn't reach the address lookup. Paste coordinates below instead.");
    }
    setSearching(false);
  }

  /** Accepts a Google Maps link or a plain "lat, lng" pair. */
  function applyPasted() {
    const v = pasted.trim();
    if (!v) return;
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,          // .../@28.681,77.065,17z
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,       // ...!3d28.681!4d77.065
      /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/, // 28.681, 77.065
    ];
    for (const re of patterns) {
      const m = re.exec(v);
      if (m) {
        setF({ ...f, shop_lat: Number(m[1]), shop_lng: Number(m[2]) });
        setPasted(""); setLocHelp("");
        toast("Coordinates read — remember to save");
        return;
      }
    }
    toast("Couldn't find coordinates in that. Try \"28.6812, 77.0654\".", "error");
  }

  async function addHoliday() {
    if (!hol.date) return;
    await fetch("/api/attendance/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_holiday", ...hol }) });
    setHol({ date: "", name: "" }); load();
  }
  async function removeHoliday(id: string) {
    await fetch("/api/attendance/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove_holiday", id }) });
    load();
  }

  if (!d || !f) return <Loading />;
  const hasShop = f.shop_lat != null && f.shop_lat !== "" && f.shop_lng != null && f.shop_lng !== "";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="dawn-card p-5 space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-navy">
          <input type="checkbox" checked={f.enabled !== false} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
          Attendance is switched on for this business
        </label>
      </div>

      <div className="dawn-card p-5">
        <p className="font-semibold text-navy mb-1 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-amber-deep" /> Where the shop is</p>
        <p className="text-xs text-muted mb-3">Staff punching in from further than this are recorded and flagged, so you always get the record and the truth.</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <label className="block"><span className="text-xs text-muted">Latitude</span><input value={f.shop_lat ?? ""} onChange={(e) => setF({ ...f, shop_lat: e.target.value === "" ? null : e.target.value })} className="inp mt-1" placeholder="Not set" /></label>
          <label className="block"><span className="text-xs text-muted">Longitude</span><input value={f.shop_lng ?? ""} onChange={(e) => setF({ ...f, shop_lng: e.target.value === "" ? null : e.target.value })} className="inp mt-1" placeholder="Not set" /></label>
          <label className="block"><span className="text-xs text-muted">Radius (metres)</span><input type="number" value={f.geofence_radius_m} onChange={(e) => setF({ ...f, geofence_radius_m: e.target.value })} className="inp mt-1" /></label>
        </div>
        {/* Search by address first: it's the one route that works whatever the
            browser or device decides about sharing a location. */}
        <div className="mt-4">
          <span className="text-xs font-medium text-navy">Find your shop</span>
          <div className="flex gap-2 mt-1.5">
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchAddress()}
              placeholder="Shop name, or address with city" className="inp flex-1" />
            <button onClick={searchAddress} disabled={searching || !query.trim()}
              className="flex items-center gap-1.5 text-sm font-medium bg-navy text-white px-4 rounded-xl disabled:opacity-50">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search
            </button>
          </div>
          {results.length > 0 && (
            <div className="mt-2 border border-navy-line rounded-xl overflow-hidden">
              {results.map((r, i) => (
                <button key={i} onClick={() => { setF({ ...f, shop_lat: Number(r.lat.toFixed(6)), shop_lng: Number(r.lng.toFixed(6)) }); setResults([]); setQuery(""); toast("Location set — remember to save"); }}
                  className="w-full text-left px-3 py-2.5 text-sm text-navy hover:bg-surface border-b border-navy-line/40 last:border-0">
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {Number(f.geofence_radius_m) > 0 && Number(f.geofence_radius_m) < 100 && (
          <p className="text-xs text-amber-deep mt-2 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Under 100m is tight. Phone positions drift by 30–100m indoors, so a small radius flags people who are actually at the shop. 150m is a safer starting point.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-navy-line/60">
          <button onClick={useMyLocation} disabled={locating} className="flex items-center gap-1.5 text-sm font-medium text-amber-deep border border-amber/40 px-3 py-2 rounded-xl hover:bg-amber/5 disabled:opacity-60">
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />} Use my current location
          </button>
          <span className="text-[12px] text-muted">Only accurate if you&apos;re at the shop right now.</span>
        </div>
        {locHelp && <p className="text-xs text-amber-deep mt-2 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {locHelp}</p>}

        <div className="mt-3 pt-3 border-t border-navy-line/60">
          <span className="text-xs text-muted">Or paste from Google Maps</span>
          <div className="flex gap-2 mt-1">
            <input value={pasted} onChange={(e) => setPasted(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyPasted()}
              placeholder="Paste a maps link, or 28.6812, 77.0654" className="inp flex-1" />
            <button onClick={applyPasted} className="text-sm font-medium text-navy border border-navy-line px-4 rounded-xl hover:bg-surface">Read</button>
          </div>
          <p className="text-[12px] text-muted mt-1">
            In Google Maps, right-click your shop (or long-press on a phone) — the coordinates appear at the top of the menu.
          </p>
          {hasShop && (
            <a href={`https://www.google.com/maps?q=${f.shop_lat},${f.shop_lng}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-deep underline mt-2">
              <MapPin className="w-3.5 h-3.5" /> Check this spot on a map before saving
            </a>
          )}
        </div>
        <label className={`flex items-start gap-2 text-sm mt-4 ${hasShop ? "text-navy" : "text-navy/40"}`}>
          <input type="checkbox" disabled={!hasShop} checked={!!f.enforce_geofence && hasShop}
            onChange={(e) => setF({ ...f, enforce_geofence: e.target.checked })} className="mt-0.5" />
          <span>
            Block punches from outside the shop
            <span className="block text-xs text-muted">
              {!hasShop
                ? "Set the shop location first — with no location to compare against, blocking would do nothing."
                : f.enforce_geofence
                  ? "On. Staff must be at the shop, and must allow location access. If their phone can't get a fix, they can't punch — they'll have to send you a fix request instead."
                  : "Off. Punches from elsewhere are still recorded, and flagged for you to see."}
            </span>
          </span>
        </label>
      </div>

      <div className="dawn-card p-5">
        <p className="font-semibold text-navy mb-3 flex items-center gap-1.5"><Clock className="w-4 h-4 text-amber-deep" /> What counts as a day</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <label className="block"><span className="text-xs text-muted">Required hours/day</span><input type="number" step="0.5" value={f.required_hours} onChange={(e) => setF({ ...f, required_hours: e.target.value })} className="inp mt-1" /></label>
          <label className="block"><span className="text-xs text-muted">Half day from (%)</span><input type="number" value={f.half_day_pct} onChange={(e) => setF({ ...f, half_day_pct: e.target.value })} className="inp mt-1" /></label>
          <label className="block"><span className="text-xs text-muted">Full day from (%)</span><input type="number" value={f.full_day_pct} onChange={(e) => setF({ ...f, full_day_pct: e.target.value })} className="inp mt-1" /></label>
        </div>
        <p className="text-[12px] text-muted mt-2">
          Under {f.half_day_pct}% of {f.required_hours}h counts as a full day&apos;s leave · {f.half_day_pct}–{f.full_day_pct}% is a half day · {f.full_day_pct}% or more is a full day.
        </p>
        <div className="mt-4">
          <span className="text-xs text-muted">Weekly off (business default)</span>
          <div className="flex gap-1 mt-1.5">
            {DAY_LETTERS.map((dl, i) => {
              const on = (f.default_weekly_offs || []).includes(i);
              return (
                <button key={i} onClick={() => setF({ ...f, default_weekly_offs: on ? f.default_weekly_offs.filter((x: number) => x !== i) : [...(f.default_weekly_offs || []), i] })}
                  className={`w-9 h-9 rounded-lg text-xs font-semibold border ${on ? "bg-navy text-white border-navy" : "border-navy-line text-navy/50"}`}>{dl}</button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="dawn-card p-5">
        <p className="font-semibold text-navy mb-3">Fixing missed punches</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block"><span className="text-xs text-muted">Requests per person per month</span><input type="number" value={f.regularization_quota} onChange={(e) => setF({ ...f, regularization_quota: e.target.value })} className="inp mt-1" /></label>
          <label className="block"><span className="text-xs text-muted">How far back they can fix (days)</span><input type="number" value={f.regularization_back_days} onChange={(e) => setF({ ...f, regularization_back_days: e.target.value })} className="inp mt-1" /></label>
        </div>
        <p className="text-[12px] text-muted mt-2">Rejected requests don&apos;t count against the allowance. Individual people can be given extra on their employee record.</p>
      </div>

      <button onClick={save} disabled={saving} className="w-full sm:w-auto bg-navy text-white font-semibold px-6 py-3 rounded-xl disabled:opacity-60">
        {saving ? "Saving…" : "Save settings"}
      </button>

      <div className="dawn-card p-5">
        <p className="font-semibold text-navy mb-3">Holidays</p>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <label className="block"><span className="text-xs text-muted">Date</span><input type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} className="inp mt-1" /></label>
          <label className="block flex-1 min-w-[140px]"><span className="text-xs text-muted">Name</span><input value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} placeholder="Diwali" className="inp mt-1" /></label>
          <button onClick={addHoliday} className="flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Add</button>
        </div>
        {d.holidays.length === 0 ? <p className="text-xs text-muted">No holidays added yet.</p> : (
          <div className="space-y-1">
            {d.holidays.map((h: any) => (
              <div key={h.id} className="flex items-center justify-between text-sm border-b border-navy-line/40 py-1.5 last:border-0">
                <span className="text-navy">{new Date(h.holiday_date).toLocaleDateString()} · <span className="text-muted">{h.name}</span></span>
                <button onClick={() => removeHoliday(h.id)} className="text-navy/30 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

function StatusPill({ c, onShift }: { c: string; onShift?: boolean }) {
  const map: Record<string, string> = {
    full: "bg-emerald-50 text-emerald-700 border-emerald-200",
    half: "bg-amber/15 text-amber-deep border-amber/30",
    absent: "bg-red-50 text-red-600 border-red-200",
    weekly_off: "bg-slate-100 text-slate-500 border-slate-200",
    holiday: "bg-sky-50 text-sky-600 border-sky-200",
    leave: "bg-sky-50 text-sky-600 border-sky-200",
    missing_punch_out: "bg-amber/15 text-amber-deep border-amber/30",
    not_joined: "bg-slate-100 text-slate-400 border-slate-200",
  };
  const label = onShift ? "On shift" : CLASS_LABEL[c] || c;
  return <span className={`text-[12px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border shrink-0 ${map[c] || map.absent}`}>{label}</span>;
}

function Loading() { return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>; }
function Empty({ children }: { children: React.ReactNode }) { return <p className="text-sm text-muted py-10 text-center">{children}</p>; }
