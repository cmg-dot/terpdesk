/** What the Interpreter View's server action returns. Pure types: safe to import from client components. */

export interface TimelineInterpreter {
  id: string;
  name: string;
  /** False for archived roster people (kept visible so past work is still shown, but not available for dispatch). */
  active: boolean;
  /** False for someone with a booking that day who is no longer on the agency's approved roster. */
  onRoster: boolean;
  /** True when this interpreter lets the agency see their busy time. Without it, "free" can't be told from "busy". */
  sharesAvailability: boolean;
}

/**
 * A stretch of time an interpreter has marked busy and shares with the agency. Deliberately has NO label: the interpreter's
 * private title never leaves the server.
 */
export interface TimelineBusy {
  interpreterId: string;
  /** Strict UTC ISO timestamps. */
  startsAt: string;
  endsAt: string;
}

export interface TimelineJob {
  /** The accepted offer that books this interpreter on the job (the job's "assignment"). */
  offerId: string;
  requestId: string;
  interpreterId: string;
  title: string;
  status: string;
  /** Strict UTC ISO timestamps. */
  startsAt: string;
  endsAt: string;
  location: string | null;
  /** Which of the job's positions (1 or 2) this interpreter holds. */
  position: 1 | 2;
  /** True when the job has two independent positions. */
  team: boolean;
}

export interface InterpreterDayView {
  /** yyyy-MM-dd, the day in `zone`. */
  date: string;
  zone: string;
  interpreters: TimelineInterpreter[];
  jobs: TimelineJob[];
  /** Busy time touching the day, only for interpreters who share availability with the agency; overlaps already merged. */
  busy: TimelineBusy[];
}

export type InterpreterDayViewResult = { success: true; view: InterpreterDayView } | { success: false; error: string };
