// app/team/page.tsx — the portal, retired with honours (V61).
//
// Every one of its nineteen tabs now lives inside the app shell: the V60
// spine took the workspace half, V61's TeamCrm took the CRM half. This route
// remains only to carry old bookmarks home — with a session, to the shell;
// without one, to the login.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Team() {
  const uid = await getUid();
  const emp = cookies().get("dawn_emp")?.value;
  redirect(uid || emp ? "/dashboard" : "/team-login");
}
