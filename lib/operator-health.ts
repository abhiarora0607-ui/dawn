// lib/operator-health.ts
// Turns the operator's raw numbers into words and a prioritised worklist.
//
// The research behind V29: mature customer-success tools (Churnkey, Vitally)
// sort accounts into named risk buckets rather than showing raw scores, and
// keep the model simple. A score of 38 means nothing at a glance; "Slipping"
// means something instantly. Everything here is computed from data the
// overview API already returns — no new storage, no new queries.

export type HealthKey = "thriving" | "steady" | "slipping" | "at_risk" | "dormant" | "new";

export type Health = {
  key: HealthKey;
  label: string;
  tone: "green" | "navy" | "amber" | "red" | "grey";
  why: string;   // plain-language explanation, shown on the detail page
};

type Biz = {
  daysSinceSignup?: number | null;
  daysQuiet?: number | null;
  realContacts?: number;
  realOrders?: number;
  employees?: number;
  ig?: boolean;
  billingStatus?: string;
  billingDaysLeft?: number | null;
  weeks?: number[];
};

// ---------------------------------------------------------------- health
export function healthOf(b: Biz): Health {
  const quiet = b.daysQuiet;
  const age = b.daysSinceSignup ?? 0;
  const setUp = (b.realContacts || 0) > 0 || (b.realOrders || 0) > 0;

  // Brand new and still finding their feet — not a problem yet.
  if (age <= 3 && !setUp) {
    return { key: "new", label: "Just joined", tone: "grey", why: "Signed up in the last few days and hasn't set anything up yet — too early to worry." };
  }
  // Never got going.
  if (!setUp) {
    return { key: "dormant", label: "Never started", tone: "grey", why: `Signed up ${age} days ago but has never added a real contact or order.` };
  }
  // Gone silent.
  if (quiet == null || quiet >= 21) {
    return { key: "at_risk", label: "At risk", tone: "red", why: quiet == null ? "Has data but we've never recorded a visit." : `Nobody has opened Dawn for ${quiet} days.` };
  }
  if (quiet >= 10) {
    return { key: "slipping", label: "Slipping", tone: "amber", why: `Last opened Dawn ${quiet} days ago — the habit is fading.` };
  }
  // Active. Thriving = using it properly, not just logging in.
  const rich = (b.realOrders || 0) >= 5 && (b.realContacts || 0) >= 10;
  if (rich && quiet <= 3) {
    return { key: "thriving", label: "Thriving", tone: "green", why: "Opening Dawn most days with real customers and orders flowing." };
  }
  return { key: "steady", label: "Steady", tone: "navy", why: `Active — last seen ${quiet === 0 ? "today" : `${quiet} day${quiet === 1 ? "" : "s"} ago`}.` };
}

export const HEALTH_ORDER: HealthKey[] = ["at_risk", "slipping", "dormant", "new", "steady", "thriving"];

// ------------------------------------------------------------- worklist
// One prioritised list answering "who do I talk to today?". Each item carries
// its own reason and the single most useful action.

export type WorkItem = {
  uid: string;
  name: string | null;
  wa: string | null;
  reason: string;             // why this is on the list, in words
  urgency: "now" | "soon" | "watch";
  action: "nudge" | "extend" | "open";
  message?: string;           // prewritten WhatsApp text
};

export function buildWorklist(businesses: any[]): WorkItem[] {
  const items: WorkItem[] = [];
  const seen = new Set<string>();
  const add = (i: WorkItem) => { if (!seen.has(i.uid)) { seen.add(i.uid); items.push(i); } };

  for (const b of businesses) {
    const name = b.name || null;
    const wa = b.whatsapp || b.phone || null;

    // 1. Trial ending — the highest-value conversation in the system.
    if (b.billingStatus === "trial" && b.billingDaysLeft != null && b.billingDaysLeft <= 3) {
      add({
        uid: b.uid, name, wa,
        reason: b.billingDaysLeft <= 1 ? "Trial ends tomorrow" : `Trial ends in ${b.billingDaysLeft} days`,
        urgency: "now", action: "nudge",
        message: `Hi! Your Dawn trial ends in ${b.billingDaysLeft} day${b.billingDaysLeft === 1 ? "" : "s"}. Anything I can help set up before then? Happy to extend it if you need more time.`,
      });
      continue;
    }
    // 2. Renewal due.
    if (b.billingStatus === "paid" && b.billingDaysLeft != null && b.billingDaysLeft <= 5) {
      add({
        uid: b.uid, name, wa,
        reason: `Renewal due in ${b.billingDaysLeft} day${b.billingDaysLeft === 1 ? "" : "s"}`,
        urgency: "now", action: "nudge",
        message: `Hi! Just a heads-up that your Dawn plan renews in ${b.billingDaysLeft} day${b.billingDaysLeft === 1 ? "" : "s"}. Anything you'd like changed before then?`,
      });
      continue;
    }
    // 3. Paying customer going quiet — churn about to happen.
    const h = healthOf(b);
    if (b.billingStatus === "paid" && (h.key === "slipping" || h.key === "at_risk")) {
      add({
        uid: b.uid, name, wa,
        reason: `Paying but ${h.label.toLowerCase()} — ${b.daysQuiet}d quiet`,
        urgency: "now", action: "nudge",
        message: `Hi! Noticed things have been quiet in Dawn lately. Anything getting in the way? Happy to jump on a quick call.`,
      });
      continue;
    }
    // 4. Trial user who never started — they'll churn silently.
    if (b.billingStatus === "trial" && h.key === "dormant") {
      add({
        uid: b.uid, name, wa,
        reason: `On trial but never set up (${b.daysSinceSignup}d)`,
        urgency: "soon", action: "nudge",
        message: `Hi! Saw you signed up for Dawn but haven't added anything yet. Want me to help get your products and customers in? Takes about ten minutes.`,
      });
      continue;
    }
    // 5. Expired recently — winback window.
    if (b.billingStatus === "expired") {
      add({
        uid: b.uid, name, wa,
        reason: "Access ended — winback",
        urgency: "soon", action: "nudge",
        message: `Hi! Your Dawn access has paused but everything you built is safe. Want me to switch it back on so you can pick up where you left off?`,
      });
      continue;
    }
    // 6. Free-trial user doing well — the easiest sale you'll ever make.
    if (b.billingStatus === "trial" && h.key === "thriving") {
      add({
        uid: b.uid, name, wa,
        reason: "Trial going well — likely to convert",
        urgency: "watch", action: "nudge",
        message: `Hi! Looks like Dawn is fitting in well. When your trial ends you can keep going on any plan — want me to walk you through which one fits?`,
      });
      continue;
    }
    // 7. Brand new signup — a hello goes a long way.
    if ((b.daysSinceSignup ?? 99) <= 2) {
      add({
        uid: b.uid, name, wa,
        reason: "Just signed up",
        urgency: "watch", action: "nudge",
        message: `Hi! Welcome to Dawn — I'm the person who built it. Anything you want help setting up, just reply here.`,
      });
    }
  }

  const rank = { now: 0, soon: 1, watch: 2 };
  return items.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}
