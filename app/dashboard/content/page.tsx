"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { Loader2, Sparkles, RefreshCw, Film, Images, Circle, Image as ImageIcon } from "lucide-react";

type Idea = { format: string; hook: string; idea: string; cta: string };

const formatIcon: Record<string, any> = { Reel: Film, Carousel: Images, Story: Circle, Image: ImageIcon };

export default function Content() {
  const { data } = useBrief();
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/content").then((r) => r.json()).then((d) => { setIdeas(d.ideas); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Content" />
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy">Content planner</h1>
            <p className="text-navy/50 text-sm mt-1">AI-generated post ideas, tailored to your account.</p>
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 text-sm font-medium bg-navy text-white px-4 py-2 rounded-lg hover:bg-navy-soft transition-colors disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> New ideas
          </button>
        </div>

        {loading ? (
          <div className="p-20 flex items-center justify-center text-navy/40"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Generating ideas…</div>
        ) : ideas ? (
          <div className="grid md:grid-cols-2 gap-4">
            {ideas.map((idea, i) => {
              const Icon = formatIcon[idea.format] || Film;
              return (
                <div key={i} className="bg-white rounded-2xl border border-navy/8 p-5 hover:border-amber/40 transition-colors">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-deep bg-amber/10 px-2.5 py-1 rounded-full">
                      <Icon className="w-3.5 h-3.5" /> {idea.format}
                    </span>
                  </div>
                  <p className="text-base font-semibold text-navy leading-snug mb-2">&ldquo;{idea.hook}&rdquo;</p>
                  <p className="text-sm text-navy/60 leading-snug mb-3">{idea.idea}</p>
                  <div className="flex items-center gap-2 text-xs text-navy/50 border-t border-navy/5 pt-3">
                    <Sparkles className="w-3.5 h-3.5 text-amber-deep" />
                    <span className="font-medium">CTA:</span> {idea.cta}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-20 text-center text-navy/40">Couldn&apos;t generate ideas. Try again.</div>
        )}
      </div>
    </DashboardShell>
  );
}
