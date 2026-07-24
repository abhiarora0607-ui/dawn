"use client";

// V60 spine: the people directory in-shell. PeopleSearch is a scrim overlay
// by design (portal heritage), so this page is its launcher — open it, find
// anyone, close back to here. V62 may grow this into a full directory page.

import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { PeopleSearch } from "@/components/PeopleSearch";
import { Search } from "lucide-react";

export default function Page() {
  const [open, setOpen] = useState(false);
  return (
    <DashboardShell>
      <main className="flex-1">
        <DashTopbar pageTitle="People" />
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
          <button onClick={() => setOpen(true)} className="dawn-card p-6 w-full text-left hover:border-amber/40 transition-colors flex items-center gap-4">
            <span className="w-11 h-11 rounded-2xl bg-amber/15 flex items-center justify-center shrink-0"><Search className="w-5 h-5 text-amber-deep" /></span>
            <span>
              <p className="font-semibold text-navy">Find anyone</p>
              <p className="text-sm text-muted mt-0.5">Search your organisation by name, role or department.</p>
            </span>
          </button>
        </div>
        {open && <PeopleSearch onClose={() => setOpen(false)} />}
      </main>
    </DashboardShell>
  );
}
