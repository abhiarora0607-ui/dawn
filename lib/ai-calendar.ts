// lib/ai-calendar.ts
// WHEN is it, in a way that matters to a small Indian business? (V63)
//
// The AI knew a shop's numbers but not its calendar. "Post something today"
// is generic; "Karva Chauth is in nine days — your jewellery buyers are
// searching now" is a sale. This module turns a date into the selling
// signals a founder actually plans around: the festival window they should
// already be posting for, payday rhythm, weekend vs weekday, quarter-end.
//
// Pure and data-driven so it's rule-tested and cheap — no model call, no
// external calendar API, just the arithmetic of the Indian retail year. Dates
// approximate where a festival moves with the lunar calendar; the point is
// the WINDOW and the buyer intent, not almanac precision.

export type OccasionSignal = {
  today: string;                 // ISO date, for the model to anchor on
  weekday: string;
  isWeekend: boolean;
  partOfMonth: "start" | "mid" | "end";
  nearPayday: boolean;           // salary lands ~1st; buying lifts for a week
  quarterEnd: boolean;
  upcoming: { name: string; inDays: number; buyerHint: string }[];
};

type Festival = { name: string; month: number; day: number; buyerHint: string };

// The retail-relevant Indian calendar. Approximate days for lunar festivals;
// each carries WHY a shop should care, which is what the model needs.
const FESTIVALS: Festival[] = [
  { name: "Makar Sankranti / Pongal", month: 1, day: 14, buyerHint: "sweets, traditional wear, home décor" },
  { name: "Republic Day", month: 1, day: 26, buyerHint: "sales events, tricolour themes" },
  { name: "Valentine's Day", month: 2, day: 14, buyerHint: "gifts, couples' offers, flowers, cakes" },
  { name: "Holi", month: 3, day: 14, buyerHint: "colours, sweets, casual wear, party supplies" },
  { name: "Ugadi / Gudi Padwa", month: 3, day: 30, buyerHint: "new-year buys, traditional wear, gold" },
  { name: "Eid al-Fitr", month: 3, day: 31, buyerHint: "festive wear, sweets, gifts, feasts" },
  { name: "Baisakhi", month: 4, day: 13, buyerHint: "harvest festival, traditional wear, sweets" },
  { name: "Akshaya Tritiya", month: 4, day: 30, buyerHint: "gold, jewellery, big-ticket buys — auspicious" },
  { name: "Mother's Day", month: 5, day: 11, buyerHint: "gifts, jewellery, flowers, spa" },
  { name: "Raksha Bandhan", month: 8, day: 9, buyerHint: "rakhi, sweets, gifts for siblings" },
  { name: "Independence Day", month: 8, day: 15, buyerHint: "sales events, tricolour themes" },
  { name: "Janmashtami", month: 8, day: 16, buyerHint: "festive wear, sweets, décor" },
  { name: "Ganesh Chaturthi", month: 8, day: 27, buyerHint: "décor, sweets, eco-friendly idols, festive wear" },
  { name: "Onam", month: 9, day: 5, buyerHint: "traditional wear, sweets, home goods" },
  { name: "Navratri", month: 9, day: 22, buyerHint: "ethnic wear, jewellery, garba/dandiya accessories" },
  { name: "Dussehra", month: 10, day: 2, buyerHint: "festive wear, gifts, décor" },
  { name: "Karva Chauth", month: 10, day: 10, buyerHint: "jewellery, ethnic wear, mehendi, gifts for wives" },
  { name: "Dhanteras", month: 10, day: 18, buyerHint: "gold, silver, utensils, appliances — the biggest buying day" },
  { name: "Diwali", month: 10, day: 20, buyerHint: "gifts, sweets, décor, apparel, electronics — peak season" },
  { name: "Bhai Dooj", month: 10, day: 23, buyerHint: "gifts for siblings, sweets" },
  { name: "Christmas", month: 12, day: 25, buyerHint: "gifts, cakes, décor, party wear" },
  { name: "New Year's Eve", month: 12, day: 31, buyerHint: "party wear, gifts, celebrations" },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** How many days from `now` until this festival's next occurrence (this year
 *  or next), counting only forward. */
function daysUntil(now: Date, f: Festival): number {
  const y = now.getUTCFullYear();
  const thisYear = Date.UTC(y, f.month - 1, f.day);
  const startOfToday = Date.UTC(y, now.getUTCMonth(), now.getUTCDate());
  const target = thisYear >= startOfToday ? thisYear : Date.UTC(y + 1, f.month - 1, f.day);
  return Math.round((target - startOfToday) / 86400000);
}

/** The occasion signals for a given moment. `horizon` is how far ahead a
 *  festival is worth flagging — two weeks is enough lead time to post and
 *  still catch the buying window. */
export function occasionSignals(now: Date = new Date(), horizon = 14): OccasionSignal {
  const dom = now.getUTCDate();
  const partOfMonth: OccasionSignal["partOfMonth"] = dom <= 10 ? "start" : dom >= 22 ? "end" : "mid";
  const month = now.getUTCMonth() + 1;
  const upcoming = FESTIVALS
    .map((f) => ({ name: f.name, inDays: daysUntil(now, f), buyerHint: f.buyerHint }))
    .filter((u) => u.inDays >= 0 && u.inDays <= horizon)
    .sort((a, b) => a.inDays - b.inDays);
  return {
    today: now.toISOString().slice(0, 10),
    weekday: WEEKDAYS[now.getUTCDay()],
    isWeekend: now.getUTCDay() === 0 || now.getUTCDay() === 6,
    partOfMonth,
    nearPayday: dom <= 7,               // salaries land ~1st; buying lifts the first week
    quarterEnd: [3, 6, 9, 12].includes(month) && dom >= 22,
    upcoming,
  };
}

/** Render the signals as a context block for a prompt. Empty string when
 *  there's genuinely nothing timely — never pad the prompt with noise. */
export function calendarContext(now: Date = new Date()): string {
  const s = occasionSignals(now);
  const lines: string[] = [`Today is ${s.weekday}, ${s.today}.`];
  if (s.nearPayday) lines.push("It's early in the month — customers have just been paid, so buying intent is higher.");
  if (s.isWeekend) lines.push("It's the weekend — engagement and casual browsing tend to peak.");
  if (s.quarterEnd) lines.push("It's quarter-end — a natural moment for clearance or target-push offers.");
  if (s.upcoming.length) {
    const parts = s.upcoming.slice(0, 3).map((u) =>
      u.inDays === 0 ? `${u.name} is TODAY (${u.buyerHint})`
        : `${u.name} is in ${u.inDays} day${u.inDays === 1 ? "" : "s"} (${u.buyerHint})`);
    lines.push(`Upcoming occasions worth posting for now: ${parts.join("; ")}.`);
  }
  return lines.length > 1 ? "CALENDAR CONTEXT:\n" + lines.join(" ") : "";
}
