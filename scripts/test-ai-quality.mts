// V63 AI-quality rules. Two kinds of check the AI surface never had:
//
//   1. The CALENDAR is correct — occasion math a shop plans around must not
//      be off by a day or a definition. A wrong "Diwali is in 40 days" is
//      worse than silence.
//   2. The COERCERS are safe — aiText/aiTextList exist because a model that
//      returns an object where the schema said string causes React error #31,
//      a blank screen. These must never throw and never leak "[object
//      Object]" onto a founder's screen.
//
// These are spot checks on the deterministic scaffolding around the model,
// not on model output itself (which no unit test can pin). They guard the
// ways a good model response still reaches the user broken.
import { occasionSignals, calendarContext } from "../lib/ai-calendar.ts";
import { aiText, aiTextList, parseAiJson } from "../lib/ai-prompt.ts";

const t: [string, any, string][] = [];
const on = (iso: string) => new Date(iso + "T08:00:00.000Z");

// ---- calendar: the windows a business plans around ----
const diwaliEve = occasionSignals(on("2026-10-18"));
t.push(["Diwali shows up within the two-week window", String(diwaliEve.upcoming.some((u) => u.name === "Diwali")), "true"]);
t.push(["…and Dhanteras leads it (earlier date, listed first)", diwaliEve.upcoming[0].name, "Dhanteras"]);
const farFromDiwali = occasionSignals(on("2026-06-01"));
t.push(["nothing far-off is flagged as upcoming", String(farFromDiwali.upcoming.some((u) => u.name === "Diwali")), "false"]);

const onset = occasionSignals(on("2026-03-05"));
t.push(["the 5th reads as early month", onset.partOfMonth, "start"]);
t.push(["…and near payday", String(onset.nearPayday), "true"]);
const midmonth = occasionSignals(on("2026-03-15"));
t.push(["the 15th is not near payday", String(midmonth.nearPayday), "false"]);

const qEnd = occasionSignals(on("2026-03-28"));
t.push(["late March is quarter-end", String(qEnd.quarterEnd), "true"]);
const notQEnd = occasionSignals(on("2026-05-28"));
t.push(["late May is not quarter-end", String(notQEnd.quarterEnd), "false"]);

const sat = occasionSignals(on("2026-07-25")); // a Saturday
t.push(["Saturday is a weekend", String(sat.isWeekend), "true"]);
const wed = occasionSignals(on("2026-07-22"));
t.push(["Wednesday is not", String(wed.isWeekend), "false"]);

// day-0 and roll-forward
const onDiwali = occasionSignals(on("2026-10-20"));
t.push(["a festival on the day reads inDays 0", String(onDiwali.upcoming.find((u) => u.name === "Diwali")?.inDays), "0"]);
const janLook = occasionSignals(on("2026-12-28")); // New Year's Eve is days away, Sankranti rolls to next year
t.push(["the calendar rolls forward across the year boundary", String(janLook.upcoming.every((u) => u.inDays >= 0)), "true"]);

// context rendering never emits an empty labelled block
const quiet = calendarContext(on("2026-06-18")); // mid-month, weekday, no festival, not Q-end
t.push(["a genuinely quiet day yields no calendar block", String(quiet), ""]);
const loud = calendarContext(on("2026-10-18"));
t.push(["a festival week produces a labelled block", String(loud.startsWith("CALENDAR CONTEXT:")), "true"]);

// ---- the coercers: a blank screen is the enemy ----
t.push(["a plain string passes through", aiText("hello"), "hello"]);
t.push(["an object-instead-of-string yields its text, not [object Object]", aiText({ text: "recovered" }), "recovered"]);
t.push(["…falling back through likely fields", aiText({ tip: "use a hook" }), "use a hook"]);
t.push(["…or the first string value", aiText({ whatever: "still readable" }), "still readable"]);
t.push(["null coerces to empty, never crashes", aiText(null), ""]);
t.push(["a number coerces to its text", aiText(42), "42"]);
t.push(["a list of mixed junk cleans to strings", aiTextList(["a", { text: "b" }, null, ""]).join(","), "a,b"]);
t.push(["a non-array list is empty, not a throw", String(aiTextList({ not: "an array" }).length), "0"]);

// ---- parseAiJson: malformed model output falls back, never throws ----
t.push(["clean JSON parses", String(parseAiJson('{"x":1}', { x: 0 }).x), "1"]);
t.push(["fenced JSON still parses", String(parseAiJson('```json\n{"x":2}\n```', { x: 0 }).x), "2"]);
t.push(["garbage falls back to the safe default", String(parseAiJson("not json at all", { x: 9 }).x), "9"]);
t.push(["empty falls back", String(parseAiJson("", { x: 7 }).x), "7"]);

let bad = 0;
for (const [name, got, want] of t) {
  const g = String(got);
  if (g === want) console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  else { console.log(`  \x1b[31m✗\x1b[0m ${name} — got ${g}, wanted ${want}`); bad++; }
}
if (bad) { console.log(`\x1b[31m*** ${bad} AI-QUALITY RULE FAILURE(S) ***\x1b[0m`); process.exit(1); }
console.log(`\x1b[32m*** ALL ${t.length} AI-QUALITY RULES CORRECT ***\x1b[0m`);
