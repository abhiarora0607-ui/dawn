"use client";

// Contact CSV import. Parses a file in the browser, shows a preview, then sends
// clean rows to the import API. Deliberately forgiving about column names —
// matches common headers (Name/Phone/Email…) case-insensitively.

import { useState } from "react";
import { X, Upload, Loader2, CheckCircle2, FileText } from "lucide-react";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (line: string) => {
    const out: string[] = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === "," && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = split(line); const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ""; });
    return row;
  });
}

// Map many possible header spellings onto our fields.
function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) if (row[k]) return row[k];
  return "";
}

export function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name); setErr(""); setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ""));
      const mapped = parsed.map((r) => ({
        name: pick(r, ["name", "full name", "contact", "customer"]),
        phone: pick(r, ["phone", "mobile", "number", "contact number", "whatsapp"]),
        email: pick(r, ["email", "e-mail"]),
        instagram: pick(r, ["instagram", "handle", "ig", "insta"]),
        source: pick(r, ["source", "channel"]),
        stage: pick(r, ["stage", "status"]),
        notes: pick(r, ["notes", "note", "remark", "remarks"]),
      })).filter((r) => r.name);
      if (mapped.length === 0) setErr("Couldn't find a Name column. Make sure your file has a header row with at least a 'Name' column.");
      setRows(mapped);
    };
    reader.readAsText(f);
  }

  async function doImport() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Import failed."); setBusy(false); return; }
      setResult(data); setBusy(false);
    } catch { setErr("Import failed."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-navy/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto dawn-scroll" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-navy-line">
          <h2 className="font-display font-semibold text-lg text-navy">Import contacts</h2>
          <button onClick={onClose} className="text-navy/40 hover:text-navy"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="font-semibold text-navy text-lg">{result.inserted} contact(s) imported</p>
              <p className="text-sm text-muted mt-1">
                {result.skipped > 0 && `${result.skipped} skipped (already existed). `}
                {result.failed > 0 && `${result.failed} couldn't be read.`}
              </p>
              <button onClick={() => { onDone(); onClose(); }} className="mt-5 bg-navy text-white px-6 py-2.5 rounded-xl font-medium">Done</button>
            </div>
          ) : (
            <>
              <div className="bg-surface rounded-xl p-4 text-sm text-muted">
                <p className="font-medium text-navy mb-1">How it works</p>
                Upload a CSV (from Excel, Google Sheets, or your phone contacts). We look for columns like <span className="font-medium">Name, Phone, Email, Instagram, Source, Notes</span>. Only Name is required. Duplicates (same phone) are skipped automatically.
              </div>

              <label className="block border-2 border-dashed border-navy-line rounded-xl p-6 text-center cursor-pointer hover:border-amber transition-colors">
                <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
                {fileName ? (
                  <span className="flex items-center justify-center gap-2 text-navy font-medium"><FileText className="w-5 h-5 text-amber-deep" /> {fileName}</span>
                ) : (
                  <span className="flex flex-col items-center gap-2 text-muted"><Upload className="w-6 h-6" /> Choose a CSV file</span>
                )}
              </label>

              {err && <p className="text-sm text-red-600">{err}</p>}

              {rows.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-navy mb-2">{rows.length} contact(s) ready to import</p>
                  <div className="border border-navy-line rounded-xl overflow-hidden max-h-48 overflow-y-auto dawn-scroll">
                    {rows.slice(0, 8).map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-sm border-b border-navy-line/50 last:border-0">
                        <span className="text-navy font-medium">{r.name}</span>
                        <span className="text-muted text-xs">{r.phone || r.email || r.instagram || "—"}</span>
                      </div>
                    ))}
                    {rows.length > 8 && <p className="px-3 py-2 text-xs text-muted">…and {rows.length - 8} more</p>}
                  </div>
                </div>
              )}

              <button onClick={doImport} disabled={busy || rows.length === 0} className="w-full flex items-center justify-center gap-2 bg-navy text-white font-medium py-3 rounded-xl hover:bg-navy-soft disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import {rows.length > 0 ? `${rows.length} contact(s)` : ""}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
