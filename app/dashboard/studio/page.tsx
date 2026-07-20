"use client";

import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { Loader2, Calendar, LayoutGrid, RefreshCw, Sparkles, Copy, Check, Film, Images, Circle, Image as ImageIcon, Clock } from "lucide-react";

type Day = { day: string; format: string; theme: string; idea: string; hook: string; bestTime: string };
type Slide = { n: number; headline: string; subtext?: string };
type Carousel = { slides: Slide[]; caption: string; hashtags: string[] };

const fmtIcon: Record<string, any> = { Reel: Film, Carousel: Images, Story: Circle, Image: ImageIcon };

function Calendar7({ }: {}) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/calendar").then((r) => r.json()).then((d) => { setDays(d.days); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display font-semibold text-xl text-navy flex items-center gap-2"><Calendar className="w-5 h-5 text-amber-deep" /> This week&apos;s plan</h2>
          <p className="text-muted text-sm mt-0.5">A balanced 7-day calendar, tailored to you.</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 text-sm font-medium bg-navy text-white px-4 py-2 rounded-xl hover:bg-navy-soft transition-colors disabled:opacity-60 shrink-0">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Regenerate</span>
        </button>
      </div>
      {loading ? (
        <div className="grid gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}
        </div>
      ) : days ? (
        <div className="grid gap-3">
          {days.map((d, i) => {
            const Icon = fmtIcon[d.format] || Film;
            return (
              <div key={i} className="bg-white rounded-2xl border border-navy-line p-4 shadow-card flex items-start gap-4">
                <div className="text-center shrink-0 w-14">
                  <p className="text-xs font-bold text-amber-deep uppercase">{d.day.slice(0, 3)}</p>
                  <div className="w-10 h-10 mx-auto mt-1 rounded-xl bg-amber/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-amber-deep" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-bold uppercase bg-navy/5 text-navy/60 px-2 py-0.5 rounded">{d.format}</span>
                    <span className="text-[12px] text-muted">{d.theme}</span>
                    <span className="text-[12px] text-muted flex items-center gap-0.5"><Clock className="w-3 h-3" /> {d.bestTime}</span>
                  </div>
                  <p className="text-sm font-semibold text-navy mt-1 leading-snug">&ldquo;{d.hook}&rdquo;</p>
                  <p className="text-xs text-muted leading-snug mt-0.5">{d.idea}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted text-sm">Couldn&apos;t load the calendar. Try again.</p>
      )}
    </div>
  );
}

function CarouselGen() {
  const [topic, setTopic] = useState("");
  const [carousel, setCarousel] = useState<Carousel | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (!topic.trim()) return;
    setLoading(true); setError(""); setCarousel(null);
    try {
      const res = await fetch("/api/carousel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic }) });
      const d = await res.json();
      if (res.ok) setCarousel(d); else setError(d.error || "Failed.");
    } catch { setError("Network error."); }
    setLoading(false);
  }

  function copyAll() {
    if (!carousel) return;
    const text = carousel.slides.map((s) => `Slide ${s.n}: ${s.headline}${s.subtext ? " — " + s.subtext : ""}`).join("\n") + "\n\n" + carousel.caption + "\n\n" + carousel.hashtags.join(" ");
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <h2 className="font-display font-semibold text-xl text-navy flex items-center gap-2 mb-1"><LayoutGrid className="w-5 h-5 text-amber-deep" /> Carousel generator</h2>
      <p className="text-muted text-sm mb-4">Give a topic — get a full slide-by-slide carousel.</p>
      <div className="flex gap-2 mb-4">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="e.g. 5 budget travel hacks for the Himalayas"
          className="flex-1 px-4 py-3 rounded-xl border border-navy-line text-sm text-navy focus:outline-none focus:border-amber" />
        <button onClick={generate} disabled={loading || !topic.trim()} className="flex items-center gap-2 bg-navy text-white font-medium px-5 py-3 rounded-xl hover:bg-navy-soft transition-colors disabled:opacity-50 shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} <span className="hidden sm:inline">Generate</span>
        </button>
      </div>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      {carousel && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">{carousel.slides.length} slides</p>
            <button onClick={copyAll} className="flex items-center gap-1.5 text-xs font-medium text-navy/60 hover:text-navy">
              {copied ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy all</>}
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {carousel.slides.map((s) => (
              <div key={s.n} className="shrink-0 w-40 aspect-[4/5] rounded-2xl bg-navy text-white p-4 flex flex-col justify-between shadow-card">
                <span className="text-[12px] text-amber font-bold">{s.n === 1 ? "HOOK" : s.n === carousel.slides.length ? "CTA" : `SLIDE ${s.n}`}</span>
                <div>
                  <p className="font-display font-semibold text-sm leading-tight">{s.headline}</p>
                  {s.subtext && <p className="text-white/60 text-[12px] mt-1 leading-snug">{s.subtext}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-navy-line p-4 shadow-card">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Caption</p>
            <p className="text-sm text-navy/80 leading-relaxed whitespace-pre-wrap">{carousel.caption}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {carousel.hashtags?.map((h, i) => <span key={i} className="text-xs bg-navy/5 text-navy/60 px-2 py-1 rounded">{h}</span>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Studio() {
  const { data } = useBrief();
  const [tab, setTab] = useState<"calendar" | "carousel">("calendar");

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Studio" />
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy">Studio</h1>
          <p className="text-muted text-sm mt-1">Plan your week and build carousels — all AI, all tailored to you.</p>
        </div>

        <div className="flex gap-2 bg-white p-1 rounded-xl border border-navy-line w-fit">
          <button onClick={() => setTab("calendar")} className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${tab === "calendar" ? "bg-navy text-white" : "text-navy/60"}`}>Weekly calendar</button>
          <button onClick={() => setTab("carousel")} className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${tab === "carousel" ? "bg-navy text-white" : "text-navy/60"}`}>Carousel</button>
        </div>

        {tab === "calendar" ? <Calendar7 /> : <CarouselGen />}
      </div>
    </DashboardShell>
  );
}
