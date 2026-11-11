import type { MappedRequest } from "@/lib/mapRequestRow";
import { requestOrganization, requestSrn, requestWhere } from "@/lib/requestSummary";
import type { ListedRequest } from "@/lib/requestListFilter";
import { getIanaZone } from "@/utils/timezone";
import type { Appointment } from "@/utils/statusEngine";

/**
 * The lean row the dashboard, the Requests list and the calendar read. It is cut from the full mapped request (mapRequestRow), so a
 * list can never disagree with the detail page about what state a job is in, but it leaves out everything a list never shows: the
 * whole `data` blob, the copied `details` / `onsite` / `overview` trees, notes, meeting links and passcodes, the requester's contact
 * details, and every offer that is not pending or accepted. The full record stays on /requests/[id] (fetchLiveRequestById).
 *
 * Every field the shared predicates read (getStatusFilters, getStaffingRatio, isAppointmentHappeningNow, resolveRequestTimes,
 * readPositions) is kept under the same name, so those functions give the same answer on a row as on the full request.
 * Pure: safe on the server and in client components.
 */

/** A position. Only what the status engine and the lists read: whether it is open and who holds it, and whether it needs someone. */
export interface RequestListSlot {
  active: boolean;
  reservedBy: string | null;
  interpreterName?: string;
  needsReplacement: boolean;
  followUp: boolean;
}

/**
 * A pending or accepted offer: the only kinds that change a job's status, its staffing or its pending-offer flag. The deadline is only
 * sent for a pending one (an accepted offer has no deadline to check). An offer's state always equals its status, so only the status
 * is sent; the engine reads either.
 */
export interface RequestListOffer {
  interpreterName: string | null;
  status: string;
  expiresAt?: string;
}

export type RequestListRow = {
  id: string;
  title: string;
  /** The staffing status (a closed job with an interpreter reads "Fully staffed"); see isCompleted for the closed state. */
  status: string;
  /** The state's service request number, or null for a private request. */
  srn: string | null;
  /** The requester's organization as the list shows it (never a funding program); null when none was named. */
  organization: string | null;
  /** Only the organization name: the requester's contact details never leave the server. */
  requester: { org?: string };
  client?: string;
  /** The funding program ("WA ODHH", ...). */
  program?: string;
  setting: string;
  format: string;
  /** Set only when true. */
  isVirtual?: true;
  /** The one-line location the cards show (never empty: "Location pending" at worst). */
  location: string;
  /** The venue alone (the live banner shows it ahead of the location). */
  venue: string;
  /** Where the job is, as the calendar search reads it: the whole line, and the venue part of it. */
  where: { text: string; venue: string };
  startsAt: string;
  endsAt: string;
  /** The job's own IANA zone: every time is shown in it. */
  timeZone: string;
  /** The number of active positions. readPositions reads it from here, so the status engine counts the same positions as the full request. */
  slotCount: number;
  slots: RequestListSlot[];
  offers: RequestListOffer[];
  staffedCount: number;
  acceptedInterpretersCount: number;
  /** Set only when true (as are isCompleted, isVoided and isReturned). */
  hasAcceptedOffer?: true;
  assignedInterpreterName?: string;
  isCompleted?: true;
  isVoided?: true;
  isReturned?: true;
};

/**
 * A lean row seen as the appointment the status engine reads, and as the request the list filters read. The row carries every field
 * those functions read (see the note at the top), so these are the ONE place the view is stated.
 */
export const asAppointment = (row: RequestListRow): Appointment => row as unknown as Appointment;
export const asListed = (row: RequestListRow): ListedRequest => row as unknown as ListedRequest;

interface ListSourceData {
  client?: unknown;
  intake?: { program?: unknown };
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const optionalText = (value: unknown): string | undefined => text(value) || undefined;
const flag = (value: unknown): true | undefined => (value ? true : undefined);
const isOpenOffer = (offer: { status?: unknown; state?: unknown }): boolean =>
  offer.status === "pending" || offer.state === "pending" || offer.status === "accepted" || offer.state === "accepted";

export function toListRow(mapped: MappedRequest): RequestListRow {
  const data: ListSourceData = mapped.data ?? {};
  const requester = (mapped.requester ?? {}) as { org?: unknown };
  const where = requestWhere(mapped);
  return {
    id: mapped.id,
    title: mapped.title,
    status: mapped.status,
    srn: requestSrn(mapped),
    organization: requestOrganization(mapped),
    requester: { org: optionalText(requester.org) },
    client: optionalText(data.client),
    program: optionalText(data.intake?.program),
    setting: text(mapped.setting),
    format: text(mapped.format),
    isVirtual: flag(mapped.isVirtual),
    location: text(mapped.location),
    venue: text(mapped.onsite?.venue),
    where: { text: where.text, venue: where.virtual ? where.text : where.parts[0] && where.parts[0] !== "Location pending" ? where.parts[0] : "" },
    startsAt: mapped.startsAt,
    endsAt: mapped.endsAt,
    timeZone: getIanaZone(text(mapped.details?.timeZone)),
    slotCount: mapped.slotCount,
    slots: mapped.slots.map((slot) => ({
      active: slot.active,
      reservedBy: slot.reservedBy,
      interpreterName: slot.interpreterName,
      needsReplacement: slot.needsReplacement,
      followUp: slot.followUp,
    })),
    offers: mapped.offers.filter(isOpenOffer).map((offer) => ({
      interpreterName: typeof offer.interpreterName === "string" ? offer.interpreterName : null,
      status: String(offer.status),
      ...(offer.status === "pending" ? { expiresAt: String(offer.expiresAt) } : {}),
    })),
    staffedCount: mapped.staffedCount,
    acceptedInterpretersCount: mapped.acceptedInterpretersCount,
    hasAcceptedOffer: flag(mapped.hasAcceptedOffer),
    assignedInterpreterName: optionalText(mapped.assignedInterpreterName),
    isCompleted: flag(mapped.isCompleted),
    isVoided: flag(mapped.isVoided),
    isReturned: flag(mapped.isReturned),
  };
}
