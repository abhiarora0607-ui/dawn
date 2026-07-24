"use client";

// V60 spine: Studio re-homed from the /team portal into the app shell. The
// shell's actor-route-guard admits exactly the actors the nav registry
// allows; this file stays a thin mount on purpose — V61/62 deepen it.

import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { TeamStudio } from "@/components/TeamStudio";

export default function Page() {
  return (
    <DashboardShell>
      <main className="flex-1">
        <DashTopbar pageTitle="Studio" />
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
          <TeamStudio />
        </div>
      </main>
    </DashboardShell>
  );
}
