"use client";

import { useState, useRef, useEffect } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { useBrief } from "@/lib/use-brief";
import {
  Upload, Loader2, Sparkles, Wand2, RefreshCw, Check, Copy, Image as ImageIcon,
  Sun, Contrast, Droplet, Thermometer, Focus, AlertTriangle, Instagram,
} from "lucide-react";

type Analysis = {
  subject: string; scene: string; setting: string; lighting: string;
  mood: string; colors: string; category: string; composition: string; quality_notes: string;
};
type Enhancement = { brightness: number; contrast: number; saturation: number; warmth: number; sharpness: number; explanation: string };
type Caption = { style: string; text: string };
type Hashtags = { trending: string[]; niche: string[]; low_competition: string[]; local: string[] };
type Result = { analysis: Analysis; enhancement: Enhancement; fix_flags: string[]; captions: Caption[]; hashtags: Hashtags };

function applyFilters(enh: Enhancement | null) {
  if (!enh) return "none";
  // Amplify so the toggle is clearly visible; clamp to sane bounds.
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const b = clamp(1 + (enh.brightness || 0) / 60, 0.6, 1.5);
  const c = clamp(1 + (enh.contrast || 0) / 60, 0.6, 1.6);
  const s = clamp(1 + (enh.saturation || 0) / 50, 0.4, 1.8);
  const warmth = (enh.warmth || 0) / 100;
  // Warm = add sepia + slight hue shift toward orange; cool = slight desaturate.
  const sepia = clamp(Math.max(0, warmth) * 0.5, 0, 0.5);
  const hue = warmth < 0 ? clamp(warmth * 20, -30, 0) : 0;
  return `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)}) saturate(${s.toFixed(3)}) sepia(${sepia.toFixed(3)}) hue-rotate(${hue}deg)`;
}

export default function Create() {
  const { data } = useBrief();
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgBase64, setImgBase64] = useState<string>("");
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [enhanced, setEnhanced] = useState(true);
  const [selectedCaption, setSelectedCaption] = useState<string>("");
  const [copiedTags, setCopiedTags] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Resize/compress on a canvas before sending — large phone photos
      // otherwise cause 500s / timeouts on the analysis API.
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.85);
          setImgSrc(compressed);
          setImgBase64(compressed.split(",")[1] || "");
          setMimeType("image/jpeg");
        } else {
          // fallback: use original
          setImgSrc(dataUrl);
          setImgBase64(dataUrl.split(",")[1] || "");
          setMimeType(file.type);
        }
      };
      img.onerror = () => {
        setImgSrc(dataUrl);
        setImgBase64(dataUrl.split(",")[1] || "");
        setMimeType(file.type);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function analyze() {
    if (!imgBase64) return;
    setAnalyzing(true);
    setError("");
    try {
      const res = await fetch("/api/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imgBase64, mimeType }),
      });
      const d = await res.json();
      if (res.ok) {
        setResult(d);
        setSelectedCaption(d.captions?.[0]?.text || "");
      } else {
        setError(d.error || "Analysis failed.");
      }
    } catch {
      setError("Network error. Try again.");
    }
    setAnalyzing(false);
  }

  const allHashtags = result
    ? [...(result.hashtags.trending || []), ...(result.hashtags.niche || []), ...(result.hashtags.low_competition || []), ...(result.hashtags.local || [])].join(" ")
    : "";

  function copyTags() {
    navigator.clipboard.writeText(allHashtags);
    setCopiedTags(true);
    setTimeout(() => setCopiedTags(false), 1500);
  }

  return (
    <DashboardShell>
      <DashTopbar account={data?.account} pageTitle="Create" />
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Create a post</h1>
          <p className="text-navy/50 text-sm mt-1">Upload a photo. Dawn analyzes it, enhances it, and writes your caption &amp; hashtags.</p>
        </div>

        {!imgSrc ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-navy/15 rounded-2xl p-16 flex flex-col items-center justify-center gap-3 hover:border-amber/50 hover:bg-amber/5 transition-colors"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber/15 flex items-center justify-center">
              <Upload className="w-7 h-7 text-amber-deep" />
            </div>
            <p className="font-semibold text-navy">Upload an image</p>
            <p className="text-sm text-navy/50">JPG or PNG · Dawn does the rest</p>
          </button>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* LEFT: image + enhancement */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-navy/8 p-4">
                <div className="relative rounded-xl overflow-hidden bg-navy/5 aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgSrc}
                    alt="upload"
                    className="w-full h-full object-cover transition-all duration-300"
                    style={{ filter: enhanced ? applyFilters(result?.enhancement || null) : "none" }}
                  />
                  {result && (
                    <div className="absolute top-3 left-3 flex gap-2">
                      <button
                        onClick={() => setEnhanced(false)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg ${!enhanced ? "bg-navy text-white" : "bg-white/90 text-navy"}`}
                      >Original</button>
                      <button
                        onClick={() => setEnhanced(true)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg ${enhanced ? "bg-amber text-navy" : "bg-white/90 text-navy"}`}
                      >Enhanced</button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => fileRef.current?.click()} className="flex-1 text-sm font-medium border border-navy/15 text-navy px-4 py-2.5 rounded-xl hover:border-navy/30 transition-colors">
                    Change image
                  </button>
                  {!result && (
                    <button onClick={analyze} disabled={analyzing} className="flex-1 flex items-center justify-center gap-2 text-sm font-medium bg-navy text-white px-4 py-2.5 rounded-xl hover:bg-navy-soft transition-colors disabled:opacity-60">
                      {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</> : <><Wand2 className="w-4 h-4" /> Analyze &amp; enhance</>}
                    </button>
                  )}
                </div>
                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              </div>

              {/* Enhancement details */}
              {result && (
                <div className="bg-white rounded-2xl border border-navy/8 p-5">
                  <h3 className="text-sm font-semibold text-navy/50 uppercase tracking-wide mb-3">Auto-enhancement</h3>
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {[
                      { icon: Sun, label: "Bright", val: result.enhancement.brightness },
                      { icon: Contrast, label: "Contrast", val: result.enhancement.contrast },
                      { icon: Droplet, label: "Color", val: result.enhancement.saturation },
                      { icon: Thermometer, label: "Warmth", val: result.enhancement.warmth },
                      { icon: Focus, label: "Sharp", val: result.enhancement.sharpness },
                    ].map((a) => (
                      <div key={a.label} className="text-center">
                        <div className="w-9 h-9 rounded-lg bg-amber/10 flex items-center justify-center mx-auto mb-1">
                          <a.icon className="w-4 h-4 text-amber-deep" />
                        </div>
                        <p className="text-[10px] text-navy/50">{a.label}</p>
                        <p className={`text-xs font-semibold ${a.val > 0 ? "text-emerald-600" : a.val < 0 ? "text-red-500" : "text-navy/40"}`}>{a.val > 0 ? "+" : ""}{a.val}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-navy/60 leading-snug">{result.enhancement.explanation}</p>

                  {result.fix_flags?.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {result.fix_flags.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 bg-amber/5 rounded-lg p-2.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-deep shrink-0 mt-0.5" />
                          <span className="text-xs text-navy/70">{f}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: analysis, captions, hashtags */}
            <div className="space-y-4">
              {analyzing && !result && (
                <div className="bg-white rounded-2xl border border-navy/8 p-12 flex items-center justify-center text-navy/40">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Dawn is looking at your photo…
                </div>
              )}

              {result && (
                <>
                  {/* Analysis */}
                  <div className="bg-navy rounded-2xl p-5 text-white">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-amber" />
                      <span className="text-xs font-semibold text-amber uppercase tracking-wide">What Dawn sees</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      {[
                        ["Subject", result.analysis.subject],
                        ["Category", result.analysis.category],
                        ["Mood", result.analysis.mood],
                        ["Lighting", result.analysis.lighting],
                        ["Setting", result.analysis.setting],
                        ["Colors", result.analysis.colors],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <span className="text-white/40 text-xs">{k}</span>
                          <p className="text-white/90 leading-snug">{v}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-white/60 text-xs mt-3 pt-3 border-t border-white/10">{result.analysis.composition} · {result.analysis.quality_notes}</p>
                  </div>

                  {/* Captions */}
                  <div className="bg-white rounded-2xl border border-navy/8 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-navy/50 uppercase tracking-wide">Captions</h3>
                      <button onClick={analyze} disabled={analyzing} className="flex items-center gap-1.5 text-xs font-medium text-navy/60 hover:text-navy">
                        <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? "animate-spin" : ""}`} /> Regenerate
                      </button>
                    </div>
                    <div className="space-y-2">
                      {result.captions.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedCaption(c.text)}
                          className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedCaption === c.text ? "border-amber bg-amber/5" : "border-navy/8 hover:border-navy/20"}`}
                        >
                          <span className="text-[10px] font-bold text-amber-deep uppercase">{c.style}</span>
                          <p className="text-sm text-navy leading-snug mt-1">{c.text}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hashtags */}
                  <div className="bg-white rounded-2xl border border-navy/8 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-navy/50 uppercase tracking-wide">Hashtags</h3>
                      <button onClick={copyTags} className="flex items-center gap-1.5 text-xs font-medium text-navy/60 hover:text-navy">
                        {copiedTags ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy all</>}
                      </button>
                    </div>
                    {[
                      ["Trending", result.hashtags.trending, "text-amber-deep"],
                      ["Niche", result.hashtags.niche, "text-navy"],
                      ["Low competition", result.hashtags.low_competition, "text-emerald-600"],
                      ["Local", result.hashtags.local, "text-navy/60"],
                    ].map(([label, tags, color]: any) => (
                      tags?.length > 0 && (
                        <div key={label} className="mb-3 last:mb-0">
                          <p className={`text-[10px] font-bold uppercase mb-1.5 ${color}`}>{label} <span className="text-navy/30">· est. relevance</span></p>
                          <div className="flex flex-wrap gap-1.5">
                            {tags.map((t: string, i: number) => (
                              <span key={i} className="text-xs bg-navy/5 text-navy/70 px-2 py-1 rounded">{t}</span>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>

                  {/* Preview note */}
                  <div className="bg-white rounded-2xl border border-navy/8 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Instagram className="w-4 h-4 text-navy" />
                      <h3 className="text-sm font-semibold text-navy/50 uppercase tracking-wide">Ready to post</h3>
                    </div>
                    <p className="text-sm text-navy/60 leading-snug mb-3">
                      Your enhanced image, selected caption, and hashtags are ready. Direct publishing works once your account is connected and (for public users) approved by Meta.
                    </p>
                    <div className="text-xs text-navy/50 bg-surface rounded-lg p-3">
                      <span className="font-medium">Note:</span> Instagram&apos;s API can&apos;t attach music to posts and needs a hosted image URL to publish — so &ldquo;Post now&rdquo; activates in the next build once image hosting is wired.
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      </div>
    </DashboardShell>
  );
}
