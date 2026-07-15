"use client";

// Route-level error boundary. When any page throws during render, the user
// gets a branded recovery screen instead of a white void.

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC] p-6">
      <div className="bg-white rounded-2xl border border-[#E4E8F0] p-8 max-w-sm w-full text-center shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
        <h1 className="font-semibold text-lg text-[#16233F] mb-1">Something went wrong</h1>
        <p className="text-sm text-[#5B6478] mb-5">The page hit an error. Your data is safe — try again.</p>
        <div className="flex gap-2">
          <button onClick={() => reset()} className="flex-1 bg-[#16233F] text-white font-medium py-2.5 rounded-xl text-sm">Try again</button>
          <a href="/dashboard" className="flex-1 border border-[#E4E8F0] text-[#16233F] font-medium py-2.5 rounded-xl text-sm">Go home</a>
        </div>
      </div>
    </div>
  );
}
