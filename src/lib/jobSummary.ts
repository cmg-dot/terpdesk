import { formatInTimeZone } from "date-fns-tz";
import { formatHoursMinutes } from "@/lib/durationFormat";
import { hasPhysicalPlace } from "@/lib/jobPlace";
import { formatReference } from "@/utils/statusEngine";
import { getIanaZone, resolveRequestTimes } from "@/utils/timezone";

/**
 * Progressive disclosure for job emails.
 *
 * `summarizeJob` returns ONLY what an interpreter may see before accepting (and what goes in any email): reference,
 * title, date/time, format, generic setting, role and broad program type (e.g. "WA ODHH"). No address, client, notes
 * or materials.
 * `jobDetailsFor` returns the full picture; it is only rendered on the secure details page after acceptance, never
 * put in an email (security.md: no PHI in outbound email).
 */

type LooseData = Record<string, any>;

export interface JobRequestRow {
  id: string;
  title: string | null;
  createdAt: Date | string | null;
  data: unknown;
}

export interface JobSummary {
  reference: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  /** "1 hr 30 min", or "Time to be confirmed" when the times are unknown. */
  durationLabel: string;
  format: string;
  isVirtual: boolean;
  setting: string;
  role: string;
  /** Broad program type only: "WA ODHH", "WA Apple Health" or "Agency (general)". Never the client. */
  program: string;
  /** IANA zone the times above are shown in (not rendered in emails). */
  timeZone: string;
}

export interface JobDetails extends JobSummary {
  prepNotes: string;
  /** The client's name. Only on this secure page for a booked interpreter (summarizeJob, which feeds every email, never has it). */
  clientName: string;
  /** The state form's "Public" and "Mixed Group" answers (null when it did not say). Part of the job brief, not a person's details. */
  groupFlags: { isPublic: boolean | null; isMixedGroup: boolean | null };
  /** The physical place: always for an in-person job, and for a virtual job too when it has an address, room or parking note. */
  location: { venue: string; address: string; building: string; floor: string; room: string; entrance: string; parking: string; contact: string; contactMethod: string } | null;
  virtual: { platform: string; meetingLink: string; meetingId: string; passcode: string; instructions: string } | null;
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function summarizeJob(request: JobRequestRow, positionNumber?: number): JobSummary {
  const data = (request.data ?? {}) as LooseData;
  const details = (data.details ?? {}) as LooseData;
  const zone = getIanaZone(details.timeZone || details.timezone || data.timeZone || data.timezone);

  let dateLabel = "Date to be confirmed";
  let timeLabel = "Time to be confirmed";
  let durationLabel = "Time to be confirmed";
  try {
    const { startsAt, endsAt } = resolveRequestTimes(request);
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!Number.isNaN(start.getTime())) {
      dateLabel = formatInTimeZone(start, zone, "EEE, MMM d, yyyy");
      if (!Number.isNaN(end.getTime()) && end.getTime() > start.getTime()) durationLabel = formatHoursMinutes((end.getTime() - start.getTime()) / 60000);
      timeLabel = Number.isNaN(end.getTime())
        ? formatInTimeZone(start, zone, "h:mm a zzz")
        : `${formatInTimeZone(start, zone, "h:mm a")} – ${formatInTimeZone(end, zone, "h:mm a zzz")}`;
    }
  } catch {
    // Keep the "to be confirmed" labels.
  }

  const rawFormat = text(details.format) || text(data.format) || (data.isVirtual ? "Virtual" : "In person");
  const rawSetting = text(details.setting) || text(data.setting);
  const intake = (data.intake ?? {}) as LooseData;
  const rawProgram = text(intake.program) || text(data.program);
  const hasMeetingLink = [details.meetingLink, details.virtualLink, data.meetingLink, data.virtualLink].some((value) => text(value) !== "");
  return {
    reference: formatReference(request.id),
    title: text(request.title) || text(details.title) || "Interpreting assignment",
    dateLabel,
    timeLabel,
    durationLabel,
    format: rawFormat,
    // A meeting link means the job is online, whatever its saved format says.
    isVirtual: rawFormat.toLowerCase().includes("virtual") || hasMeetingLink,
    // Generic setting only (e.g. Medical, Legal, Educational).
    setting: rawSetting && rawSetting !== "Choose a setting" ? rawSetting : "General interpreting",
    role: positionNumber === undefined ? "Interpreter" : positionNumber === 1 ? "Position 1" : `Position ${positionNumber} (team)`,
    // Mapped to a fixed label so a free-text program value can never leak client detail into an email.
    program: /odhh/i.test(rawProgram) ? "WA ODHH" : /apple/i.test(rawProgram) ? "WA Apple Health" : "Agency (general)",
    timeZone: zone,
  };
}

/** Everything the booked interpreter needs. SECURE PAGE ONLY: never send any of this by email. */
export function jobDetailsFor(request: JobRequestRow, positionNumber?: number): JobDetails {
  const summary = summarizeJob(request, positionNumber);
  const data = (request.data ?? {}) as LooseData;
  const details = (data.details ?? {}) as LooseData;
  const onsite = (data.onsite ?? {}) as LooseData;
  const intake = (data.intake ?? {}) as LooseData;
  const meetingLink = text(details.meetingLink) || text(details.virtualLink) || text(data.meetingLink) || text(data.virtualLink);

  return {
    ...summary,
    prepNotes: text(data.prepNotes),
    clientName: text(details.deafParticipant),
    groupFlags: {
      isPublic: typeof intake.isPublic === "boolean" ? intake.isPublic : null,
      isMixedGroup: typeof intake.isMixedGroup === "boolean" ? intake.isMixedGroup : null,
    },
    location: summary.isVirtual && !hasPhysicalPlace(onsite)
      ? null
      : {
          // On a virtual job "Virtual" is not a place name, and the saved one-line location just says "Virtual".
          venue: summary.isVirtual && /^virtual/i.test(text(onsite.venue)) ? "" : text(onsite.venue),
          address: summary.isVirtual ? text(onsite.address) : text(onsite.address) || text(data.location),
          building: text(onsite.building),
          floor: text(onsite.floor),
          room: text(onsite.room),
          entrance: text(onsite.entrance),
          parking: text(onsite.parking),
          contact: text(onsite.contact),
          contactMethod: text(onsite.contactMethod),
        },
    virtual: summary.isVirtual
      ? {
          platform: text(details.platform) || text(data.platform),
          meetingLink,
          meetingId: text(details.meetingId) || text(data.meetingId),
          passcode: text(details.passcode) || text(details.accessCode) || text(data.passcode) || text(data.accessCode),
          instructions: text(details.virtualInstructions) || text(details.instructions) || text(data.virtualInstructions),
        }
      : null,
  };
}
