/**
 * How many interpreter positions ("slots") a job has, and which ones. The ONE place that reads and writes that.
 *
 * A job used to record "one interpreter" or "team (two)" in several places at once (slotCount, details.slotCount, requiredPositions,
 * the positions label, ...) and every caller re-implemented the test. This module reads all of them, and writes them together.
 *
 * Positions are identified by a stable number that is never reused. `retiredPositions` lists numbers taken out of service (an
 * empty slot the agency removed): offers, hours and timesheets keep pointing at the number they were made for, so history stays
 * attached to the right position. `count` is the number of ACTIVE positions; the ids are 1, 2, 3, ... skipping retired ones.
 *
 * Pure: no I/O, no database. Safe for server and client.
 */

export const MIN_POSITIONS = 1;
export const MAX_POSITIONS = 10;

/** The stable number of one position on a job (1-based). */
export type PositionId = number;

export interface Positions {
  /** Active positions on the job, always between MIN_POSITIONS and MAX_POSITIONS. */
  count: number;
  /** The id of each active position, ascending (so the screen shows them as Position 1, 2, ... in this order). */
  ids: PositionId[];
  /** Ids taken out of service, ascending. Never given out again. */
  retired: PositionId[];
  /** The id the next added position will get: above every id ever used on this job. */
  nextId: PositionId;
}

const WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"] as const;
const SINGLE_LABEL = "One interpreter";
const MAX_RETIRED = 100;

type Loose = Record<string, unknown>;
const asRecord = (value: unknown): Loose => (value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});

/** A stored number of positions: a whole number from 1 up. Bigger than the cap is held at the cap; anything else is "not stated". */
const countFromNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= MIN_POSITIONS ? Math.min(value, MAX_POSITIONS) : null;

/** "One interpreter" -> 1, "Team — two independent positions" -> 2, "Team — 3 independent positions" -> 3; anything else -> null. */
export function countFromLabel(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.toLowerCase() === SINGLE_LABEL.toLowerCase()) return 1;
  const match = /^team\s*[—–-]\s*(\S+)\s+independent\s+positions?$/i.exec(text);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const index = (WORDS as readonly string[]).indexOf(word);
  const n = index >= 0 ? index + 1 : /^\d+$/.test(word) ? Number(word) : NaN;
  return Number.isInteger(n) && n >= 2 ? Math.min(n, MAX_POSITIONS) : null;
}

/** The label the forms and lists show for a position count. 1 and 2 keep the exact text they always had. */
export const positionsLabel = (count: number): string => {
  const n = clampPositionCount(count);
  return n === 1 ? SINGLE_LABEL : `Team — ${WORDS[n - 1]} independent positions`;
};

/** Holds a position count to the allowed range; anything that is not a number becomes the minimum. */
export const clampPositionCount = (count: unknown): number => {
  const n = typeof count === "number" && Number.isFinite(count) ? Math.trunc(count) : MIN_POSITIONS;
  return Math.min(MAX_POSITIONS, Math.max(MIN_POSITIONS, n));
};

const retiredFrom = (data: Loose): PositionId[] => {
  const raw = data.retiredPositions;
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1);
  return Array.from(new Set(ids)).sort((a, b) => a - b).slice(0, MAX_RETIRED);
};

/**
 * Evidence for a job that never stated a count: the biggest position an offer was made for, and how many slot records exist.
 * Used only when no count or label is stored anywhere.
 */
const countFromEvidence = (data: Loose): number => {
  let seen = MIN_POSITIONS;
  const offerPositions = asRecord(data.offerPositions);
  for (const value of Object.values(offerPositions)) seen = Math.max(seen, countFromNumber(value) ?? MIN_POSITIONS);
  if (Array.isArray(data.slots)) seen = Math.max(seen, Math.min(data.slots.length, MAX_POSITIONS));
  return seen;
};

/**
 * The positions of a job, from whatever the data holds. Every place a count has ever been kept is read, on the job itself, in
 * its `details`, and in its `intake`: the biggest stated count wins (so a team job is a team job however it was saved).
 */
export function readPositions(data: unknown): Positions {
  const root = asRecord(data);
  const containers = [root, asRecord(root.details), asRecord(root.intake)];

  let count: number | null = null;
  for (const place of containers) {
    for (const stated of [countFromNumber(place.slotCount), countFromNumber(place.requiredPositions), countFromNumber(place.totalPositions), countFromLabel(place.positions)]) {
      if (stated !== null) count = Math.max(count ?? MIN_POSITIONS, stated);
    }
  }
  const active = clampPositionCount(count ?? countFromEvidence(root));

  const retired = retiredFrom(root);
  const ids: PositionId[] = [];
  for (let id = 1; ids.length < active; id += 1) if (!retired.includes(id)) ids.push(id);
  const nextId = Math.max(ids[ids.length - 1] ?? 0, retired[retired.length - 1] ?? 0) + 1;
  return { count: active, ids, retired, nextId };
}

/** How many active positions the job has. */
export const positionCount = (data: unknown): number => readPositions(data).count;

/** More than one position. */
export const hasSeveralPositions = (data: unknown): boolean => readPositions(data).count > 1;

/**
 * True for the plain, original shape: exactly one position, number 1. Anything else (several positions, or a single one that is
 * not number 1 because the empty Position 1 was removed) keeps each position's own offers, hours and names, which is the path
 * "team" jobs always used, so it is the safe one for those jobs. The old "is this a team job" tests mean `!isPlainSingle`.
 */
export const isPlainSingle = (data: unknown): boolean => {
  const { count, ids } = readPositions(data);
  return count === 1 && ids[0] === 1;
};

/** The highest id a position can have: the cap on active positions plus every id that may have been retired along the way. */
export const MAX_POSITION_ID = MAX_POSITIONS + MAX_RETIRED;

/** A stored position id: a whole number from 1 up to MAX_POSITION_ID. Anything else (missing, text, 0, 2.5) means Position 1. */
export const positionIdOf = (value: unknown): PositionId =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_POSITION_ID ? value : 1;

/** The position an offer was made for, from the job's `offerPositions` map (Position 1 when it is not listed). */
export const positionOfOffer = (offerPositions: unknown, offerId: string): PositionId => positionIdOf(asRecord(offerPositions)[offerId]);

/** Is `id` one of the job's active positions? */
export const isActivePosition = (data: unknown, id: unknown): id is PositionId =>
  typeof id === "number" && readPositions(data).ids.includes(id);

const isPlainObject = (value: unknown): value is Loose => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export type AddPositionResult<T> = { ok: true; data: T; id: PositionId } | { ok: false; reason: "at_max" };
export type RetirePositionResult<T> = { ok: true; data: T } | { ok: false; reason: "not_active" | "last_position" | "too_many_retired" };

/**
 * `data` with one more active position, numbered above every id the job has ever used (a retired id is never given out again).
 * Pure: the caller decides whether the job may take another (state, locking, audit). Refused at MAX_POSITIONS.
 */
export function addPosition<T extends Loose>(data: T): AddPositionResult<T> {
  const current = readPositions(data);
  if (current.count >= MAX_POSITIONS) return { ok: false, reason: "at_max" };
  const id = current.nextId;
  const next = withPositionCount(data, current.count + 1, current.retired) as Loose;
  if (Array.isArray(next.slots)) {
    next.slots = [...next.slots, { id: `slot-${id}`, positionIndex: id, active: true, reservedBy: null, needsReplacement: false, followUp: false }];
  }
  return { ok: true, data: next as T, id };
}

/**
 * `data` with position `id` taken out of service: the count drops by one and the id joins `retiredPositions`, so offers, hours and
 * timesheets that point at the other positions keep pointing at them. Pure: the caller must first make sure nobody is booked in
 * it and no offer is waiting on it. The last remaining position can never be removed.
 */
export function retirePosition<T extends Loose>(data: T, id: PositionId): RetirePositionResult<T> {
  const current = readPositions(data);
  if (!current.ids.includes(id)) return { ok: false, reason: "not_active" };
  if (current.count <= MIN_POSITIONS) return { ok: false, reason: "last_position" };
  const retired = [...current.retired, id].sort((a, b) => a - b);
  if (retired.length > MAX_RETIRED) return { ok: false, reason: "too_many_retired" };
  const next = withPositionCount(data, current.count - 1, retired) as Loose;
  if (Array.isArray(next.slots)) next.slots = next.slots.filter((slot) => !(isPlainObject(slot) && slot.positionIndex === id));
  if (isPlainObject(next.slotReplacements)) {
    const { [String(id)]: _removed, ...rest } = next.slotReplacements;
    next.slotReplacements = rest;
  }
  return { ok: true, data: next as T };
}

/** The three fields every saved request carries for its position count, kept in step. */
export const positionFields = (count: number): { positions: string; requiredPositions: number; slotCount: number } => {
  const n = clampPositionCount(count);
  return { positions: positionsLabel(n), requiredPositions: n, slotCount: n };
};

/**
 * `data` with its position count set everywhere it is stored (the job, its details, and its intake where that exists), so no
 * reader can see an old number. `retired` replaces the retired list when given. Returns a new object; `data` is not changed.
 */
export function withPositionCount<T extends Loose>(data: T, count: number, retired?: readonly PositionId[]): T {
  const fields = positionFields(count);
  const root = asRecord(data);
  const next: Loose = { ...root, ...fields, details: { ...asRecord(root.details), ...fields } };
  if (root.intake !== undefined) next.intake = { ...asRecord(root.intake), ...fields };
  if ("totalPositions" in root) next.totalPositions = fields.slotCount;
  if (retired !== undefined) {
    if (retired.length > 0) next.retiredPositions = [...retired];
    else delete next.retiredPositions;
  }
  return next as T;
}
