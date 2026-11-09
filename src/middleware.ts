import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthSecret } from "@/lib/auth/secret";
import { idleLoginPath, isIdleExpired } from "@/lib/auth/idle";
import { homePathForRole, isAppRole, loginPathForRole, requiredRoleForPath } from "@/lib/auth/routes";

/** Public entry pages a signed-in user has no reason to see (the portal chooser and both sign-in portals). */
const ENTRY_PATHS = ["/", "/login", "/login/agency", "/login/interpreter"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isEntryPage = ENTRY_PATHS.includes(pathname);
  const requiredRole = requiredRoleForPath(pathname);
  if (!requiredRole && !isEntryPage) return NextResponse.next();

  const token = await getToken({ req, secret: getAuthSecret() });
  // An agency login idle past the limit counts as signed out everywhere, so the entry pages below do not bounce it back in.
  const idle = isIdleExpired(token);
  const role = !idle && isAppRole(token?.role) ? token.role : null;

  if (isEntryPage) {
    if (!role) return NextResponse.next();
    // Already signed in: skip the landing/login page. Honour a same-site callback only if this role may open it.
    const callback = req.nextUrl.searchParams.get("callbackUrl");
    const target =
      callback && callback.startsWith("/") && !callback.startsWith("//") && requiredRoleForPath(callback.split("?")[0]) === role
        ? callback
        : homePathForRole(role);
    return NextResponse.redirect(new URL(target, req.url));
  }

  if (!requiredRole || role === requiredRole) return NextResponse.next();

  if (role) {
    // Signed in, but this is the other role's area (e.g. an interpreter typing /dashboard): no access. They are sent
    // to their own workspace, never into the other one.
    return NextResponse.redirect(new URL(homePathForRole(role), req.url));
  }

  // Idle sign-out: the agency sign-in with the reason, remembering where they were.
  if (idle && requiredRole === "agency") return NextResponse.redirect(new URL(idleLoginPath(`${pathname}${search}`), req.url));

  // Not signed in: the sign-in portal for the area they were headed to, remembering where that was.
  const loginUrl = new URL(loginPathForRole(requiredRole), req.url);
  loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

// Static literals are required here. Keep in sync with AGENCY_PREFIXES / INTERPRETER_PREFIXES in lib/auth/routes.ts.
export const config = {
  matcher: [
    "/",
    "/login",
    "/login/agency",
    "/login/interpreter",
    "/dashboard/:path*",
    "/requests/:path*",
    "/calendar/:path*",
    "/clients/:path*",
    "/interpreters/:path*",
    "/billing/:path*",
    "/settings/:path*",
    "/hours-review/:path*",
    "/website-requests/:path*",
    "/inbox/:path*",
    "/admin/:path*",
    "/jobs/:path*",
    "/interpreter-home/:path*",
    "/interpreter-calendar/:path*",
    "/interpreter-settings/:path*",
    "/agencies/:path*",
    "/profile/:path*",
    "/prep/:path*",
    "/mileage/:path*",
  ],
};
