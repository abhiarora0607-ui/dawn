"use client";

// Root-level catch: fires only if the layout itself throws. Must render its
// own <html>/<body> because the layout is gone at this point.

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F8F9FC", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", border: "1px solid #E4E8F0", borderRadius: 16, padding: 32, maxWidth: 360, textAlign: "center" }}>
          <h1 style={{ color: "#16233F", fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#5B6478", fontSize: 14, marginBottom: 20 }}>Dawn hit an unexpected error. Your data is safe.</p>
          <button onClick={() => reset()} style={{ background: "#16233F", color: "#fff", border: 0, borderRadius: 12, padding: "10px 24px", fontSize: 14, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
