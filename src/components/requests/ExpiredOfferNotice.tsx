"use client";

import { Clock, XCircle } from "lucide-react";

/** The few offer fields these helpers read (the request page's offers carry more). */
export interface PastOffer {
  id: string;
  interpreterId: string;
  interpreterName?: string | null;
  status?: string;
  state?: string;
  expiresAt?: string | Date | null;
  /** When the offer last changed (sent, answered, expired). */
  updatedAt?: string | Date | null;
}

type Outcome = "expired" | "declined" | "withdrawn" | "other";

/**
 * Has this offer run out WITHOUT an answer? True when it is marked expired, or it is still marked pending but its
 * response deadline (or the appointment itself) has passed. An offer the interpreter declined is never "expired".
 */
export function isOfferExpired(offer: PastOffer, appointmentFinished: boolean, now: number): boolean {
  const state = offer.status || offer.state || "pending";
  if (state === "expired") return true;
  if (state !== "pending") return false;
  if (appointmentFinished) return true;
  const deadline = offer.expiresAt ? new Date(offer.expiresAt).getTime() : NaN;
  return !Number.isNaN(deadline) && now > deadline;
}

/** How an offer ended: timed out (expired) is kept separate from actively rejected (declined). */
export function offerOutcome(offer: PastOffer, appointmentFinished: boolean, now: number): Outcome {
  const state = offer.status || offer.state;
  if (state === "declined") return "declined";
  if (state === "withdrawn") return "withdrawn";
  return isOfferExpired(offer, appointmentFinished, now) ? "expired" : "other";
}

const timeOf = (value: string | Date | null | undefined): number => (value ? new Date(value).getTime() || 0 : 0);

/**
 * The most recent offer to each interpreter, newest first. "Most recent" is by when it last changed (falling back
 * to its deadline for older data), so a decline on a newer offer is never hidden behind an older expired one.
 */
function latestPerInterpreter(offers: PastOffer[]): PastOffer[] {
  const time = (o: PastOffer) => timeOf(o.updatedAt) || timeOf(o.expiresAt);
  const newest = new Map<string, PastOffer>();
  for (const o of offers) {
    const current = newest.get(o.interpreterId);
    if (!current || time(o) > time(current)) newest.set(o.interpreterId, o);
  }
  return Array.from(newest.values()).sort((a, b) => time(b) - time(a));
}

/** A short note for the "Choose an interpreter" list ("Offer expired", "Declined earlier"), or null. */
export function pastOfferNote(offers: PastOffer[], interpreterId: string, appointmentFinished: boolean, now: number): string | null {
  const latest = latestPerInterpreter(offers.filter((o) => o.interpreterId === interpreterId))[0];
  if (!latest) return null;
  const outcome = offerOutcome(latest, appointmentFinished, now);
  if (outcome === "expired") return "Offer expired";
  if (outcome === "declined") return "Declined earlier";
  if (outcome === "withdrawn") return "Offer withdrawn";
  return null;
}

interface ExpiredOfferNoticeProps {
  pastOffers: PastOffer[];
  appointmentFinished: boolean;
  now: number;
  /** Chooses this interpreter in the list below, ready to send a new offer. */
  onOfferAgain: (interpreterId: string) => void;
}

/**
 * Shown on a staffing slot that has no live offer. Interpreters whose last offer ended stay visible here, labelled
 * "Expired" (no answer before the deadline) or "Declined" (they said no), each with a one-click "Offer again".
 */
export function ExpiredOfferNotice({ pastOffers, appointmentFinished, now, onOfferAgain }: ExpiredOfferNoticeProps) {
  if (appointmentFinished) return null;
  const ended = latestPerInterpreter(pastOffers)
    .map((offer) => ({ offer, outcome: offerOutcome(offer, appointmentFinished, now) }))
    .filter((e) => e.outcome === "expired" || e.outcome === "declined");
  if (ended.length === 0) return null;

  const expiredCount = ended.filter((e) => e.outcome === "expired").length;
  const declinedCount = ended.length - expiredCount;
  const heading =
    declinedCount === 0
      ? expiredCount === 1 ? "An offer expired without a response" : "Offers expired without a response"
      : expiredCount === 0
        ? declinedCount === 1 ? "An interpreter declined this offer" : "Interpreters declined this offer"
        : "Earlier offers on this slot were declined or expired";

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <Clock className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <span>{heading}</span>
      </div>
      <p className="mt-1 text-xs text-amber-800">You can edit the request if the time needs to change, then offer it again.</p>
      <ul className="mt-3 space-y-2">
        {ended.map(({ offer, outcome }) => (
          <li key={offer.interpreterId} className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--ink)]">{offer.interpreterName || "Interpreter"}</span>
            {outcome === "declined" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                <XCircle className="h-3 w-3" aria-hidden="true" />
                Declined
              </span>
            ) : (
              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                Expired · no response
              </span>
            )}
            <button
              type="button"
              onClick={() => onOfferAgain(offer.interpreterId)}
              className="ml-auto rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Offer again
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
