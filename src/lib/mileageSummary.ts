import { roundMiles } from "@/lib/timesheetSchemas";

export interface MileageLegView {
  fromLabel: string;
  toLabel: string;
  miles: number;
  roundTrip: boolean;
  /** Absent on records saved before legs were counted on the server. */
  countedMiles?: number;
}

/** What a leg counts for: the server's figure, or miles (doubled for a round trip) for an older record. */
export const countedMilesOf = (leg: MileageLegView): number =>
  leg.countedMiles ?? roundMiles((leg.miles ?? 0) * (leg.roundTrip ? 2 : 1));

export type MileageRange = "30" | "90" | "all";

export const MILEAGE_RANGES: readonly { value: MileageRange; label: string }[] = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export type MileageEntryStatus = "awaiting_review" | "approved" | "correction_requested";

/** One job on the interpreter's Mileage page: what they reported and what the agency approved. */
export interface MileageEntry {
  requestId: string;
  title: string;
  /** The appointment's start (ISO); the date filter and the list order use it. */
  startsAt: string;
  timeZone: string;
  status: MileageEntryStatus;
  reportedMiles: number;
  /** Set only once the agency has approved. */
  approvedMiles: number | null;
  /** Why the agency approved a different figure; null when approved as reported. */
  adjustmentReason: string | null;
  mileageNote: string;
  legs: MileageLegView[];
}

export interface MileageTotals {
  /** Everything the interpreter reported for reimbursement. */
  reported: number;
  /** What agencies have approved so far. */
  approved: number;
  jobs: number;
  awaitingApproval: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The entries whose appointment started within the range, newest first. `nowMs` is passed in so a render is stable. */
export function entriesInRange(entries: MileageEntry[], range: MileageRange, nowMs: number): MileageEntry[] {
  const since = range === "all" ? -Infinity : nowMs - Number(range) * DAY_MS;
  return entries
    .filter((entry) => {
      const t = new Date(entry.startsAt).getTime();
      return Number.isNaN(t) ? range === "all" : t >= since;
    })
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
}

export function mileageTotals(entries: MileageEntry[]): MileageTotals {
  return {
    reported: roundMiles(entries.reduce((sum, e) => sum + e.reportedMiles, 0)),
    approved: roundMiles(entries.reduce((sum, e) => sum + (e.approvedMiles ?? 0), 0)),
    jobs: entries.length,
    awaitingApproval: entries.filter((e) => e.approvedMiles === null).length,
  };
}
