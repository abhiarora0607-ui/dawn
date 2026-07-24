// lib/nav.ts
// The navigation registry (V60) — the V51 composition law, generalized from
// widgets to PAGES. One list declares every destination in the app shell and
// WHO it belongs to; the shell renders what the current actor is allowed and
// blocks the rest by the same rule. There is no second copy of this truth:
// invariant 34 fails the build if the shell hardcodes routes around it, and
// fails it louder if an employee entry points at a page that doesn't exist —
// dead doors are a build error now, not a support ticket later.
//
// V60 scope note: employee CRM (leads/orders/messages/tasks…) still lives in
// the /team portal until V61 re-homes it. Honest visibility: those areas are
// simply absent from the employee nav here — never shown broken.

// Icons are NAME STRINGS on purpose: the registry is data + law, importable
// by rule tests and invariants without dragging a UI library along. The
// shell resolves names to lucide components at render time.

export type EmployeeActor = {
  kind: "employee";
  name: string;
  permissions: string[];   // server-effective (migrated + implied) — plain includes() is correct
  isAdmin: boolean;
  isLead: boolean;
  dept: string;
};
export type Actor = { kind: "owner" } | EmployeeActor | { kind: null };

export type NavEntry = {
  href: string;
  label: string;
  empLabel?: string;                 // what an employee sees ("Briefing" → "Home")
  icon: string;
  section: "crm" | "ig" | "bottom" | "employee";
  who: "owner" | "employee" | "both";
  perm?: string;                     // employee permission gate
  when?: (a: EmployeeActor) => boolean; // employee position/context gate
  badge?: boolean;
  lockArea?: "crm" | "instagram_ai"; // owner entitlement lock (plan features)
};

const DECIDE_PERMS = ["leave_approve", "attendance_approve", "expense_approve", "payment_record", "payroll_approve"];

export const NAV: NavEntry[] = [
  // ---- shared home ----------------------------------------------------------
  { href: "/dashboard", label: "Briefing", empLabel: "Home", icon: "LayoutDashboard", section: "ig", who: "both" },

  // ---- owner · CRM & Business (verbatim from the old shell arrays) ---------
  { href: "/dashboard/business", label: "Business", icon: "LayoutDashboard", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/attention", label: "Attention", icon: "Flame", section: "crm", who: "owner", badge: true, lockArea: "crm" },
  { href: "/dashboard/contacts", label: "Contacts", icon: "Contact", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/orders", label: "Orders", icon: "ShoppingBag", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/suggestions", label: "Suggestions", icon: "Lightbulb", section: "crm", who: "owner", badge: true, lockArea: "instagram_ai" },
  { href: "/dashboard/sales", label: "Finance", icon: "Wallet", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/employees", label: "Employees", icon: "UserCog", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/attendance", label: "Attendance", icon: "CalendarClock", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/leave", label: "Leave", icon: "Palmtree", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/org", label: "Organisation", icon: "Network", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/payroll", label: "Payroll", icon: "Wallet", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/performance", label: "Team Performance", icon: "BarChart3", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/team-work", label: "Team Work", icon: "CheckSquare", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/records", label: "Records", icon: "Database", section: "crm", who: "owner", lockArea: "crm" },
  { href: "/dashboard/price-list", label: "Price List", icon: "Tag", section: "crm", who: "owner", lockArea: "crm" },

  // ---- owner · Instagram & AI ----------------------------------------------
  { href: "/dashboard/create", label: "Create", icon: "Plus", section: "ig", who: "owner", lockArea: "instagram_ai" },
  { href: "/dashboard/studio", label: "Studio", icon: "CalendarDays", section: "ig", who: "owner", lockArea: "instagram_ai" },
  { href: "/dashboard/queue", label: "Queue", icon: "CalendarClock", section: "ig", who: "owner", lockArea: "instagram_ai" },
  { href: "/dashboard/engage", label: "Engage", icon: "MessageSquare", section: "ig", who: "owner", lockArea: "instagram_ai" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "TrendingUp", section: "ig", who: "owner", lockArea: "instagram_ai" },
  { href: "/dashboard/competitors", label: "Competitors", icon: "Users", section: "ig", who: "owner", lockArea: "instagram_ai" },
  { href: "/dashboard/content", label: "Content", icon: "PenLine", section: "ig", who: "owner", lockArea: "instagram_ai" },
  { href: "/dashboard/saved", label: "Saved", icon: "Bookmark", section: "ig", who: "owner", lockArea: "instagram_ai" },
  { href: "/dashboard/brand-voice", label: "Brand Voice", icon: "Mic", section: "ig", who: "owner", lockArea: "instagram_ai" },

  // ---- employee · Your workspace (V60 spine; CRM arrives in V61) -----------
  { href: "/dashboard/inbox", label: "Inbox", icon: "Inbox", section: "employee", who: "employee",
    when: (a) => a.isAdmin || a.isLead || DECIDE_PERMS.some((p) => a.permissions.includes(p)) },
  { href: "/dashboard/my-attendance", label: "Attendance", icon: "CalendarClock", section: "employee", who: "employee" },
  { href: "/dashboard/my-leave", label: "Leave", icon: "Palmtree", section: "employee", who: "employee" },
  { href: "/dashboard/pay", label: "My Pay", icon: "IndianRupee", section: "employee", who: "employee" },
  { href: "/dashboard/expenses", label: "Expenses", icon: "Receipt", section: "employee", who: "employee" },
  { href: "/dashboard/payroll-run", label: "Payroll", icon: "Wallet", section: "employee", who: "employee",
    when: (a) => a.isAdmin || a.permissions.includes("salary_view") },
  { href: "/dashboard/my-studio", label: "Studio", icon: "Sparkles", section: "employee", who: "employee", perm: "content_tools" },
  { href: "/dashboard/people", label: "People", icon: "Search", section: "employee", who: "employee" },
  { href: "/dashboard/my-team", label: "My Team", icon: "Users2", section: "employee", who: "employee",
    when: (a) => a.isAdmin || a.isLead },

  // ---- bottom ---------------------------------------------------------------
  { href: "/dashboard/billing", label: "Billing", icon: "CreditCard", section: "bottom", who: "owner" },
  { href: "/contact", label: "Help & support", icon: "LifeBuoy", section: "bottom", who: "both" },
  { href: "/dashboard/recovery", label: "Recently deleted", icon: "RotateCcw", section: "bottom", who: "owner" },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings", section: "bottom", who: "owner" },
];

/** May this actor use this entry? Pure — rule-tested in scripts/test-nav.mts. */
export function allowedFor(actor: Actor | undefined, e: NavEntry): boolean {
  if (!actor || actor.kind === null) return false;
  if (actor.kind === "owner") return e.who !== "employee";
  // employee
  if (e.who === "owner") return false;
  if (e.perm && !actor.permissions.includes(e.perm)) return false;
  if (e.when && !e.when(actor)) return false;
  return true;
}

/** Longest-prefix match: "/dashboard/contacts/abc" → the Contacts entry.
 *  The shell's route guard uses this so detail pages inherit their module's
 *  rule instead of slipping through unregistered. */
export function matchEntry(pathname: string): NavEntry | null {
  let best: NavEntry | null = null;
  for (const e of NAV) {
    if (pathname === e.href || pathname.startsWith(e.href + "/")) {
      if (!best || e.href.length > best.href.length) best = e;
    }
  }
  return best;
}

/** The employee's WORKSPACE nav (sidebar main section + mobile bottom), in
 *  registry order: home plus their employee entries. Bottom-section entries
 *  like Help render in the shell's own bottom block — including them here
 *  would show them twice. */
export function employeeNav(actor: Actor | undefined): NavEntry[] {
  return NAV.filter((e) => (e.section === "employee" || (e.who === "both" && e.section !== "bottom")) && allowedFor(actor, e));
}
