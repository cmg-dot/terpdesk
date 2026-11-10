import { positionOfOffer, readPositions } from "@/lib/positions";
import type { PositionId } from "@/lib/positions";

/**
 * How a job's staffing is worked out, for any number of positions. Every booking path (accepting an offer, direct assignment,
 * the email link, withdrawing, declining, the list the agency sees) used to carry its own two-position copy of this; they now
 * share these functions, so the rules cannot drift apart.
 *
 * The stored status strings are unchanged: "Unfilled / draft", "Offer awaiting response", "Partially staffed",
 * "Needs replacement", "booked" ("Fully staffed" is what the list shows for a booked job). Precedence is unchanged too.
 *
 * Pure: no I/O. Safe for server and client.
 */

type Loose = Record<string, unknown>;
const asRecord = (value: unknown): Loose => (value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});

export const STATUS_UNFILLED = "Unfilled / draft";
export const STATUS_AWAITING = "Offer awaiting response";
export const STATUS_PARTIAL = "Partially staffed";
export const STATUS_REPLACEMENT = "Needs replacement";
export const STATUS_BOOKED = "booked";

/** The parts of an offer these rules look at. */
export interface OfferFact {
  id: string;
  interpreterId: string;
  status: string;
  expiresAt?: Date | string | null;
}

export interface StaffingFacts {
  /** The job's active positions. */
  ids: readonly PositionId[];
  /** Active positions with someone booked. */
  booked: ReadonlySet<PositionId>;
  /** Active positions with an offer still waiting for an answer. */
  livePending: ReadonlySet<PositionId>;
  /** `slotReplacements` as saved: position id -> "this position needs a replacement". */
  replacement: Readonly<Record<string, boolean>>;
}

export interface FactOptions {
  now: Date;
  /** Leave this offer out (the one being changed right now). */
  excludeOfferId?: string;
  /** Leave this interpreter's offers out. */
  excludeInterpreterId?: string;
  /** Also count a slot record that names someone as booked. */
  includeSlots?: boolean;
}

const replacementFlags = (data: Loose): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(asRecord(data.slotReplacements))) out[key] = Boolean(value);
  return out;
};

/** Who is booked, who has an offer out and which positions are flagged, for one job, from its data and offers. */
export function staffingFacts(data: unknown, offers: readonly OfferFact[], options: FactOptions): StaffingFacts {
  const root = asRecord(data);
  const { ids } = readPositions(root);
  const active = new Set(ids);
  const offerPositions = root.offerPositions;
  const booked = new Set<PositionId>();
  const livePending = new Set<PositionId>();

  for (const offer of offers) {
    if (offer.id === options.excludeOfferId) continue;
    if (options.excludeInterpreterId !== undefined && offer.interpreterId === options.excludeInterpreterId) continue;
    const position = positionOfOffer(offerPositions, offer.id);
    if (!active.has(position)) continue;
    if (offer.status === "accepted") booked.add(position);
    else if (offer.status === "pending" && offer.expiresAt && new Date(offer.expiresAt) > options.now) livePending.add(position);
  }
  if (options.includeSlots && Array.isArray(root.slots)) {
    for (const slot of root.slots) {
      const record = asRecord(slot);
      if (record.reservedBy && typeof record.positionIndex === "number" && active.has(record.positionIndex)) booked.add(record.positionIndex);
    }
  }
  return { ids, booked, livePending, replacement: replacementFlags(root) };
}

const anyFlagged = (facts: StaffingFacts): boolean => facts.ids.some((id) => facts.replacement[String(id)]);

/**
 * The status once `position` has just been filled: "booked" when nothing is left open, otherwise "Needs replacement" if one of
 * the open positions is flagged as needing one, else "Partially staffed".
 */
export function statusAfterBooking(facts: StaffingFacts, position: PositionId): string {
  const open = facts.ids.filter((id) => id !== position && !facts.booked.has(id));
  if (open.length === 0) return STATUS_BOOKED;
  return open.some((id) => facts.replacement[String(id)]) ? STATUS_REPLACEMENT : STATUS_PARTIAL;
}

/** The status after an offer is withdrawn (the withdrawn offer is already left out of `facts`). */
export function statusAfterWithdraw(facts: StaffingFacts): string {
  if (facts.booked.size >= facts.ids.length) return STATUS_BOOKED;
  if (anyFlagged(facts)) return STATUS_REPLACEMENT;
  if (facts.booked.size > 0) return STATUS_PARTIAL;
  if (facts.livePending.size > 0) return STATUS_AWAITING;
  return STATUS_UNFILLED;
}

/**
 * The status after an interpreter declines the offer for `position` (their offers are already left out of `facts`). A position
 * with no other live offer still needs coverage, so it is flagged "Needs replacement" instead of being left a draft.
 */
export function statusAfterDecline(facts: StaffingFacts, position: PositionId): string {
  if (facts.booked.size >= facts.ids.length) return STATUS_BOOKED;
  if (!facts.livePending.has(position)) return STATUS_REPLACEMENT;
  if (anyFlagged(facts)) return STATUS_REPLACEMENT;
  if (facts.booked.size > 0) return STATUS_PARTIAL;
  if (facts.livePending.size > 0) return STATUS_AWAITING;
  return STATUS_REPLACEMENT;
}

/** One position's record in `data.slots`. */
export interface SlotRecord {
  id?: string;
  positionIndex?: number;
  active?: boolean;
  reservedBy?: string | null;
  interpreterName?: string;
  needsReplacement?: boolean;
  followUp?: boolean;
  [key: string]: unknown;
}

export interface SlotBooking {
  position: PositionId;
  offerId: string;
  interpreterId: string;
  interpreterName: string;
}

/**
 * `data.slots` for every active position, in position order. The booked position (when given) is filled with that interpreter;
 * every other position keeps whatever it already held. A record is found by its position number (older records without one are
 * matched by their place in the list), so positions never swap places however many there are.
 */
export function rebuildSlots(args: { ids: readonly PositionId[]; existing: unknown; replacements: Readonly<Record<string, boolean>>; booking?: SlotBooking }): SlotRecord[] {
  const list = Array.isArray(args.existing) ? args.existing.filter((slot): slot is SlotRecord => Boolean(slot) && typeof slot === "object") : [];
  return args.ids.map((position, index): SlotRecord => {
    const current = list.find((slot) => slot.positionIndex === position) ?? list.find((slot, at) => slot.positionIndex == null && at === index);
    if (args.booking?.position === position) {
      return { ...current, id: args.booking.offerId, positionIndex: position, active: true, reservedBy: args.booking.interpreterId, interpreterName: args.booking.interpreterName, needsReplacement: false, followUp: false };
    }
    return { followUp: false, ...current, id: current?.id ?? `slot-${position}`, positionIndex: position, active: true, reservedBy: current?.reservedBy ?? null, needsReplacement: Boolean(args.replacements[String(position)]) };
  });
}

/**
 * The older per-position name fields. Position 1 and Position 2 have always had their own; later positions keep their booking in
 * the slot record and the offer only, so these helpers return nothing for them.
 */
export function assignmentFields(position: PositionId, interpreterId: string, interpreterName: string): Loose {
  if (position === 1) return { assignedInterpreterId: interpreterId, assignedInterpreterName: interpreterName };
  if (position === 2) return { position2InterpreterId: interpreterId, position2InterpreterName: interpreterName };
  return {};
}

export function clearedAssignmentFields(position: PositionId): Loose {
  if (position === 1) return { assignedInterpreterId: null, assignedInterpreterName: null };
  if (position === 2) return { position2InterpreterId: null, position2InterpreterName: null };
  return {};
}

/** Does the older per-position name or id field say someone is booked in `position`? (Only Positions 1 and 2 have such fields.) */
export function hasLegacyAssignmentAt(data: unknown, position: PositionId): boolean {
  const root = asRecord(data);
  if (position === 1) return Boolean(root.assignedInterpreterId || root.assignedInterpreterName);
  if (position === 2) return Boolean(root.position2InterpreterId || root.position2InterpreterName);
  return false;
}

/** Who the older per-position field names as booked in `position` (nothing for positions that have no such field). */
export function assignedInterpreterIdAt(data: unknown, position: PositionId): string | undefined {
  const root = asRecord(data);
  const value = position === 1 ? root.assignedInterpreterId : position === 2 ? root.position2InterpreterId : undefined;
  return typeof value === "string" && value !== "" ? value : undefined;
}
