"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="noprint"
      style={{ width: "100%", padding: "12px", background: "#16233F", color: "#fff", border: 0, borderRadius: 12, fontWeight: 600, marginBottom: 16, cursor: "pointer" }}
    >
      Print / Save as PDF
    </button>
  );
}
