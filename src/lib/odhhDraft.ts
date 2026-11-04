import type { RequestData } from "@/db/schema";
import { FORMAT_LABELS, ODHH_PROGRAM, ODHH_TIME_ZONE_LABEL, type ParsedIntakeEmail } from "@/lib/odhhEmailParser";
import { contactMethodText, type FormExtras } from "@/lib/odhhFormFields";

/**
 * What a state request email says, as the app's request data. Used twice: to make the draft request when the email is
 * new, and as the "form's view" that fills the blanks of an existing job when an email arrives for its SRN again
 * (see odhhEnrich.ts). Pure: no I/O.
 */

/** Only the appointment note goes into the interpreter-visible preparation notes (the parser already caps it). */
const MAX_PREP_NOTES_LENGTH = 1000;

export interface DraftInput {
  parsed: ParsedIntakeEmail;
  extras: FormExtras;
  srn: string | null;
  /** The forwarding address: the requester's contact only when the email names no requestor at all. */
  fromEmail: string;
  subject: string;
  rawContent: string;
  contentHash: string;
  receivedAt: string;
  warnings: string[];
  startsAt: Date;
  endsAt: Date;
}

export const draftTitle = ({ srn, parsed, subject, fromEmail }: Pick<DraftInput, "srn" | "parsed" | "subject" | "fromEmail">): string =>
  srn ? `ODHH SRN #${srn}${parsed.venue ? ` — ${parsed.venue}` : ""}` : subject.trim().slice(0, 200) || `Inbound email from ${fromEmail}`;

export function buildDraftData(input: DraftInput): RequestData {
  const { parsed, extras, srn, fromEmail, subject, rawContent, contentHash, receivedAt, warnings, startsAt, endsAt } = input;
  const hasRequestor = Boolean(parsed.requestorName || parsed.requestorPhone || parsed.requestorEmail);
  // A "Comment:" line inside the client/employee section stays in that (private) block and is not copied into the
  // interpreter-visible preparation notes.
  const noteAlreadyInBlock = Boolean(parsed.appointmentNote && parsed.clientInfoBlock?.includes(parsed.appointmentNote));
  const prepNotes = noteAlreadyInBlock ? "" : (parsed.appointmentNote ?? "").slice(0, MAX_PREP_NOTES_LENGTH);
  const contactMethod = contactMethodText(extras);

  return {
    brief: {},
    intake: { program: ODHH_PROGRAM, ...(srn ? { odhhSrn: srn } : {}) },
    details: {
      timeZone: ODHH_TIME_ZONE_LABEL,
      ...(parsed.format ? { format: FORMAT_LABELS[parsed.format], formatCode: parsed.format } : {}),
      ...(parsed.clientName ? { deafParticipant: parsed.clientName } : {}),
      ...(parsed.purpose ? { purpose: parsed.purpose } : {}),
      ...(extras.setting ? { setting: extras.setting } : {}),
      ...(parsed.platform ? { platform: parsed.platform } : {}),
      ...(parsed.meetingLink ? { meetingLink: parsed.meetingLink, virtualLink: parsed.meetingLink } : {}),
    },
    // The ODHH "Appointment Note" lands in the agency's Preparation notes field, so staff review it before booking.
    // Preparation notes are shared with booked interpreters, so they hold ONLY the appointment note from the email.
    ...(prepNotes ? { prepNotes } : {}),
    // The whole CLIENT/EMPLOYEE INFORMATION section (gender, hearing identity, comments, ...) is sensitive: it goes
    // to "Agency-private notes" (requests.data.privateNotes), which interpreters never receive.
    ...(parsed.clientInfoBlock ? { privateNotes: parsed.clientInfoBlock } : {}),
    onsite: {
      venue: parsed.venue ?? "",
      address: parsed.address ?? "",
      ...(extras.building ? { building: extras.building } : {}),
      ...(extras.floor ? { floor: extras.floor } : {}),
      ...(extras.room ? { room: extras.room } : {}),
      ...(extras.contactName ? { contact: extras.contactName } : {}),
      ...(contactMethod ? { contactMethod } : {}),
    },
    overview: { location: parsed.venue ?? parsed.address ?? "TBD", status: "Unfilled / draft" },
    // One-time requester for this job: the ODHH requestor from the email. `oneTime` stops the edit page from swapping in
    // a saved client's default contact (it matches saved clients by organisation name). The organization is the form's
    // "Billing Organization Name" (DVR, Seattle Children's, ...), and "WA ODHH" only when the form names none.
    requester: {
      org: extras.billingOrganization ?? "WA ODHH",
      oneTime: true,
      ...(extras.billingOrganization ? { billOrg: extras.billingOrganization } : {}),
      ...(extras.billingContactName ? { billContact: extras.billingContactName } : {}),
      ...(extras.billingContactEmail ? { billEmail: extras.billingContactEmail } : {}),
      ...(extras.billingContactPhone ? { billPhone: extras.billingContactPhone } : {}),
      ...(hasRequestor
        ? {
            ...(parsed.requestorName ? { name: parsed.requestorName } : {}),
            ...(parsed.requestorPhone ? { phone: parsed.requestorPhone } : {}),
            ...(parsed.requestorEmail ? { email: parsed.requestorEmail } : {}),
          }
        : { email: fromEmail }),
    },
    schedule: {
      date: parsed.date,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    },
    source: {
      channel: "aws_lambda_email",
      fromEmail,
      subject,
      rawContent,
      // Fingerprint of the email text (not the text): lets a repeat of an email with no readable SRN be recognised.
      contentHash,
      receivedAt,
      parseWarnings: warnings,
    },
  };
}
