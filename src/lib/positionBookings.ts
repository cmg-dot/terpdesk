import { readPositions } from "@/lib/positions";
import type { PositionId } from "@/lib/positions";

/**
 * What the request page shows for each interpreter position: who is booked, the offer awaiting an answer, the earlier offers, and
 * whether the position needs a replacement; plus the roster each position may be offered to (never someone already in another
 * position of the same job). Works for any number of positions. Pure: no I/O.
 *
 * `request` is the agency list's row for the job (see getRequests.mapRequestRow); `offers` is its offers, each already carrying
 * its `positionIndex`.
 */

type Loose = Record<string, any>;

export interface PositionBooking {
  id: string;
  interpreterId?: string;
  interpreterName: string;
  positionIndex?: number;
}

export interface PositionFacts {
  id: PositionId;
  /** 1-based place in the list ("Position 1", "Position 2", ...): the number staff see, whatever the stable id is. */
  ordinal: number;
  accepted: PositionBooking | null;
  activeOffer: any | null;
  pastOffers: any[];
  needsReplacement: boolean;
  /** The interpreter the job record names for this position, when it does. */
  reservedBy: string;
}

const sameName = (a?: string, b?: string): boolean => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
const isAccepted = (o: Loose): boolean => o.state === "accepted" || o.status === "accepted";

/** The booking for one position, falling back to the older per-position fields for Positions 1 and 2. */
function bookingFor(request: Loose, offers: Loose[], id: PositionId, count: number): { accepted: PositionBooking | null; reservedBy: string } {
  const data: Loose = request?.data ?? {};
  const slot = (request?.slots as Loose[] | undefined)?.find((s) => s.positionIndex === id);
  const legacyId = id === 1 ? request?.assignedInterpreterId || data.assignedInterpreterId : id === 2 ? request?.position2InterpreterId || data.position2InterpreterId : undefined;
  const reservedBy: string = slot?.reservedBy || legacyId || "";

  const offer = offers.find((o) => (o.positionIndex === id || (id === 1 && !o.positionIndex)) && isAccepted(o));
  if (offer) return { accepted: offer as PositionBooking, reservedBy };
  if (slot?.reservedBy) return { accepted: { interpreterName: slot.interpreterName || "Booked", interpreterId: slot.reservedBy, id: `assigned-${id}`, positionIndex: id }, reservedBy };
  if (id === 1 && legacyId) {
    return { accepted: { interpreterName: request.assignedInterpreterName || data.assignedInterpreterName || "Booked", interpreterId: legacyId, id: "assigned-root", positionIndex: 1 }, reservedBy };
  }
  if (id === 1 && count === 1 && (request?.status === "assigned" || request?.status === "booked") && request?.assignedInterpreterName) {
    return { accepted: { interpreterName: request.assignedInterpreterName, id: "assigned-booking", positionIndex: 1 }, reservedBy };
  }
  if (id === 2 && legacyId) {
    return { accepted: { interpreterName: request.position2InterpreterName || data.position2InterpreterName || "Booked", interpreterId: legacyId, id: "assigned-pos2", positionIndex: 2 }, reservedBy };
  }
  return { accepted: null, reservedBy };
}

export function resolvePositions(request: Loose | null | undefined, offers: Loose[], isLiveOffer: (o: Loose) => boolean): PositionFacts[] {
  if (!request) return [];
  const data: Loose = request.data ?? request;
  const { ids } = readPositions(data);
  const slotReplacements: Loose = data.slotReplacements ?? {};

  const partial = ids.map((id, index) => {
    const { accepted, reservedBy } = bookingFor(request, offers, id, ids.length);
    const here = (o: Loose) => o.positionIndex === id || (id === 1 && !o.positionIndex);
    const activeOffer = offers.find((o) => here(o) && isLiveOffer(o)) ?? null;
    const pastOffers = offers.filter((o) => here(o) && o.id !== activeOffer?.id && o.id !== accepted?.id);
    const slot = (request.slots as Loose[] | undefined)?.find((s) => s.positionIndex === id);
    return { id, ordinal: index + 1, accepted, activeOffer, pastOffers, reservedBy, flagged: Boolean(slot?.needsReplacement || slotReplacements[id]) };
  });
  const allFilled = partial.length > 0 && partial.every((p) => p.accepted);
  return partial.map(({ flagged, ...p }) => ({ ...p, needsReplacement: !allFilled && !p.accepted && flagged }));
}

/** How many of the positions have someone booked. */
export const bookedCountOf = (facts: readonly PositionFacts[]): number => facts.filter((f) => f.accepted).length;

/**
 * Is this interpreter already in a position OTHER than `position` (picked in its offer form, booked, named on the job record, or
 * holding its pending offer)? Compared by id, and by name where an older record has no id.
 */
export function occupiesAnotherPosition(
  facts: readonly PositionFacts[],
  recipients: Readonly<Record<number, string>>,
  position: PositionId,
  interpreterId: string,
  interpreterName?: string,
): boolean {
  return facts.some((f) => {
    if (f.id === position) return false;
    if (recipients[f.id] && recipients[f.id] === interpreterId) return true;
    if (f.accepted && ((f.accepted.interpreterId && f.accepted.interpreterId === interpreterId) || sameName(interpreterName, f.accepted.interpreterName))) return true;
    if (f.reservedBy && f.reservedBy === interpreterId) return true;
    const offer = f.activeOffer;
    return Boolean(offer && ((offer.interpreterId && offer.interpreterId === interpreterId) || sameName(interpreterName, offer.interpreterName)));
  });
}
