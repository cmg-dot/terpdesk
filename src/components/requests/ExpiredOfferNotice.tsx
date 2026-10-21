"use client";

import { Clock } from "lucide-react";

/** The few offer fields these helpers read (the request page's offers carry more). */
export interface PastOffer {
  id: string;
  interpreterId: string;
  interpreterName?: string | null;
  status?: string;
  state?: string;
  expiresAt?: string | Date | null;
}

/**
 * Has this offer run out without an answer? True when it is marked expired, or it is still marked pending but its
 * response deadline (or the appointment itself) has passed, as it is between the deadline and the next refresh.
 */
export function isOfferExpired(offer: PastOffer, appointmentFinished: boolean, now: number): boolean {
  const state = offer.status || offer.state || "pending";
  if (state === "expired") return true;
  if (state !== "pending") return false;
  if (appointmentFinished) return true;
  const deadline = offer.expiresAt ? new Date(offer.expiresAt).getTime() : NaN;
  return !Number.isNaN(deadline) && now > deadline;
}

/** The most recent past offer to each interpreter, newest first (by response deadline). */
function latestPerInterpreter(offers: PastOffer[]): PastOffer[] {
  const time = (o: PastOffer) => (o.expiresAt ? new Date(o.expiresAt).getTime() || 0 : 0);
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
  if (isOfferExpired(latest, appointmentFinished, now)) return "Offer expired";
  const state = latest.status || latest.state;
  if (state === "declined") return "Declined earlier";
  if (state === "withdrawn") return "Offer withdrawn";
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
 * Shown on a staffing slot that has no live offer. Interpreters whose offer ran out of time stay visible here as
 * "Expired" (instead of vanishing into the history), each with a one-click "Offer again".
 */
export function ExpiredOfferNotice({ pastOffers, appointmentFinished, now, onOfferAgain }: ExpiredOfferNoticeProps) {
  const expired = latestPerInterpreter(pastOffers).filter((o) => isOfferExpired(o, appointmentFinished, now));
  if (expired.length === 0 || appointmentFinished) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <Clock className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <span>{expired.length === 1 ? "An offer expired without a response" : "Some offers expired without a response"}</span>
      </div>
      <p className="mt-1 text-xs text-amber-800">
        You can edit the request if the time needs to change, then offer it again.
      </p>
      <ul className="mt-3 space-y-2">
        {expired.map((o) => (
          <li key={o.interpreterId} className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--ink)]">{o.interpreterName || "Interpreter"}</span>
            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Expired</span>
            <button
              type="button"
              onClick={() => onOfferAgain(o.interpreterId)}
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
