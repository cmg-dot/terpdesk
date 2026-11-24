import { NextResponse } from "next/server";
import { isMissingTable } from "@/lib/availability/personalJobConflict";
import { etagOf, matchesEtag, buildFeedText } from "@/lib/calendarFeed/feed";
import { touchFeed } from "@/lib/calendarFeed/store";
import { hashFeedToken, parseFeedToken } from "@/lib/calendarFeed/token";
import { logError } from "@/lib/logError";

/**
 * GET /api/calendar/feed/<secret>.ics: an interpreter's private calendar subscription (Apple, Google and other calendar apps fetch it with
 * no sign-in; the secret in the address is the credential). Public on purpose, so it is outside the middleware's protected paths and
 * guards itself:
 *  - a malformed, unknown or revoked secret (or a database that has not had migration 0016) all get the IDENTICAL 404, so the answer
 *    never tells which, or whether a feed exists;
 *  - about 60 fetches an hour per secret, counted in the database in one statement; past that, 429 with Retry-After;
 *  - ETag / If-None-Match: a calendar app that already has this version gets a bodiless 304;
 *  - no cookies, never indexed, never sent a Referer, and nothing about the fetch is written to the audit log or any other log: the
 *    address holds the secret, so the path is never printed.
 * Events say only "terpDESK job", "Personal job" or "Busy" (lib/calendarFeed/events.ts).
 */

export const dynamic = "force-dynamic";

const COMMON = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

/** The one answer for anything that is not an active feed. Built fresh each time; every field is constant. */
const notFound = () => new NextResponse("Not found", { status: 404, headers: { ...COMMON, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(request: Request, context: { params: { token: string } }) {
  const token = parseFeedToken(context.params.token);
  if (!token) return notFound();

  let touch;
  try {
    touch = await touchFeed(hashFeedToken(token));
  } catch (err) {
    if (isMissingTable(err)) return notFound();
    logError("calendarFeed.touch", err);
    return new NextResponse("Temporarily unavailable", { status: 503, headers: { ...COMMON, "Cache-Control": "no-store", "Retry-After": "300" } });
  }
  if (touch.kind === "unknown") return notFound();
  if (touch.kind === "limited") {
    return new NextResponse("Too many requests", { status: 429, headers: { ...COMMON, "Cache-Control": "no-store", "Retry-After": String(touch.retryAfterSeconds) } });
  }

  try {
    const text = await buildFeedText(touch.interpreterId, touch.level, new Date());
    const etag = etagOf(text);
    const headers = { ...COMMON, ETag: etag, "Cache-Control": "private, max-age=300, must-revalidate" };
    if (matchesEtag(request.headers.get("if-none-match"), etag)) return new NextResponse(null, { status: 304, headers });
    return new NextResponse(text, {
      status: 200,
      headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="terpdesk.ics"' },
    });
  } catch (err) {
    logError("calendarFeed.build", err);
    return new NextResponse("Temporarily unavailable", { status: 503, headers: { ...COMMON, "Cache-Control": "no-store", "Retry-After": "300" } });
  }
}
