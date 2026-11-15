import type { Program } from "@/db/schema";
import type { ClientKey, InterpreterKey } from "./fixtures";
import { aroundNow, at } from "./schedule";

/**
 * The 18 demo jobs, as a story the demo can walk through, all relative to the moment the seed runs:
 *  - TODAY: one live booked job, one later today still needing coverage, and a virtual session that ended earlier today whose
 *    interpreter (demo login #2) can submit hours live.
 *  - NEXT 7 DAYS: two three-position team jobs (Position 1 booked, 2 and 3 offered or open), a virtual Teams meeting, a state (ODHH)
 *    job with a fictional SRN and an offer waiting for demo login #1, a declined job needing replacement, a weekly recurring job.
 *  - RECENTLY DONE: hours awaiting review and approved (with interpreter and on-site signatures, so the Verification PDF downloads),
 *    a team job with one position approved and one waiting, an ended job with no hours yet (send its timesheet link live), and a
 *    client cancellation.
 */

export type BookingStatus = "accepted" | "pending" | "declined";

export interface Booking {
  position: number;
  who: InterpreterKey;
  status: BookingStatus;
}

export interface HoursSpec {
  position: number;
  status: "awaiting_review" | "approved";
  /** Minutes the interpreter stayed past the scheduled end. */
  overMinutes?: number;
  note?: string;
  leg?: { from: string; miles: number; roundTrip: boolean };
}

export interface MeetingSpec {
  platform: "Zoom" | "Microsoft Teams";
  link: string;
  meetingId?: string;
  passcode?: string;
}

export interface JobSpec {
  title: string;
  client: ClientKey;
  setting: "Education" | "Medical" | "Workplace" | "Legal" | "Community";
  purpose: string;
  participant: string;
  start: Date;
  end: Date;
  positions?: number;
  program?: Program;
  srn?: string;
  meeting?: MeetingSpec;
  /** The stored request status, as the app's own actions leave it for this situation. */
  status: string;
  bookings?: Booking[];
  hours?: HoursSpec[];
  /** Defaults to on for an in-person non-state job (what the request form does), off otherwise. */
  onsiteSignatureRequired?: boolean;
  cancelled?: { reason: string; daysBefore: number };
  recurrence?: string;
  prepNotes?: string;
  needsReplacement?: boolean;
}

const ZOOM: MeetingSpec = { platform: "Zoom", link: "https://zoom.us/j/5550100123", meetingId: "555 010 0123", passcode: "evergreen" };
const TEAMS: MeetingSpec = { platform: "Microsoft Teams", link: "https://teams.microsoft.com/l/meetup-join/evergreen-demo-advisory" };

export function demoJobs(now: Date): JobSpec[] {
  const day = (days: number, from: string, to: string) => ({ start: at(now, days, from), end: at(now, days, to) });
  return [
    // Today
    { title: "Cardiology follow-up", client: "harborview", setting: "Medical", purpose: "Follow-up appointment with cardiology", participant: "M. Alvarez", start: aroundNow(now, -60), end: aroundNow(now, 60), status: "booked", bookings: [{ position: 1, who: "christy", status: "accepted" }] },
    { title: "Well-child visit", client: "olympic", setting: "Medical", purpose: "Well-child visit; parent is Deaf", participant: "K. Johnson (parent)", start: aroundNow(now, 180), end: aroundNow(now, 270), status: "draft" },
    { title: "Telehealth therapy session", client: "cascadia", setting: "Medical", purpose: "Weekly individual therapy (telehealth)", participant: "J. Nguyen", start: aroundNow(now, -210), end: aroundNow(now, -120), meeting: ZOOM, status: "booked", bookings: [{ position: 1, who: "ralph", status: "accepted" }] },

    // Next 7 days
    { title: "Biology 101 lecture and lab", client: "pscc", setting: "Education", purpose: "Lecture followed by a three-hour lab", participant: "T. Brooks (student)", ...day(1, "09:00", "12:00"), positions: 3, status: "Partially staffed", prepNotes: "Lab vocabulary list is shared in Prep materials. Team rotates every 20 minutes.", bookings: [{ position: 1, who: "sofia", status: "accepted" }, { position: 2, who: "ralph", status: "pending" }] },
    { title: "Family therapy group", client: "cascadia", setting: "Medical", purpose: "Family therapy group session (Deaf and hearing participants)", participant: "The Okoro family", ...day(3, "13:00", "16:00"), positions: 3, status: "Partially staffed", prepNotes: "CDI requested. Arrive 15 minutes early to meet the clinician.", bookings: [{ position: 1, who: "daniel", status: "accepted" }, { position: 2, who: "hannah", status: "pending" }, { position: 3, who: "christy", status: "pending" }] },
    { title: "Accessibility Advisory Committee", client: "soundTransit", setting: "Workplace", purpose: "Quarterly advisory committee meeting", participant: "Committee members (2 Deaf)", ...day(2, "10:00", "11:30"), meeting: TEAMS, status: "booked", bookings: [{ position: 1, who: "grace", status: "accepted" }] },
    { title: "Primary care visit", client: "harborview", setting: "Medical", purpose: "Primary care visit", participant: "R. Castillo", ...day(2, "14:00", "15:30"), program: "WA ODHH", srn: "DEMO-48213", status: "Offer awaiting response", bookings: [{ position: 1, who: "christy", status: "pending" }] },
    { title: "Hearing screening follow-up", client: "olympic", setting: "Medical", purpose: "Pediatric hearing screening follow-up", participant: "A. Patel (parent)", ...day(4, "09:30", "10:30"), status: "booked", bookings: [{ position: 1, who: "ralph", status: "accepted" }] },
    { title: "Pre-surgery consultation", client: "harborview", setting: "Medical", purpose: "Pre-surgery consultation with anesthesiology", participant: "S. Kim", ...day(5, "08:00", "10:00"), status: "draft" },
    { title: "New student orientation", client: "pscc", setting: "Education", purpose: "Evening orientation for new students", participant: "Incoming students (3 Deaf)", ...day(6, "18:00", "20:00"), status: "booked", bookings: [{ position: 1, who: "marcus", status: "accepted" }] },
    { title: "Paratransit eligibility appeal", client: "soundTransit", setting: "Legal", purpose: "ADA paratransit eligibility appeal hearing", participant: "D. Hughes", ...day(3, "09:00", "11:00"), status: "Needs replacement", needsReplacement: true, bookings: [{ position: 1, who: "hannah", status: "declined" }] },
    { title: "Dialysis treatment", client: "harborview", setting: "Medical", purpose: "Weekly dialysis treatment", participant: "E. Morgan", ...day(7, "07:30", "11:30"), status: "booked", recurrence: "Every week on the same day", bookings: [{ position: 1, who: "liam", status: "accepted" }] },

    // Recently done
    { title: "Physical therapy evaluation", client: "harborview", setting: "Medical", purpose: "Physical therapy evaluation", participant: "B. Thompson", ...day(-1, "10:00", "11:30"), status: "awaiting_review", bookings: [{ position: 1, who: "christy", status: "accepted" }], hours: [{ position: 1, status: "awaiting_review", overMinutes: 15, note: "Evaluation ran 15 minutes over; the therapist added a home-exercise review.", leg: { from: "Home (Seattle)", miles: 11.2, roundTrip: true } }] },
    { title: "Immunization visit", client: "olympic", setting: "Medical", purpose: "Immunization visit", participant: "L. Rivera (parent)", ...day(-2, "13:00", "14:00"), status: "approved", bookings: [{ position: 1, who: "ralph", status: "accepted" }], hours: [{ position: 1, status: "approved", leg: { from: "Home (Tacoma)", miles: 8.4, roundTrip: true } }] },
    { title: "Midterm review session", client: "pscc", setting: "Education", purpose: "Midterm review session", participant: "T. Brooks (student)", ...day(-2, "09:00", "12:00"), positions: 2, status: "awaiting_review", bookings: [{ position: 1, who: "sofia", status: "accepted" }, { position: 2, who: "marcus", status: "accepted" }], hours: [{ position: 1, status: "approved", leg: { from: "Home (Seattle)", miles: 6, roundTrip: true } }, { position: 2, status: "awaiting_review", leg: { from: "Home (Everett)", miles: 18.5, roundTrip: false } }] },
    { title: "Medication management telehealth", client: "cascadia", setting: "Medical", purpose: "Medication management (telehealth)", participant: "J. Nguyen", ...day(-3, "15:00", "16:00"), meeting: ZOOM, status: "approved", bookings: [{ position: 1, who: "grace", status: "accepted" }], hours: [{ position: 1, status: "approved" }] },
    { title: "Customer accessibility listening session", client: "soundTransit", setting: "Community", purpose: "Community listening session on station accessibility", participant: "Community members", ...day(-1, "14:00", "16:00"), status: "booked", bookings: [{ position: 1, who: "christy", status: "accepted" }] },
    { title: "Allergy consultation", client: "olympic", setting: "Medical", purpose: "Allergy consultation", participant: "M. Ochoa (parent)", ...day(-2, "11:00", "12:00"), status: "Cancelled", cancelled: { reason: "Family rescheduled to next month", daysBefore: 3 }, bookings: [{ position: 1, who: "marcus", status: "accepted" }] },
  ];
}
