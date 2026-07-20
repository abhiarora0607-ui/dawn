"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { Loader2, Sparkles, RefreshCw, Film, Images, Circle, Image as ImageIcon, X, Clock, Copy, Check, Lightbulb, Bookmark } from "lucide-react";

type Idea = { format: string; hook: string; idea: string; cta: string };
type Detail = { hook: string; shotPlan: string[]; caption: string; hashtags: string[]; bestTime: string; proTips: string[] };

const formatIcon: Record<string, any> = { Reel: Film, Carousel: Images, Story: Circle, Image: ImageIcon };

function IdeaModal({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  async function saveIt() {
    if (!detail) return;
    try {
      await fetch("/api/saved", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "idea", title: idea.hook, body: detail.caption, meta: { hashtags: detail.hashtags, format: idea.format, shotPlan: detail.shotPlan } }),
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 1500);
    } catch {}
  }

  useEffect(() => {
    fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea }) })
      .then((r) => r.json()).then((d) => { if (!d.error) setDetail(d); setLoading(false); }).catch(() => setLoading(false));
  }, [idea]);

  function copyCaption() {
    if (!detail) return;
    navigator.clipboard.writeText(detail.caption + "\n\n" + (detail.hashtags || []).join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const Icon = formatIcon[idea.format] || Film;

  return (
    <div className="dawn-scrim">
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto animate-rise">
        <div className="sticky top-0 bg-white border-b border-navy/8 px-5 py-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-amber-deep bg-amber/10 px-3 py-1 rounded-full">
            <Icon className="w-4 h-4" /> {idea.format}
          </span>
          <div className="flex items-center gap-2">
            {detail && (
              <button onClick={saveIt} className="flex items-center gap-1.5 text-xs font-medium bg-navy text-white px-3 py-1.5 rounded-lg hover:bg-navy-soft transition-colors">
                {savedOk ? <><Check className="w-3.5 h-3.5" /> Saved</> : <><Bookmark className="w-3.5 h-3.5" /> Save</>}
              </button>
            )}
            <button onClick={onClose} className="btn-icon text-navy/40 hover:text-navy"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-navy/40"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Building your shot plan…</div>
        ) : detail ? (
          <div className="p-5 space-y-5">
            <div>
              <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide mb-1">Hook</p>
              <p className="text-lg font-semibold text-navy leading-snug">&ldquo;{detail.hook}&rdquo;</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide mb-2">Shot plan</p>
              <div className="space-y-2">
                {detail.shotPlan?.map((s, i) => (
                  <div key={i} className="flex gap-3 text-sm text-navy/75">
                    <span className="w-5 h-5 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide">Caption</p>
                <button onClick={copyCaption} className="flex items-center gap-1 text-xs font-medium text-navy/60 hover:text-navy">
                  {copied ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
              </div>
              <p className="text-sm text-navy/80 leading-relaxed bg-surface rounded-xl p-3 whitespace-pre-wrap">{detail.caption}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {detail.hashtags?.map((h, i) => <span key={i} className="text-xs bg-navy/5 text-navy/60 px-2 py-1 rounded">{h}</span>)}
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-navy/70 bg-amber/5 rounded-lg p-3">
              <Clock className="w-4 h-4 text-amber-deep shrink-0" /> {detail.bestTime}
            </div>

            <div>
              <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5 text-amber-deep" /> Pro tips</p>
              <div className="space-y-1.5">
                {detail.proTips?.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-navy/70">
                    <Sparkles className="w-3.5 h-3.5 text-amber-deep shrink-0 mt-0.5" /> <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-navy/40 text-sm">Couldn&apos;t load details. Close and try another idea.</div>
        )}
      </div>
    </div>
  );
}

export default function Content() {
  const { data } = useBrief();
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Idea | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/content").then((r) => r.json()).then((d) => { setIdeas(d.ideas); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Content" />
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display font-semibold text-2xl text-navy">Content planner</h1>
            <p className="text-navy/50 text-sm mt-1">AI post ideas, tailored to you. Tap any card for a full plan.</p>
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 text-sm font-medium bg-navy text-white px-4 py-2 rounded-lg hover:bg-navy-soft transition-colors disabled:opacity-60 shrink-0">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">New ideas</span>
          </button>
        </div>

        {loading ? (
          <div className="p-10 sm:p-20 flex items-center justify-center text-navy/40"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Generating ideas…</div>
        ) : ideas ? (
          <div className="grid md:grid-cols-2 gap-4">
            {ideas.map((idea, i) => {
              const Icon = formatIcon[idea.format] || Film;
              return (
                <button key={i} onClick={() => setSelected(idea)} className="text-left dawn-card p-5 hover:border-amber/40 hover:shadow-md transition-all group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-deep bg-amber/10 px-2.5 py-1 rounded-full">
                      <Icon className="w-3.5 h-3.5" /> {idea.format}
                    </span>
                    <span className="text-xs text-navy/40 group-hover:text-amber-deep font-medium">Tap for plan →</span>
                  </div>
                  <p className="text-base font-semibold text-navy leading-snug mb-2">&ldquo;{idea.hook}&rdquo;</p>
                  <p className="text-sm text-navy/60 leading-snug mb-3">{idea.idea}</p>
                  <div className="flex items-center gap-2 text-xs text-navy/50 border-t border-navy/5 pt-3">
                    <Sparkles className="w-3.5 h-3.5 text-amber-deep" /> <span className="font-medium">CTA:</span> {idea.cta}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-20 text-center text-navy/40">Couldn&apos;t generate ideas. Try again.</div>
        )}
      </div>
      {selected && <IdeaModal idea={selected} onClose={() => setSelected(null)} />}
    </DashboardShell>
  );
}
