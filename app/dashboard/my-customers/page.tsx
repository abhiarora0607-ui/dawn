"use client";

// V61: the employee's Customers — the portal's inline tab, re-homed into the shell.
// TeamCrm carries the moved machinery; the actor-route-guard enforces the
// same permission the portal did.

import { DashboardShell } from "@/components/DashboardShell";
import { DashTopbar } from "@/components/DashTopbar";
import { TeamCrm } from "@/components/TeamCrm";

export default function Page() {
  return (
    <DashboardShell>
      <main className="flex-1">
        <DashTopbar pageTitle="Customers" />
        <div className="p-4 sm:p-6">
          <TeamCrm view="customers" />
        </div>
      </main>
    </DashboardShell>
  );
}
