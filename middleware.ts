// middleware.ts
// Route separation between the admin (owner) area and the employee portal.
//  - Employee sessions (dawn_emp cookie) are blocked from /dashboard/* admin
//    pages and redirected to their /team portal.
//  - The /team portal requires an employee cookie; without it → /team-login.
// This is a fast cookie-presence gate. Full validation still happens in the
// APIs (which check the session against the DB), so this is defense-in-depth,
// not the sole control.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasEmp = req.cookies.has("dawn_emp");

  // Employee trying to reach the admin dashboard → send to their portal.
  if (pathname.startsWith("/dashboard") && hasEmp) {
    return NextResponse.redirect(new URL("/team", req.url));
  }

  // Team portal requires an employee session cookie.
  if (pathname === "/team" && !hasEmp) {
    return NextResponse.redirect(new URL("/team-login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/team"],
};
