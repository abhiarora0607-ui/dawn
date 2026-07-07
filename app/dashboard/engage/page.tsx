"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import { Loader2, MessageCircle, Mail, Sparkles, Check, Info } from "lucide-react";

type Settings = {
  comment_enabled: boolean; comment_mode: string; comment_fixed_reply: string;
  dm_enabled: boolean; dm_mode: string; dm_fixed_reply: string;
};

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-12 h-7 rounded-full transition-colors ${on ? "bg-amber" : "bg-navy/15"}`}
    >
      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : ""}`} />
    </button>
  );
}

function AutomationCard({
  icon: Icon, title, desc, enabled, mode, fixedReply, onToggle, onMode, onFixed, note,
}: any) {
  return (
    <section className="bg-white rounded-2xl border border-navy/8 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${enabled ? "bg-amber/15" : "bg-navy/5"}`}>
            <Icon className={`w-5 h-5 ${enabled ? "text-amber-deep" : "text-navy/40"}`} />
          </div>
          <div>
            <h3 className="font-semibold text-navy">{title}</h3>
            <p className="text-sm text-navy/55 mt-0.5">{desc}</p>
          </div>
        </div>
        <Toggle on={enabled} onClick={onToggle} />
      </div>

      {enabled && (
        <div className="mt-5 pt-5 border-t border-navy/8 space-y-4">
          {/* Mode selector */}
          <div>
            <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide mb-2">Reply mode</p>
            <div className="flex gap-2">
              <button
                onClick={() => onMode("ai")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${mode === "ai" ? "border-amber bg-amber/5 text-navy" : "border-navy/12 text-navy/60"}`}
              >
                <Sparkles className="w-4 h-4" /> AI-generated
              </button>
              <button
                onClick={() => onMode("fixed")}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${mode === "fixed" ? "border-amber bg-amber/5 text-navy" : "border-navy/12 text-navy/60"}`}
              >
                Fixed reply
              </button>
            </div>
          </div>

          {mode === "ai" ? (
            <p className="text-xs text-navy/50 bg-surface rounded-lg p-3">
              Dawn writes a unique reply in your brand voice for each message. Set your voice on the Brand Voice page for best results.
            </p>
          ) : (
            <div>
              <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide mb-2">Your fixed reply</p>
              <textarea
                value={fixedReply}
                onChange={(e) => onFixed(e.target.value)}
                placeholder="e.g. Thanks so much! DM us for details 💛"
                rows={2}
                className="w-full px-4 py-3 rounded-xl border border-navy/12 text-sm text-navy focus:outline-none focus:border-amber resize-none"
              />
            </div>
          )}

          {note && (
            <div className="flex items-start gap-2 text-xs text-navy/55 bg-surface rounded-lg p-3">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-navy/40" />
              <span>{note}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function Engage() {
  const { data } = useBrief();
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const [debug, setDebug] = useState<any>(null);
  const [debugging, setDebugging] = useState(false);
  const [runResult, setRunResult] = useState<{ replied: number; drafts?: any[]; dmReplied?: number; dmDrafts?: any[]; error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/automation").then((r) => r.json()).then((d) => { setS(d.settings); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  function upd(patch: Partial<Settings>) { setS((prev) => prev ? { ...prev, ...patch } : prev); setSaved(false); }

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      const res = await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      if (res.ok) setSaved(true);
    } catch {}
    setSaving(false);
  }

  async function diagnose() {
    setDebugging(true);
    setDebug(null);
    try {
      const res = await fetch("/api/automation/debug");
      const d = await res.json();
      setDebug(d);
    } catch {
      setDebug({ error: "Diagnostic failed." });
    }
    setDebugging(false);
  }

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/automation/run", { method: "POST" });
      const d = await res.json();
      if (res.ok) setRunResult({ replied: d.replied || 0, drafts: d.drafts, dmReplied: d.dmReplied || 0, dmDrafts: d.dmDrafts });
      else setRunResult({ replied: 0, error: d.error || "Run failed." });
    } catch {
      setRunResult({ replied: 0, error: "Network error." });
    }
    setRunning(false);
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Engage" />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display font-semibold text-2xl text-navy">Engage</h1>
          <p className="text-navy/50 text-sm mt-1">Turn on automation. When it&apos;s on, Dawn replies automatically.</p>
        </div>

        {loading || !s ? (
          <div className="p-12 flex items-center justify-center text-navy/40"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
        ) : (
          <>
            <AutomationCard
              icon={MessageCircle}
              title="Auto comment-reply"
              desc="Automatically reply to comments on your posts."
              enabled={s.comment_enabled}
              mode={s.comment_mode}
              fixedReply={s.comment_fixed_reply}
              onToggle={() => upd({ comment_enabled: !s.comment_enabled })}
              onMode={(m: string) => upd({ comment_mode: m })}
              onFixed={(v: string) => upd({ comment_fixed_reply: v })}
              note="Works on your own posts. When on, Dawn replies as soon as a new comment arrives."
            />

            <AutomationCard
              icon={Mail}
              title="Auto DM-reply"
              desc="Automatically reply to direct messages."
              enabled={s.dm_enabled}
              mode={s.dm_mode}
              fixedReply={s.dm_fixed_reply}
              onToggle={() => upd({ dm_enabled: !s.dm_enabled })}
              onMode={(m: string) => upd({ dm_mode: m })}
              onFixed={(v: string) => upd({ dm_fixed_reply: v })}
              note="Instagram only allows replying within 24 hours of a user's message — so Dawn replies to people who message you, not cold outreach."
            />

            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-navy text-white font-medium px-6 py-3 rounded-xl hover:bg-navy-soft transition-colors disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
                {saved ? "Saved" : "Save automation settings"}
              </button>
              {(s.comment_enabled || s.dm_enabled) && (
                <button onClick={runNow} disabled={running} className="flex items-center gap-2 bg-amber text-navy font-medium px-6 py-3 rounded-xl hover:bg-amber-deep hover:text-white transition-colors disabled:opacity-60">
                  {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Replying…</> : "Run now"}
                </button>
              )}
              <button onClick={diagnose} disabled={debugging} className="flex items-center gap-2 text-sm font-medium border border-navy/15 text-navy/70 px-4 py-3 rounded-xl hover:border-navy/30 transition-colors disabled:opacity-60">
                {debugging ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Diagnose
              </button>
              {saved && <span className="text-emerald-600 text-sm">Settings saved.</span>}
            </div>

            {debug && (
              <div className="bg-navy rounded-xl p-4 text-white text-xs overflow-auto">
                <p className="font-semibold text-amber mb-2">What Dawn sees:</p>
                <p>Account: {debug.me?.username || "?"} ({debug.me?.account_type || "?"})</p>
                <p className="mt-2 font-medium">Posts found: {debug.posts?.length || 0}</p>
                {(debug.posts || []).map((p: any, i: number) => (
                  <div key={i} className="ml-3 mt-1 text-white/70">
                    <p>• &ldquo;{p.caption}&rdquo; — IG says {p.igCommentCount} comments, Dawn read {p.commentCount} {p.commentError ? `(err: ${p.commentError})` : ""}</p>
                    {(p.comments || []).map((c: any, j: number) => (
                      <p key={j} className="ml-4 text-white/50">↳ @{c.username}: &ldquo;{c.text}&rdquo; {c.hasReplies ? "(already replied)" : ""}</p>
                    ))}
                  </div>
                ))}
                {debug.firstPostWithComments && (
                  <div className="mt-2 text-white/60">
                    <p className="text-amber">Raw response (first post with comments):</p>
                    <pre className="whitespace-pre-wrap break-all text-[10px] bg-black/30 rounded p-2 mt-1">{JSON.stringify(debug.firstPostWithComments.rawResponse, null, 1)}</pre>
                  </div>
                )}
                <p className="mt-2 font-medium">DM conversations: {debug.conversations?.count ?? (debug.conversations?.error ? `error: ${debug.conversations.error}` : "0")}</p>
                {(debug.conversations?.items || []).map((c: any, i: number) => (
                  <p key={i} className="ml-3 text-white/50">↳ latest: &ldquo;{c.latestMessage}&rdquo; from {c.latestFrom?.username || c.latestFrom?.id}</p>
                ))}
                {debug.errors?.length > 0 && <p className="mt-2 text-red-300">Errors: {debug.errors.join("; ")}</p>}
              </div>
            )}

            {runResult && (
              <div className={`rounded-xl p-4 ${runResult.error ? "bg-red-50 border border-red-200" : "bg-emerald-50 border border-emerald-200"}`}>
                {runResult.error ? (
                  <p className="text-sm text-red-600">{runResult.error}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-emerald-700">
                      {(runResult.replied || 0) + (runResult.dmReplied || 0) > 0
                        ? `Replied to ${runResult.replied || 0} comment${runResult.replied === 1 ? "" : "s"} and ${runResult.dmReplied || 0} DM${runResult.dmReplied === 1 ? "" : "s"}.`
                        : "No new comments or DMs to reply to right now."}
                    </p>
                    {runResult.drafts && runResult.drafts.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {runResult.drafts.map((d, i) => (
                          <div key={i} className="text-xs bg-white rounded-lg p-3 border border-emerald-100">
                            <p className="text-navy/60">💬 @{d.username}: &ldquo;{d.comment}&rdquo;</p>
                            <p className="text-navy font-medium mt-1">↳ {d.reply}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {runResult.dmDrafts && runResult.dmDrafts.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {runResult.dmDrafts.map((d, i) => (
                          <div key={i} className="text-xs bg-white rounded-lg p-3 border border-emerald-100">
                            <p className="text-navy/60">✉️ &ldquo;{d.message}&rdquo;</p>
                            <p className="text-navy font-medium mt-1">↳ {d.reply}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-navy/50 bg-amber/5 border border-amber/20 rounded-xl p-4">
              <Info className="w-4 h-4 text-amber-deep shrink-0 mt-0.5" />
              <span>
                Automation runs live on your connected account. Your settings are saved and applied automatically to every new comment and message.
              </span>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
