import type { InterpreterFitStatus } from "@/app/actions/availability";
import type { PositionId } from "@/lib/positions";
import type { TimesheetFlags } from "@/app/actions/getTimesheetStatus";
import type { DirectAssignOfferRef, DirectAssignRosterEntry, DirectAssignSuccess } from "@/components/requests/DirectAssignPanel";
import type { PastOffer } from "@/components/requests/ExpiredOfferNotice";

/**
 * What the Staffing panel needs from the request page. The page keeps the state and the server calls; the panel only draws
 * what it is given and calls back, so the booking controls live in one place without the page's other concerns.
 */

/** A position's stable number on the job (see lib/positions.ts). What staff read as "Position N" is its `ordinal`. */
export type Position = PositionId;

/** A booking in a position (an accepted offer, or the interpreter the job record says is booked). */
export interface StaffBooking {
  id: string;
  interpreterId?: string;
  interpreterName: string;
  positionIndex?: number;
}

/** The offer awaiting an answer in a position. */
export interface StaffActiveOffer extends StaffBooking {
  state?: string;
  status?: string;
  expiresAt?: string | Date | null;
}

/** One position's own state: who is booked or offered, the roster that may be offered it, and the offer form's values. */
export interface PositionView {
  posIdx: Position;
  /** 1-based place in the list: the "N" in "Position N" on screen, whatever the stable id is. */
  ordinal: number;
  /** Can this position be removed right now? An empty one can; one with a booking or a waiting offer cannot. */
  canRemove: boolean;
  /** Why it cannot (shown on the disabled button), or null. */
  removeBlockedReason: string | null;
  accepted: StaffBooking | null;
  activeOffer: StaffActiveOffer | null;
  pastOffers: PastOffer[];
  needsReplacement: boolean;
  /** The roster for this position (without whoever is already in the other position). */
  roster: DirectAssignRosterEntry[];
  /** The interpreter picked in the offer form ("" for none). */
  recipient: string;
  expiryHours: string;
  expiryMinutes: string;
  errorMessage: string;
  successMessage: string;
  isSending: boolean;
  /** An interpreter is picked in "Directly assign": the offer form is paused. */
  offerLocked: boolean;
  /** The booked interpreter's id, worked out from the job record ("" when unknown). */
  assignedInterpreterId: string;
  /** Hours have been submitted for this position (what makes the Verification PDF available on a non-state job). */
  hasHours: boolean;
}

/** Facts about the job and the page, shared by both positions. */
export interface StaffingContext {
  requestId: string;
  totalPositions: number;
  /** The most positions a job can have. */
  maxPositions: number;
  /** Adding or removing a position is under way (the id being removed, or "add"), and the last refusal, if any. */
  slotBusy: "add" | Position | null;
  slotError: string;
  /** Why a position cannot be added right now (cancelled, finished, at the cap), or null when it can. */
  addBlockedReason: string | null;
  /** Every offer on the job (for the Directly assign panel's pending-offer count). */
  offers: ReadonlyArray<DirectAssignOfferRef>;
  nowMs: number;
  isCancelled: boolean;
  isFutureAppointment: boolean;
  isAppointmentInProgress: boolean;
  isAppointmentFinished: boolean;
  /** A started or finished appointment: its booking can no longer be removed. */
  isBookingLocked: boolean;
  isStateJob: boolean;
  /** The job's start (and end) as the page resolves them, for the timesheet button. */
  startsAtIso: string;
  endsAtIso: string;
  startsAt: Date | null;
  /** The zone offers are timed in. */
  jobZone: string;
  /** The zone the appointment is shown in ("America/Los_Angeles" or the app's own label), when saved. */
  apptTimeZone: string | undefined;
  fits: Record<string, InterpreterFitStatus>;
  fitsLoading: boolean;
  fitsError: string | null;
  timesheetFlags: Record<string, TimesheetFlags>;
}

export interface StaffingActions {
  setRecipient: (posIdx: Position, id: string) => void;
  /** Sets the offer's response window; the page also marks it as hand-edited and clears the position's error. */
  setExpiry: (posIdx: Position, next: { hours: string; minutes: string }) => void;
  createOffer: (posIdx: Position) => void | Promise<void>;
  withdrawOffer: (offerId: string) => Promise<void>;
  directlyAssigned: (posIdx: Position, result: DirectAssignSuccess) => Promise<void>;
  setAssignEngaged: (posIdx: Position, engaged: boolean) => void;
  openRemoveBooking: (posIdx: Position, offerId: string | undefined, interpreterName: string | undefined) => void;
  addSlot: () => void | Promise<void>;
  removeSlot: (posIdx: Position) => void | Promise<void>;
  clearSlotError: () => void;
  openAccess: () => void;
  toast: (message: string) => void;
  reloadTimesheetFlags: (requestId: string) => void;
}
