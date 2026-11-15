import { randomUUID } from "node:crypto";
import type { InsertRequest, RequestData, mileageLegs, offers, requestActivity } from "@/db/schema";
import { positionFields, positionLabel } from "@/lib/positions";
import { normalizeRequestData } from "@/lib/requestData";
import { isStateProgram } from "@/lib/stateJob";
import type { DemoClient, InterpreterKey } from "./fixtures";
import { positionHours } from "./hours";
import type { BookingStatus, JobSpec } from "./jobs";
import { ZONE_LABEL, plusMinutes, wallClock } from "./schedule";

/**
 * Turns the job specs into database rows shaped like the app's own actions leave them: createRequest's normalised data
 * (normalizeRequestData, the same position fields), createOffer's `offerPositions`, respondToOffer's statuses and activity
 * entries, submitInterpreterHours' `hoursSubmissions` (plus the legacy `hoursSubmission` for Position 1) and its mileage legs,
 * and cancelJob's cancellation record. Pure apart from generating ids.
 */

type InsertOffer = typeof offers.$inferInsert;
type InsertActivity = typeof requestActivity.$inferInsert;
type InsertLeg = typeof mileageLegs.$inferInsert;

export interface JobRows {
  requests: InsertRequest[];
  offers: InsertOffer[];
  activity: InsertActivity[];
  legs: InsertLeg[];
  uploads: { key: string; bytes: Buffer }[];
}

export interface People {
  interpreter: (key: InterpreterKey) => { id: string; name: string };
  client: (key: JobSpec["client"]) => DemoClient;
  adminName: string;
}

const DAY = 24 * 60;
const STORED_OFFER_STATUS: Record<BookingStatus, string> = { accepted: "accepted", pending: "pending", declined: "declined" };

function requestData(spec: JobSpec, client: DemoClient, startsAt: string, endsAt: string): RequestData {
  const count = spec.positions ?? 1;
  const virtual = Boolean(spec.meeting);
  const program = spec.program ?? "General";
  const meeting = spec.meeting
    ? { platform: spec.meeting.platform, meetingLink: spec.meeting.link, meetingId: spec.meeting.meetingId, passcode: spec.meeting.passcode }
    : {};
  const raw: RequestData = {
    brief: { hearingIdentity: "deaf" },
    intake: { program, ...(spec.srn ? { odhhSrn: spec.srn, bookingPeriod: "72 Hours" } : {}) },
    overview: { location: virtual ? `${spec.meeting?.platform} (Virtual)` : client.venue, status: "Unfilled / draft", startsAt, endsAt },
    repeats: Boolean(spec.recurrence),
    recurrenceNote: spec.recurrence ?? "",
    details: {
      setting: spec.setting,
      purpose: spec.purpose,
      format: virtual ? "Virtual" : "In person",
      timeZone: ZONE_LABEL,
      timezone: ZONE_LABEL,
      ...wallClock(new Date(startsAt), new Date(endsAt)),
      deafParticipant: spec.participant,
      peopleNeeding: "1",
      commPreferences: "ASL",
      qualifications: count > 1 ? "Team interpreting experience" : "",
      ...meeting,
      ...positionFields(count),
    },
    onsite: virtual
      ? {}
      : { venue: client.venue, address: client.address, building: client.building, parking: client.parking, entrance: client.entrance, contact: client.onsiteContact, contactMethod: client.onsitePhone },
    requester: { name: client.requester.name, org: client.name, email: client.requester.email, phone: client.requester.phone, prefContact: "Email", billOrg: client.name, billEmail: client.requester.email },
    prepNotes: spec.prepNotes ?? "",
    privateNotes: "",
    ...positionFields(count),
  };
  return normalizeRequestData(raw, startsAt, endsAt);
}

export function buildJobRows(specs: JobSpec[], people: People, now: Date): JobRows {
  const out: JobRows = { requests: [], offers: [], activity: [], legs: [], uploads: [] };
  for (const spec of specs) {
    const id = randomUUID();
    const client = people.client(spec.client);
    const startsAt = spec.start.toISOString();
    const endsAt = spec.end.toISOString();
    const isStateJob = isStateProgram(spec.program);
    const onsiteRequired = spec.onsiteSignatureRequired ?? (!isStateJob && !spec.meeting);
    const data: Record<string, unknown> = { ...requestData(spec, client, startsAt, endsAt), onsiteSignatureRequired: onsiteRequired };
    const createdAt = plusMinutes(spec.start < now ? spec.start : now, -4 * DAY);
    const log = (entry: Omit<InsertActivity, "requestId">) => out.activity.push({ requestId: id, ...entry });
    log({ kind: "created", audience: "shared", message: "Request created", actorLabel: people.adminName, createdAt });

    // Offers: one per booking, mapped to its position exactly as createOffer records it.
    const offerPositions: Record<string, number> = {};
    for (const booking of spec.bookings ?? []) {
      const offerId = randomUUID();
      const who = people.interpreter(booking.who);
      const sentAt = plusMinutes(createdAt, 60);
      const answeredAt = plusMinutes(sentAt, 95);
      const pendingExpiry = new Date(Math.min(plusMinutes(now, DAY).getTime(), plusMinutes(spec.start, -60).getTime()));
      const status = spec.cancelled && booking.status === "accepted" ? "cancelled" : STORED_OFFER_STATUS[booking.status];
      offerPositions[offerId] = booking.position;
      out.offers.push({ id: offerId, requestId: id, interpreterId: who.id, status, expiresAt: booking.status === "pending" ? pendingExpiry : plusMinutes(sentAt, DAY), createdAt: sentAt, updatedAt: booking.status === "pending" ? sentAt : answeredAt });
      const posText = positionLabel(data, booking.position);
      log({ interpreterId: who.id, kind: "offer_sent", audience: "agency", message: `Offer sent (${posText})`, actorLabel: people.adminName, createdAt: sentAt });
      if (booking.status === "accepted") log({ interpreterId: who.id, kind: "offer_accepted", audience: "shared", message: `Offer accepted · booked for ${posText}`, actorLabel: "Interpreter (in app)", createdAt: answeredAt });
      if (booking.status === "declined") log({ interpreterId: who.id, kind: "offer_declined", audience: "agency", message: `Offer declined (${posText})`, actorLabel: "Interpreter (in app)", createdAt: answeredAt });
    }
    data.offerPositions = offerPositions;
    if (spec.needsReplacement) data.slotReplacements = { 1: true };

    // Hours, per position, from that position's booked interpreter.
    const hoursSubmissions: Record<string, Record<string, unknown>> = {};
    for (const hours of spec.hours ?? []) {
      const booking = spec.bookings?.find((b) => b.position === hours.position && b.status === "accepted");
      if (!booking) throw new Error(`Job "${spec.title}": hours for position ${hours.position} have no booked interpreter.`);
      const who = people.interpreter(booking.who);
      const built = positionHours({ requestId: id, data, spec: hours, interpreter: who, scheduled: spec, onsite: { required: onsiteRequired, printedName: client.onsiteContact }, destination: client.venue });
      hoursSubmissions[String(hours.position)] = built.record;
      if (built.upload) out.uploads.push(built.upload);
      built.legs.forEach((leg, position) => out.legs.push({ requestId: id, interpreterId: who.id, position, fromLabel: leg.fromLabel, toLabel: leg.toLabel, miles: String(leg.miles), roundTrip: leg.roundTrip, countedMiles: String(leg.countedMiles) }));
      const submittedAt = new Date(String(built.record.submittedAt));
      log({ interpreterId: who.id, kind: "hours_submitted", audience: "shared", message: "Hours submitted (in app)", actorLabel: "Interpreter", createdAt: submittedAt });
      if (hours.status === "approved") log({ kind: "hours_approved", audience: "agency", message: `Hours approved (${positionLabel(data, hours.position)})`, actorLabel: "Agency staff", createdAt: new Date(String(built.record.approvedAt)) });
    }
    if (Object.keys(hoursSubmissions).length > 0) {
      data.hoursSubmissions = hoursSubmissions;
      if (hoursSubmissions["1"]) data.hoursSubmission = hoursSubmissions["1"];
    }

    let canceledAt: Date | null = null;
    if (spec.cancelled) {
      canceledAt = plusMinutes(spec.start, -spec.cancelled.daysBefore * DAY);
      data.cancellation = { at: canceledAt.toISOString(), recordedAt: canceledAt.toISOString(), noticeHours: spec.cancelled.daysBefore * 24, source: "staff" };
      log({ kind: "cancelled", audience: "shared", message: `Request cancelled: ${spec.cancelled.reason}`, actorLabel: people.adminName, createdAt: canceledAt });
    }

    out.requests.push({
      id,
      title: spec.title,
      status: spec.status,
      isStateJob,
      // createRequest stores the appointment's start here.
      createdAt: spec.start,
      updatedAt: now,
      data: data as RequestData,
      canceledAt,
      cancelReason: spec.cancelled?.reason ?? null,
      clientRequestedCancellation: Boolean(spec.cancelled),
    });
  }
  return out;
}
