import { realSetting } from "@/lib/settingLabel";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { UpdateRequestDetailsPayload } from "@/app/actions/updateRequestDetails";
import { parseSafeDate } from "@/lib/requestDetailsFormat";
import { getIanaZone } from "@/utils/timezone";

/**
 * The Quick Edit "Update Access & Location" form, kept apart from the Request page so the modal can own its own state:
 * what the form holds, how it starts from a stored request, whether its times make sense, what is sent to the server,
 * and the copy of the saved job kept for the interpreter's offline list.
 */

export interface QuickEditValues {
  setting: string;
  format: string;
  platform: string;
  meetingLink: string;
  meetingId: string;
  passcode: string;
  virtualInstructions: string;
  venue: string;
  address: string;
  building: string;
  contact: string;
  contactMethod: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeZone: string;
}

export const DEFAULT_QUICK_EDIT_ZONE = "Pacific Time — Seattle, Los Angeles";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const child = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined);

/** One field of a stored request (or of anything nested in it), or undefined. The request is loosely shaped, so it is read, not assumed. */
export const requestField = child;
/** The first non-empty text among the candidates, or "". */
const firstText = (...candidates: unknown[]): string => {
  for (const candidate of candidates) if (typeof candidate === "string" && candidate !== "") return candidate;
  return "";
};

/** The form as it should open for a stored request (the request's own times are shown in its own time zone). */
export function initialQuickEditValues(request: unknown): QuickEditValues {
  const details = child(request, "details");
  const onsite = child(request, "onsite");
  const field = (key: string): unknown => child(request, key);
  const detail = (key: string): unknown => child(details, key);

  const formatText = firstText(detail("format")).toLowerCase();
  const hasMeetingLink = firstText(field("meetingLink"), detail("meetingLink"), field("virtualLink"), detail("virtualLink")) !== "";
  // A meeting link means the job is online whatever its saved format says.
  const isVirtual = hasMeetingLink || (typeof field("isVirtual") === "boolean" ? (field("isVirtual") as boolean) : formatText ? formatText.includes("virtual") : true);
  const timeZone = firstText(detail("timeZone"), field("timeZone")) || DEFAULT_QUICK_EDIT_ZONE;
  const zone = getIanaZone(timeZone);
  const start = parseSafeDate(field("startsAt")) ?? new Date();
  const end = parseSafeDate(field("endsAt")) ?? new Date(start.getTime() + 3_600_000);

  return {
    setting: realSetting(firstText(field("setting"), detail("setting"))),
    format: firstText(field("format"), detail("format")) || (isVirtual ? "Virtual" : "In person"),
    platform: firstText(field("platform"), detail("platform")) || "Zoom",
    meetingLink: firstText(field("meetingLink"), detail("meetingLink"), field("virtualLink"), detail("virtualLink")),
    meetingId: firstText(field("meetingId"), detail("meetingId")),
    passcode: firstText(field("passcode"), detail("passcode"), field("accessCode"), detail("accessCode")),
    virtualInstructions: firstText(field("virtualInstructions"), detail("virtualInstructions")),
    venue: firstText(child(onsite, "venue")),
    address: firstText(child(onsite, "address")),
    building: firstText(child(onsite, "building")),
    contact: firstText(child(onsite, "contact")),
    contactMethod: firstText(child(onsite, "contactMethod")),
    startDate: formatInTimeZone(start, zone, "yyyy-MM-dd"),
    startTime: formatInTimeZone(start, zone, "HH:mm"),
    endDate: formatInTimeZone(end, zone, "yyyy-MM-dd"),
    endTime: formatInTimeZone(end, zone, "HH:mm"),
    timeZone,
  };
}

/** True when all four of date and time are filled in and the end is not after the start (in the chosen time zone). */
export function quickEditTimesInvalid(values: Pick<QuickEditValues, "startDate" | "startTime" | "endDate" | "endTime" | "timeZone">): boolean {
  const { startDate, startTime, endDate, endTime, timeZone } = values;
  if (!startDate || !startTime || !endDate || !endTime) return false;
  try {
    const zone = getIanaZone(timeZone);
    return fromZonedTime(`${endDate}T${endTime}:00`, zone).getTime() <= fromZonedTime(`${startDate}T${startTime}:00`, zone).getTime();
  } catch {
    return new Date(`${startDate}T${startTime}`) >= new Date(`${endDate}T${endTime}`);
  }
}

/** What the server action is sent. While an interpreter is booked the schedule is left out and the message goes instead. */
export function quickEditPayload(
  requestId: string,
  values: QuickEditValues,
  scheduleLocked: boolean,
  message: string,
  recipientId: string,
): UpdateRequestDetailsPayload {
  return {
    requestId,
    setting: values.setting,
    format: values.format,
    platform: values.platform,
    meetingLink: values.meetingLink,
    meetingId: values.meetingId,
    passcode: values.passcode,
    virtualInstructions: values.virtualInstructions,
    venue: values.venue,
    address: values.address,
    building: values.building,
    contact: values.contact,
    contactMethod: values.contactMethod,
    ...(scheduleLocked
      ? { messageToInterpreter: message, messageRecipientId: recipientId || undefined }
      : { startDate: values.startDate, startTime: values.startTime, endDate: values.endDate, endTime: values.endTime, timeZone: values.timeZone }),
  };
}

/** After a save: mirror the new details into the interpreter's cached job list on this device (best effort). */
export function syncStoredJob(requestId: string, values: QuickEditValues, updated: unknown, savedData: unknown): void {
  if (typeof window === "undefined") return;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem("terpdesk_interpreter_jobs") || "[]");
    if (!Array.isArray(stored)) return;
    const index = stored.findIndex((job) => isRecord(job) && (String(job.id) === requestId || String(job.requestId) === requestId));
    const current = stored[index];
    if (index < 0 || !isRecord(current)) return;

    const isVirtual = values.format.toLowerCase().includes("virtual") || values.meetingLink.trim() !== "";
    const startsAt = child(updated, "startsAt") || child(savedData, "startsAt");
    const endsAt = child(updated, "endsAt") || child(savedData, "endsAt");
    stored[index] = {
      ...current,
      setting: values.setting,
      format: values.format,
      isVirtual,
      startsAt: startsAt || current.startsAt,
      endsAt: endsAt || current.endsAt,
      timeZone: values.timeZone,
      location: isVirtual
        ? values.platform ? `${values.platform} (Virtual)` : "Virtual"
        : values.venue ? (values.address ? `${values.venue} · ${values.address}` : values.venue) : "In person",
      meetingLink: values.meetingLink,
      virtualLink: values.meetingLink,
      meetingId: values.meetingId,
      passcode: values.passcode,
      accessCode: values.passcode,
      platform: values.platform,
      virtualInstructions: values.virtualInstructions,
      details: {
        ...(isRecord(current.details) ? current.details : {}),
        setting: values.setting,
        format: values.format,
        timeZone: values.timeZone,
        startsAt,
        endsAt,
        startDate: values.startDate,
        startTime: values.startTime,
        endDate: values.endDate,
        endTime: values.endTime,
      },
      onsite: {
        ...(isRecord(current.onsite) ? current.onsite : {}),
        venue: values.venue,
        address: values.address,
        building: values.building,
        contact: values.contact,
        contactMethod: values.contactMethod,
      },
    };
    localStorage.setItem("terpdesk_interpreter_jobs", JSON.stringify(stored));
  } catch {
    console.error("[quick edit] could not update the saved job copy");
  }
}
