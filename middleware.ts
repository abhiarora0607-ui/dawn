// middleware.ts
// Session routing for the ONE app (V61.1).
//
// History: until V60 this file enforced a two-app world — employees were
// bounced OUT of /dashboard and into the /team portal. V60 moved employees
// INTO the shell and V61 retired the portal to a redirect, which turned that
// rule into an infinite loop (/dashboard → /team → /dashboard) and, worse,
// would have locked every employee out of the app they now live in.
//
// The shell decides what an employee may SEE (lib/nav.ts + the actor route
// guard); this file only answers "is there a session at all?". Fast cookie
// presence only — the APIs still validate every session against the DB.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasEmp = req.cookies.has("dawn_emp");
  // Owners hold EITHER a magic-link session (dawn_uid) or an Instagram
  // identity (dawn_ig) — getUid() accepts both, so this gate must too.
  const hasOwner = req.cookies.has("dawn_uid") || req.cookies.has("dawn_ig");

  // The unified dashboard admits both actors. With no session of either kind,
  // send them to the door that fits: employees know /team-login, owners /signin.
  // (We can't tell which they are with no cookie, so /signin carries both —
  // it links to the employee login.)
  if (pathname.startsWith("/dashboard") && !hasEmp && !hasOwner) {
    return NextResponse.redirect(new URL("/signin", req.url));
  }

  // /team is a retired bookmark. Its page component decides where to send
  // people; middleware stays out of the way so the two can't disagree.
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
