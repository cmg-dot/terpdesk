import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bookedAppointments } from "@/lib/interpreterCalendar";
import { effectiveOfferStatus, isBookedForCalendar, requestIsCancelled } from "@/lib/calendarFeed/bookedRule";

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");

/**
 * Server vs client booking parity. The Calendar page draws `bookedAppointments(jobs)`, where each job's status is the one
 * fetchInterpreterOffers gives it. The feed must contain exactly those jobs. This runs both over every combination.
 */
describe("the feed shows the jobs the Calendar page shows", () => {
  const offerStatuses = ["accepted", "pending", "declined", "expired", "withdrawn", "cancelled", "booked", "Accepted"];
  const requests: { status: string; canceledAt: Date | null }[] = [
    { status: "Booked", canceledAt: null }, { status: "Offer awaiting response", canceledAt: null }, { status: "Unfilled / draft", canceledAt: null },
    { status: "Cancelled", canceledAt: null }, { status: "Canceled", canceledAt: null }, { status: "cancelled", canceledAt: null }, { status: "Canceleed", canceledAt: null },
    { status: "Booked", canceledAt: new Date() }, { status: "Completed", canceledAt: null },
  ];
  const titles = ["Seattle Children's Hospital", "Dale Fictional test", "fictional lowercase is fine here", ""];

  /** The status the interpreter's job list shows, written the way fetchInterpreterOffers writes it (checked against the source below). */
  const clientStatus = (offerStatus: string, request: { status: string; canceledAt: Date | null }): string => {
    const requestCancelled = Boolean(request.canceledAt) || /^cancel+ed$/i.test(request.status);
    return requestCancelled && offerStatus === "accepted" ? "cancelled" : requestCancelled && offerStatus === "pending" ? "withdrawn" : offerStatus;
  };
  const clientShows = (offerStatus: string, request: { status: string; canceledAt: Date | null }, title: string): boolean =>
    bookedAppointments([{ id: "offer-1", requestId: "req-1", status: clientStatus(offerStatus, request), title, startsAt: "2026-12-07T17:00:00Z", endsAt: "2026-12-07T18:00:00Z" }]).length === 1;

  it("agrees on every combination of offer status, request status and title", () => {
    let compared = 0;
    for (const offer of offerStatuses) for (const request of requests) for (const title of titles) {
      assert.equal(isBookedForCalendar(offer, request, title), clientShows(offer, request, title), `${offer} / ${JSON.stringify(request)} / ${title}`);
      compared += 1;
    }
    assert.equal(compared, offerStatuses.length * requests.length * titles.length);
  });

  it("the pieces agree too: a cancelled request closes an accepted offer and withdraws a pending one", () => {
    assert.ok(requestIsCancelled({ status: "Cancelled" }) && requestIsCancelled({ status: "Booked", canceledAt: new Date() }) && !requestIsCancelled({ status: "Booked" }));
    assert.equal(effectiveOfferStatus("accepted", true), "cancelled");
    assert.equal(effectiveOfferStatus("pending", true), "withdrawn");
    assert.equal(effectiveOfferStatus("accepted", false), "accepted");
    assert.equal(effectiveOfferStatus("declined", true), "declined");
  });

  it("the rule in the job list's action has not drifted from the one the feed uses", () => {
    const action = read("src", "app", "actions", "getInterpreterOffers.ts").replace(/\s+/g, " ");
    assert.ok(action.includes("Boolean(row.request.canceledAt) || /^cancel+ed$/i.test(row.request.status)"), "the cancelled test");
    assert.ok(action.includes("requestCancelled && row.offer.status === 'accepted' ? 'cancelled'"), "an accepted offer on a cancelled request reads cancelled");
    assert.ok(action.includes("requestCancelled && row.offer.status === 'pending' ? 'withdrawn'"), "a pending one reads withdrawn");
    assert.ok(action.includes("resolveRequestTimes(row.request)"), "the same function gives the job's times");
    const feed = read("src", "lib", "calendarFeed", "sources.ts");
    assert.ok(feed.includes("resolveRequestTimes({ createdAt: row.createdAt, data: row.data })"), "the feed uses it too");
    const page = read("src", "lib", "interpreterCalendar.ts");
    assert.ok(page.includes('status === "booked" || status === "accepted"') && page.includes('!(j.title || "").includes("Fictional")'), "the page's own filter");
  });
});
