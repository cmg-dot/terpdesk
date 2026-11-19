import { liftMeetingFromNote } from "@/lib/odhhLocationParse";
import type { LiftedMeeting } from "@/lib/odhhLocationParse";
import { normalizeEmailText } from "@/lib/odhhEmailText";

/**
 * The join link of a VIRTUAL job whose meeting line holds none. The state's form often carries it elsewhere: pasted into the
 * Direction & Parking note, written in the Appointment Note, or on a line of its own under a label (the link alone on the line). Each
 * place is tried in that order. Pure.
 *
 * Outside the parking note (which belongs to the meeting when the job is virtual) only a known meeting host's link is taken (Zoom,
 * Teams, Webex, Google Meet, Doxy.me, GoTo): a note's other links (a clinic's map, a form to fill) are not the meeting.
 */

const MEETING_HOST = /https?:\/\/[^\s<>"']*(?:zoom\.us|zoomgov\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|meet\.google\.com|doxy\.me|gotomeet(?:ing)?\.com|goto\.com)[^\s<>"']*/i;
const LINK_ONLY_LINE = /^[ \t]*(?:<)?(https?:\/\/\S+?)(?:>)?[ \t]*$/;

export interface MeetingLift {
  lifted: LiftedMeeting;
  /** Where it was found. Only the parking note is rewritten (its link moves to the meeting fields); the other places keep their text. */
  from: "parking" | "note" | "line";
}

export function liftVirtualMeeting(input: { parking: string | null; appointmentNote: string | null; rawContent: string }): MeetingLift | null {
  const parking = liftMeetingFromNote(input.parking);
  if (parking) return { lifted: parking, from: "parking" };
  const noteLink = liftMeetingFromNote(input.appointmentNote?.match(MEETING_HOST)?.[0] ?? null);
  if (noteLink) {
    // The id and passcode are read from the whole note; the note itself stays as written (it is the interpreter's guidance).
    const whole = liftMeetingFromNote(input.appointmentNote);
    return { lifted: { ...noteLink, meetingId: whole?.meetingId ?? null, passcode: whole?.passcode ?? null, rest: null }, from: "note" };
  }
  for (const line of normalizeEmailText(input.rawContent).split("\n")) {
    const url = LINK_ONLY_LINE.exec(line)?.[1];
    if (url && MEETING_HOST.test(url)) {
      const lifted = liftMeetingFromNote(url);
      if (lifted) return { lifted, from: "line" };
    }
  }
  return null;
}
