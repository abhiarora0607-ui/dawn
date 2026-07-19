"use client";

// One person's attendance, day by day. The row shape follows what mature
// attendance tools settled on — date, a bar showing when they actually worked,
// hours, arrival, and whether anything needs a look — because it lets an owner
// scan a month in seconds instead of reading numbers.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { Loader2, ArrowLeft, AlertTriangle, MapPin } from "lucide-react";
import { fmtDuration, minutesToLabel, istMinutes, CLASS_LABEL, addDays, istDate } from "@/lib/attendance";

const RANGES = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "90", label: "Last 3 months", days: 90 },
];

export default function EmployeeAttendancePage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<any>(null);
  const [range, setRange] = useState("30");

  useEffect(() => {
    const days = RANGES.find((r) => r.key === range)?.days || 30;
    const to = istDate(), from = addDays(to, -(days - 1));
    setD(null);
    fetch(`/api/attendance?view=employee&id=${id}&from=${from}&to=${to}`).then((r) => r.json()).then(setD).catch(() => {});
  }, [id, range]);

  return (
    <DashboardShell>
      <DashTopbar pageTitle="Attendance" />
      <div className="w-full max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-10 py-6 sm:py-8 space-y-5">
        <Link href="/dashboard/attendance" className="flex items-center gap-1.5 text-sm text-muted hover:text-navy"><ArrowLeft className="w-4 h-4" /> All attendance</Link>

        {!d ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-navy/30" /></div>
        ) : d.error ? (
          <p className="text-muted text-sm">{d.error}</p>
        ) : (
          <>
            <div>
              <h1 className="font-display font-semibold text-2xl text-navy">{d.employee.name}</h1>
              <p className="text-muted text-sm mt-1">
                {d.employee.role || "Team member"}
                {d.employee.shiftStart ? ` · ${minutesToLabel(hm(d.employee.shiftStart))}–${minutesToLabel(hm(d.employee.shiftEnd))}` : " · flexible hours"}
                {` · ${d.employee.requiredHours}h a day`}
                {d.employee.remote && " · works remotely"}
              </p>
            </div>

            {/* the month in words, not a grid of numbers */}
            <div className="dawn-card p-5">
              <p className="font-display font-semibold text-xl text-navy">
                {d.totals.presentDays} {d.totals.presentDays === 1 ? "day" : "days"} worked
                <span className="text-muted font-normal text-base"> · {(d.totals.workedMinutes / 60).toFixed(1)} hours</span>
              </p>
              <p className="text-sm text-muted mt-1">
                {d.totals.absentDays > 0 && `${d.totals.absentDays} absent · `}
                {d.totals.halfDays > 0 && `${d.totals.halfDays} half ${d.totals.halfDays === 1 ? "day" : "days"} · `}
                {d.totals.lateDays > 0 && `${d.totals.lateDays} late · `}
                {d.totals.offDays} off
                {d.totals.flaggedDays > 0 && <span className="text-amber-deep font-medium"> · {d.totals.flaggedDays} to look at</span>}
              </p>
            </div>

            <div className="flex gap-1.5">
              {RANGES.map((r) => (
                <button key={r.key} onClick={() => setRange(r.key)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border ${range === r.key ? "bg-navy text-white border-navy" : "text-navy/60 border-navy-line"}`}>{r.label}</button>
              ))}
            </div>

            <div className="dawn-card overflow-hidden">
              <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-navy-line bg-surface/60 text-[10px] font-bold uppercase tracking-wide text-muted">
                <span className="col-span-3">Date</span>
                <span className="col-span-3">When they worked</span>
                <span className="col-span-2">Hours</span>
                <span className="col-span-2">Arrival</span>
                <span className="col-span-2">Status</span>
              </div>
              {[...d.days].reverse().map((day: any) => <DayRow key={day.work_date} day={day} shiftStart={d.employee.shiftStart} />)}
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function hm(t?: string | null) {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function DayRow({ day, shiftStart }: { day: any; shiftStart?: string | null }) {
  const c = day.classification;
  const isOff = c === "weekly_off" || c === "holiday" || c === "not_joined";
  const dt = new Date(`${day.work_date}T00:00:00Z`);
  const label = dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className={`grid sm:grid-cols-12 gap-2 sm:gap-3 px-4 py-2.5 border-b border-navy-line/40 last:border-0 items-center ${isOff ? "bg-surface/40" : ""}`}>
      <span className="sm:col-span-3 text-sm text-navy font-medium">
        {label}
        {day.holiday_name && <span className="text-[10px] font-bold uppercase bg-sky-50 text-sky-600 border border-sky-200 px-1.5 py-0.5 rounded ml-2">{day.holiday_name}</span>}
      </span>

      <span className="sm:col-span-3">
        {isOff ? <span className="text-xs text-muted">{CLASS_LABEL[c]}</span> : <DayBar logs={day.logs || []} />}
      </span>

      <span className="sm:col-span-2 text-sm text-navy">{day.worked_minutes > 0 ? fmtDuration(day.worked_minutes) : <span className="text-navy/25">—</span>}</span>

      <span className="sm:col-span-2 text-sm">
        {isOff || !(day.logs || []).length ? <span className="text-navy/25">—</span>
          : day.late_minutes > 0 ? <span className="text-amber-deep font-medium">{fmtDuration(day.late_minutes)} late</span>
          : shiftStart ? <span className="text-emerald-600">On time</span>
          : <span className="text-navy/40">{minutesToLabel(istMinutes(day.logs[0].punch_in))}</span>}
      </span>

      <span className="sm:col-span-2 flex items-center gap-1.5">
        <Pill c={c} />
        {day.flagged && <span title={day.flag_reason || ""}><AlertTriangle className="w-3.5 h-3.5 text-amber-deep shrink-0" /></span>}
      </span>
    </div>
  );
}

/** A day as a 24-hour strip, with the worked stretches filled in. */
function DayBar({ logs }: { logs: any[] }) {
  if (!logs.length) return <span className="text-xs text-navy/25">No punches</span>;
  const spans = logs.filter((l) => l.punch_in).map((l) => {
    const start = istMinutes(l.punch_in);
    const end = l.punch_out ? istMinutes(l.punch_out) : start + 15;
    return { left: (start / 1440) * 100, width: Math.max(1.5, ((end - start) / 1440) * 100), open: !l.punch_out, off: l.within_fence === false };
  });
  const first = logs[0]?.punch_in ? minutesToLabel(istMinutes(logs[0].punch_in)) : "";
  const lastOut = [...logs].reverse().find((l) => l.punch_out);
  return (
    <span className="block">
      <span className="relative block h-2 rounded-full bg-surface border border-navy-line/60 overflow-hidden">
        {spans.map((s, i) => (
          <span key={i} className={`absolute top-0 bottom-0 rounded-full ${s.open ? "bg-amber" : s.off ? "bg-amber-deep" : "bg-emerald-500"}`}
            style={{ left: `${s.left}%`, width: `${s.width}%` }} />
        ))}
      </span>
      <span className="text-[10px] text-muted mt-0.5 block">
        {first}{lastOut ? ` – ${minutesToLabel(istMinutes(lastOut.punch_out))}` : " – still in"}
        {logs.length > 1 && ` · ${logs.length} sessions`}
        {logs.some((l: any) => l.within_fence === false) && <span className="text-amber-deep"> · off-site</span>}
      </span>
    </span>
  );
}

function Pill({ c }: { c: string }) {
  const map: Record<string, string> = {
    full: "bg-emerald-50 text-emerald-700 border-emerald-200",
    half: "bg-amber/15 text-amber-deep border-amber/30",
    absent: "bg-red-50 text-red-600 border-red-200",
    weekly_off: "bg-slate-100 text-slate-500 border-slate-200",
    holiday: "bg-sky-50 text-sky-600 border-sky-200",
    leave: "bg-sky-50 text-sky-600 border-sky-200",
    missing_punch_out: "bg-amber/15 text-amber-deep border-amber/30",
    not_joined: "bg-transparent text-navy/25 border-transparent",
  };
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${map[c] || map.absent}`}>{CLASS_LABEL[c] || c}</span>;
}
