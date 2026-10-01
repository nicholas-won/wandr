/**
 * Rolling refresh for long-lived device sessions (J-6): a valid session or personal-link cookie
 * older than a day is re-issued for another 60 days, so active people never get signed out
 * mid-trip (when their home SIM may be off and codes can't arrive).
 */
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, cookieOptions } from "@/lib/auth/cookies";
import {
  SESSION_TTL_SECONDS,
  shouldRefresh,
  signPayload,
  verifyPayload,
  type CookiePayload,
} from "@/lib/auth/tokens";

function strip<T extends { iat?: number; exp?: number }>(p: T): Omit<T, "iat" | "exp"> {
  const { iat: _iat, exp: _exp, ...rest } = p;
  void _iat;
  void _exp;
  return rest;
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  // Only on GETs: a POST may be a Server Action that sets or clears these cookies itself.
  if (request.method !== "GET") return response;
  const full = await verifyPayload(request.cookies.get(COOKIE.session)?.value, "full");
  if (full && shouldRefresh(full.iat)) {
    const token = await signPayload(strip(full) as CookiePayload, SESSION_TTL_SECONDS);
    response.cookies.set(COOKIE.session, token, cookieOptions(SESSION_TTL_SECONDS));
  }
  const links = await verifyPayload(request.cookies.get(COOKIE.links)?.value, "links");
  if (links && shouldRefresh(links.iat)) {
    const token = await signPayload(strip(links) as CookiePayload, SESSION_TTL_SECONDS);
    response.cookies.set(COOKIE.links, token, cookieOptions(SESSION_TTL_SECONDS));
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: skip API routes, Next internals and static files.
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)",
      has: [{ type: "cookie", key: "w_sid" }],
    },
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)",
      has: [{ type: "cookie", key: "w_lnk" }],
    },
  ],
};
