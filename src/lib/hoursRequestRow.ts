import type { MappedRequest } from "@/lib/mapRequestRow";

/**
 * A request as the hours review needs it: only what mergeHoursRecords (and the helpers it calls: readPositions, isPlainSingle,
 * legacyPosition1Hours, isStateJobRequest, closedJobKind) read, under the SAME property paths, so the merge runs on these rows exactly
 * as it ran on the full ones. What it leaves out: the rest of the `data` blob (intake form text, notes, meeting links, passcodes, the
 * requester's contact details, prep notes), the copied `details` / `onsite` / `overview` trees, and every offer that is not an accepted
 * one. Pure: safe on the server and in client components.
 */

export interface HoursRequestRow {
  id: string;
  title: string;
  /** The staffing status, as the merge reads it (a job with hours and no booking can read "awaiting_review"). */
  status: string;
  startsAt: string;
  endsAt: string;
  isStateJob: boolean;
  canceledAt: string | null;
  travelStartTime: string | null;
  travelEndTime: string | null;
  serviceCompleted: boolean | null;
  requester: { org?: string };
  details: { timeZone: string };
  /** The accepted offers only: they name who worked each position. */
  offers: { positionIndex: number; status: string; state: string; interpreterName: string | null }[];
  data: HoursRequestData;
}

/** The pieces of `data` the merge reads. Every one is optional, and absent when the job's data does not have it. */
export interface HoursRequestData {
  hoursSubmissions?: unknown;
  hoursSubmission?: unknown;
  intake?: Record<string, unknown>;
  details?: Record<string, unknown>;
  slotCount?: unknown;
  requiredPositions?: unknown;
  totalPositions?: unknown;
  positions?: unknown;
  retiredPositions?: unknown;
  offerPositions?: unknown;
  /** Only the NUMBER of position records matters (readPositions counts them when no count is stated), so their contents are not sent. */
  slots?: null[];
  void?: unknown;
  timeZone?: unknown;
}

type Loose = Record<string, unknown>;
const asRecord = (value: unknown): Loose => (value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});

/** The listed keys of `source` that are present, nothing else. */
const pick = (source: Loose, keys: readonly string[]): Loose => {
  const out: Loose = {};
  for (const key of keys) if (key in source && source[key] !== undefined) out[key] = source[key];
  return out;
};

/** The keys readPositions reads from a job's root, its `details` and its `intake`. */
const COUNT_KEYS = ["slotCount", "requiredPositions", "totalPositions", "positions"] as const;

const isAccepted = (offer: { status?: unknown; state?: unknown }): boolean => offer.status === "accepted" || offer.state === "accepted";

export function toHoursRow(mapped: MappedRequest): HoursRequestRow {
  const data = asRecord(mapped.data);
  const slots = data.slots;
  const hours: HoursRequestData = {
    ...pick(data, ["hoursSubmissions", "hoursSubmission", "retiredPositions", "offerPositions", "void", "timeZone", ...COUNT_KEYS]),
    intake: pick(asRecord(data.intake), ["program", "odhhSrn", ...COUNT_KEYS]),
    details: pick(asRecord(data.details), ["timeZone", ...COUNT_KEYS]),
  };
  if (Array.isArray(slots)) hours.slots = slots.map(() => null);
  const requester = asRecord(mapped.requester);
  return {
    id: mapped.id,
    title: mapped.title,
    status: mapped.status,
    startsAt: mapped.startsAt,
    endsAt: mapped.endsAt,
    isStateJob: Boolean(mapped.isStateJob),
    canceledAt: mapped.canceledAt,
    travelStartTime: mapped.travelStartTime,
    travelEndTime: mapped.travelEndTime,
    serviceCompleted: mapped.serviceCompleted,
    requester: typeof requester.org === "string" ? { org: requester.org } : {},
    details: { timeZone: String(mapped.details?.timeZone ?? "") },
    offers: mapped.offers
      .filter(isAccepted)
      .map((offer) => ({
        positionIndex: Number(offer.positionIndex),
        status: String(offer.status),
        state: String(offer.state),
        interpreterName: typeof offer.interpreterName === "string" ? offer.interpreterName : null,
      })),
    data: hours,
  };
}
