import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthSecret } from "@/lib/auth/secret";
import { homePathForRole, isAppRole, requiredRoleForPath } from "@/lib/auth/routes";

/** Public entry pages a signed-in user has no reason to see. */
const ENTRY_PATHS = ["/", "/login"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isEntryPage = ENTRY_PATHS.includes(pathname);
  const requiredRole = requiredRoleForPath(pathname);
  if (!requiredRole && !isEntryPage) return NextResponse.next();

  const token = await getToken({ req, secret: getAuthSecret() });
  const role = isAppRole(token?.role) ? token.role : null;

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

  if (role === requiredRole) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  if (!role) {
    // Not signed in: remember where they were headed.
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  } else {
    // Signed in with the wrong role: never send them back to the area they are not allowed in.
    loginUrl.searchParams.set("error", "forbidden");
  }
  return NextResponse.redirect(loginUrl);
}

// Static literals are required here. Keep in sync with AGENCY_PREFIXES / INTERPRETER_PREFIXES in lib/auth/routes.ts.
export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/requests/:path*",
    "/calendar/:path*",
    "/clients/:path*",
    "/interpreters/:path*",
    "/billing/:path*",
    "/settings/:path*",
    "/hours-review/:path*",
    "/website-requests/:path*",
    "/jobs/:path*",
    "/interpreter-home/:path*",
    "/interpreter-calendar/:path*",
    "/interpreter-settings/:path*",
    "/agencies/:path*",
  ],
};
