"use client";

// The content studio, in the portal (V54).
//
// A marketing hand with the content_tools grant can generate post ideas,
// expand one into a full shot plan + caption + hashtags, or build a carousel
// — powered by the same context-rich AI the owner uses (the business's real
// account data, brand voice, persona), without owner dashboard access. The
// permission is enforced server-side on every call; this UI just uses it.

import { useState } from "react";
import { Loader2, Sparkles, Copy, ArrowLeft, LayoutGrid, Lightbulb } from "lucide-react";

type Idea = { format: string; hook: string; idea: string; cta: string };

export function TeamStudio() {
  const [mode, setMode] = useState<"ideas" | "carousel">("ideas");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [expanded, setExpanded] = useState<any>(null);

  const [topic, setTopic] = useState("");
  const [carousel, setCarousel] = useState<any>(null);

  async function loadIdeas() {
    setBusy(true); setMsg(""); setExpanded(null);
    try {
      const res = await fetch("/api/content");
      const d = await res.json();
      if (d.ideas?.length) setIdeas(d.ideas);
      else setMsg(d.error || "Couldn't get ideas right now.");
    } catch { setMsg("Couldn't get ideas right now."); }
    setBusy(false);
  }

  async function expand(idea: Idea) {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/content", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      const d = await res.json();
      if (d.caption) setExpanded({ ...d, source: idea });
      else setMsg(d.error || "Couldn't expand that one.");
    } catch { setMsg("Couldn't expand that one."); }
    setBusy(false);
  }

  async function makeCarousel() {
    setBusy(true); setMsg(""); setCarousel(null);
    try {
      const res = await fetch("/api/carousel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const d = await res.json();
      if (d.slides?.length) setCarousel(d);
      else setMsg(d.error || "Couldn't build that carousel.");
    } catch { setMsg("Couldn't build that carousel."); }
    setBusy(false);
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    setMsg("Copied.");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-semibold text-2xl text-navy flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-amber-deep" /> Content studio
        </h1>
        <p className="text-muted text-sm mt-1">Ideas, captions, and carousels — built from this business's real account data.</p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setMode("ideas")}
          className={`btn btn-sm flex-1 ${mode === "ideas" ? "btn-primary" : "btn-quiet"}`}>
          <Lightbulb className="w-4 h-4" /> Post ideas
        </button>
        <button onClick={() => setMode("carousel")}
          className={`btn btn-sm flex-1 ${mode === "carousel" ? "btn-primary" : "btn-quiet"}`}>
          <LayoutGrid className="w-4 h-4" /> Carousel
        </button>
      </div>

      {msg && <p className="t-small text-navy bg-surface border border-navy-line rounded-xl px-3 py-2">{msg}</p>}

      {mode === "ideas" && !expanded && (
        <div className="space-y-2">
          <button onClick={loadIdeas} disabled={busy} className="btn btn-primary btn-sm w-full">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : ideas.length ? "Fresh ideas" : "Get ideas"}
          </button>
          {ideas.map((i, n) => (
            <button key={n} onClick={() => expand(i)} disabled={busy}
              className="w-full text-left dawn-card p-4 hover:bg-surface">
              <p className="t-micro font-bold text-amber-deep uppercase">{i.format}</p>
              <p className="text-sm font-semibold text-navy mt-0.5">{i.hook}</p>
              <p className="t-small text-muted mt-0.5">{i.idea}</p>
            </button>
          ))}
          {ideas.length === 0 && !busy && (
            <div className="dawn-card p-8 text-center">
              <Lightbulb className="w-8 h-8 text-navy/20 mx-auto mb-2" />
              <p className="t-small text-muted">Tap “Get ideas” — Dawn reads the account's numbers and suggests posts that fit what the audience already rewards.</p>
            </div>
          )}
        </div>
      )}

      {mode === "ideas" && expanded && (
        <div className="space-y-3">
          <button onClick={() => setExpanded(null)} className="btn btn-quiet btn-sm">
            <ArrowLeft className="w-4 h-4" /> Back to ideas
          </button>
          <div className="dawn-card p-4">
            <p className="t-micro font-bold text-amber-deep uppercase">{expanded.source?.format}</p>
            <p className="text-sm font-semibold text-navy mt-0.5">{expanded.hook}</p>
            {Array.isArray(expanded.shotPlan) && expanded.shotPlan.length > 0 && (
              <div className="mt-3">
                <p className="t-label text-muted mb-1">Shot plan</p>
                {expanded.shotPlan.map((s2: string, n: number) => (
                  <p key={n} className="t-small text-navy">{n + 1}. {s2}</p>
                ))}
              </div>
            )}
            <div className="mt-3">
              <p className="t-label text-muted mb-1">Caption</p>
              <p className="t-small text-navy whitespace-pre-wrap">{expanded.caption}</p>
              <button onClick={() => copy(expanded.caption)} className="btn btn-quiet btn-sm mt-2"><Copy className="w-3.5 h-3.5" /> Copy caption</button>
            </div>
            {Array.isArray(expanded.hashtags) && expanded.hashtags.length > 0 && (
              <div className="mt-3">
                <p className="t-label text-muted mb-1">Hashtags</p>
                <p className="t-small text-navy">{expanded.hashtags.join(" ")}</p>
                <button onClick={() => copy(expanded.hashtags.join(" "))} className="btn btn-quiet btn-sm mt-2"><Copy className="w-3.5 h-3.5" /> Copy hashtags</button>
              </div>
            )}
            {expanded.bestTime && <p className="t-micro text-muted mt-3">Best time to post: {expanded.bestTime}</p>}
          </div>
        </div>
      )}

      {mode === "carousel" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={topic} onChange={(e) => setTopic(e.target.value)} className="inp flex-1"
              placeholder="Topic — e.g. 5 hidden gems in Himachal" />
            <button onClick={makeCarousel} disabled={busy || !topic.trim()} className="btn btn-primary btn-sm shrink-0">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Build"}
            </button>
          </div>
          {carousel && (
            <div className="space-y-2">
              {carousel.slides.map((sl: any) => (
                <div key={sl.n} className="dawn-card p-4">
                  <p className="t-micro text-muted">Slide {sl.n}</p>
                  <p className="text-sm font-semibold text-navy mt-0.5">{sl.headline}</p>
                  {sl.subtext && <p className="t-small text-muted mt-0.5">{sl.subtext}</p>}
                </div>
              ))}
              <div className="dawn-card p-4">
                <p className="t-label text-muted mb-1">Caption</p>
                <p className="t-small text-navy whitespace-pre-wrap">{carousel.caption}</p>
                <button onClick={() => copy(`${carousel.caption}\n\n${(carousel.hashtags || []).join(" ")}`)}
                  className="btn btn-quiet btn-sm mt-2"><Copy className="w-3.5 h-3.5" /> Copy caption + tags</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
