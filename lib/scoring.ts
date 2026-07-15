// lib/scoring.ts
// THE single source of truth for employee performance. Every surface that
// ranks people (Business dashboard, Team Performance, Employee hub) computes
// from this one function, so "top" and "bottom" are just the two ends of the
// same list — the same person can never be both.
//
// Scores are MONTHLY: every input is windowed to one calendar month, and every
// employee starts each month at a clean slate. Month-end finals are frozen
// into employee_scores by the overnight job (see cron) for yearly review.
//
// Score = earned (0–100) − neglect penalties (capped at 30), clamped 0–100.
//   Earned:   revenue 40 · close rate 25 · customers won 15 ·
//             orders delivered 10 · tasks completed 10
//   Penalty:  cold lead −6 · overdue follow-up −4 · overdue task −2
// Revenue/won/delivered/tasks are scored RELATIVE to the team's best that
// month (best gets full points), so the scale adapts to the business's size.

const OPEN_STAGES = ["New Lead", "Contacted", "Negotiating"];
const STALE_DAYS: Record<string, number> = { "New Lead": 3, "Contacted": 7, "Negotiating": 14 };
const DAY = 86400000;

export type ScoreBreakdown = {
  revenuePts: number; closeRatePts: number; wonPts: number; deliveredPts: number; tasksPts: number;
  coldPenalty: number; overdueFollowUpPenalty: number; overdueTaskPenalty: number;
  revenue: number; won: number; lost: number; delivered: number; tasksDone: number;
  coldLeads: number; overdueFollowUps: number; overdueTasks: number;
};

export type EmployeeScore = {
  employeeId: string;
  name: string;
  score: number;
  rank: number | null;       // null = not ranked (too new / no activity / inactive)
  tooNew: boolean;
  eligible: boolean;
  breakdown: ScoreBreakdown;
};

export type ScoringResult = {
  scores: EmployeeScore[];            // sorted best → worst, unranked at the end
  top: EmployeeScore | null;
  bottom: EmployeeScore | null;       // only set when it's a meaningful signal
  month: string;                      // 'YYYY-MM'
};

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthWindow(key: string): { from: number; to: number } {
  const [y, m] = key.split("-").map(Number);
  return {
    from: new Date(y, m - 1, 1).getTime(),
    to: new Date(y, m, 0, 23, 59, 59, 999).getTime(),
  };
}

// Inputs are the raw rows each API already fetches. Cancelled orders must be
// filtered out by the CALLER (they already are, everywhere).
export function computeScores(input: {
  employees: any[];       // id, name, status, is_owner, joining_date
  contacts: any[];        // id, name, stage, employee_id, follow_up_date, created_at
  sales: any[];           // employee_id, amount_paid, date, order_status
  tasks: any[];           // employee_id, done, done_at, due_date
  activities: any[];      // contact_id, type, content, created_at  (stage_change history)
  month?: string;         // defaults to current month
}): ScoringResult {
  const month = input.month || monthKey();
  const { from, to } = monthWindow(month);
  const now = Date.now();
  const todayISO = new Date().toISOString().slice(0, 10);
  const inMonth = (d: string | null | undefined) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= from && t <= to;
  };

  const contactOwner: Record<string, string> = {};
  for (const c of input.contacts) contactOwner[c.id] = c.employee_id;

  // Last time anything happened on each contact — basis for "cold".
  const lastTouch: Record<string, number> = {};
  for (const a of input.activities) {
    const t = new Date(a.created_at).getTime();
    if (!lastTouch[a.contact_id] || t > lastTouch[a.contact_id]) lastTouch[a.contact_id] = t;
  }

  // Won/Lost THIS MONTH comes from the activity log's stage_change entries —
  // the only timestamped record of when a stage actually changed.
  const wonByEmp: Record<string, number> = {};
  const lostByEmp: Record<string, number> = {};
  for (const a of input.activities) {
    if (a.type !== "stage_change" || !inMonth(a.created_at)) continue;
    const emp = contactOwner[a.contact_id];
    if (!emp) continue;
    const c = String(a.content || "");
    if (c.includes("Customer (Won)")) wonByEmp[emp] = (wonByEmp[emp] || 0) + 1;
    else if (c.includes("Lost")) lostByEmp[emp] = (lostByEmp[emp] || 0) + 1;
  }

  // Per-employee raw month numbers.
  const raw = input.employees.map((e: any) => {
    const myContacts = input.contacts.filter((c: any) => c.employee_id === e.id);
    const myMonthOrders = input.sales.filter((s: any) => s.employee_id === e.id && inMonth(s.date));
    const revenue = myMonthOrders.reduce((a: number, s: any) => a + (Number(s.amount_paid) || 0), 0);
    const delivered = myMonthOrders.filter((s: any) => s.order_status === "Delivered").length;
    const tasksDone = input.tasks.filter((t: any) => t.employee_id === e.id && t.done && inMonth(t.done_at || t.due_date)).length;
    const won = wonByEmp[e.id] || 0;
    const lost = lostByEmp[e.id] || 0;

    // Neglect is measured NOW — it's a current-state signal, not history.
    const coldLeads = myContacts.filter((c: any) => {
      if (!OPEN_STAGES.includes(c.stage)) return false;
      const last = lastTouch[c.id] || new Date(c.created_at).getTime();
      const idle = Math.floor((now - last) / DAY);
      return idle >= (STALE_DAYS[c.stage] ?? 7);
    }).length;
    const overdueFollowUps = myContacts.filter((c: any) => OPEN_STAGES.includes(c.stage) && c.follow_up_date && c.follow_up_date < todayISO).length;
    const overdueTasks = input.tasks.filter((t: any) => t.employee_id === e.id && !t.done && t.due_date && t.due_date < todayISO).length;

    const hasAnyActivity = myContacts.length > 0 || input.sales.some((s: any) => s.employee_id === e.id);
    const daysEmployed = e.joining_date ? Math.floor((now - new Date(e.joining_date).getTime()) / DAY) : 999;
    const tooNew = daysEmployed < 14 && myContacts.length < 3;

    return { e, revenue, won, lost, delivered, tasksDone, coldLeads, overdueFollowUps, overdueTasks, hasAnyActivity, tooNew };
  });

  // Team maxima for relative scoring (only among candidates with activity).
  const active = raw.filter((r) => r.e.status === "active");
  const maxRevenue = Math.max(0, ...active.map((r) => r.revenue));
  const maxWon = Math.max(0, ...active.map((r) => r.won));
  const maxDelivered = Math.max(0, ...active.map((r) => r.delivered));
  const maxTasks = Math.max(0, ...active.map((r) => r.tasksDone));

  const scores: EmployeeScore[] = raw.map((r) => {
    const revenuePts = maxRevenue > 0 ? Math.round((r.revenue / maxRevenue) * 40) : 0;
    const decided = r.won + r.lost;
    const closeRatePts = decided > 0 ? Math.round((r.won / decided) * 25) : 0;
    const wonPts = maxWon > 0 ? Math.round((r.won / maxWon) * 15) : 0;
    const deliveredPts = maxDelivered > 0 ? Math.round((r.delivered / maxDelivered) * 10) : 0;
    const tasksPts = maxTasks > 0 ? Math.round((r.tasksDone / maxTasks) * 10) : 0;

    const coldPenalty = r.coldLeads * 6;
    const overdueFollowUpPenalty = r.overdueFollowUps * 4;
    const overdueTaskPenalty = r.overdueTasks * 2;
    const penalty = Math.min(30, coldPenalty + overdueFollowUpPenalty + overdueTaskPenalty);

    const earned = revenuePts + closeRatePts + wonPts + deliveredPts + tasksPts;
    const score = Math.max(0, Math.min(100, earned - penalty));

    // Owner record only ranks if it actually participates; inactive never ranks.
    const eligible = r.e.status === "active" && !r.tooNew && (!r.e.is_owner || r.hasAnyActivity) && r.hasAnyActivity;

    return {
      employeeId: r.e.id,
      name: r.e.name,
      score,
      rank: null,
      tooNew: r.tooNew,
      eligible,
      breakdown: {
        revenuePts, closeRatePts, wonPts, deliveredPts, tasksPts,
        coldPenalty, overdueFollowUpPenalty, overdueTaskPenalty,
        revenue: r.revenue, won: r.won, lost: r.lost, delivered: r.delivered, tasksDone: r.tasksDone,
        coldLeads: r.coldLeads, overdueFollowUps: r.overdueFollowUps, overdueTasks: r.overdueTasks,
      },
    };
  });

  // Rank the eligible, best first; unranked trail the list.
  const ranked = scores.filter((s) => s.eligible).sort((a, b) => b.score - a.score);
  ranked.forEach((s, i) => { s.rank = i + 1; });
  const unranked = scores.filter((s) => !s.eligible).sort((a, b) => b.score - a.score);

  const top = ranked[0] || null;
  // "Bottom" is only a signal worth showing when: 3+ ranked people, the lowest
  // is genuinely struggling (score < 40), and it isn't the same person as top.
  const last = ranked.length >= 3 ? ranked[ranked.length - 1] : null;
  const bottom = last && last.score < 40 && last.employeeId !== top?.employeeId ? last : null;

  return { scores: [...ranked, ...unranked], top, bottom, month };
}
