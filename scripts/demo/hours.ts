import { randomUUID } from "node:crypto";
import { onsiteKeyPrefix } from "@/lib/onsiteSignoff";
import type { OnsiteSignoff } from "@/lib/onsiteSignature";
import { positionLabel } from "@/lib/positions";
import type { CountedLeg } from "@/lib/timesheetSchemas";
import type { HoursSpec } from "./jobs";
import { plusMinutes } from "./schedule";
import { signatureDataUrl, signaturePng } from "./signaturePng";

/**
 * One position's hours, built exactly as the app stores them: submitInterpreterHours writes the record (source "in_app", the
 * interpreter's signature as a PNG data URL, the on-site sign-off as a key into the private bucket) and reviewHours adds the
 * approval. The on-site picture is returned separately: the seed uploads it to `onsite-signatures/<requestId>/` before saving.
 */

export interface PositionHours {
  record: Record<string, unknown>;
  legs: CountedLeg[];
  upload: { key: string; bytes: Buffer } | null;
}

const roundMiles = (miles: number): number => Math.round(miles * 10) / 10;
const shortId = (): string => Math.random().toString(36).substring(7);

export function positionHours(params: {
  requestId: string;
  data: Record<string, unknown>;
  spec: HoursSpec;
  interpreter: { id: string; name: string };
  scheduled: { start: Date; end: Date };
  onsite: { required: boolean; printedName: string };
  /** Where the mileage leg ends: the job's venue. */
  destination: string;
}): PositionHours {
  const { requestId, data, spec, interpreter, scheduled, onsite, destination } = params;
  const actualStart = scheduled.start;
  const actualEnd = plusMinutes(scheduled.end, spec.overMinutes ?? 0);
  const submittedAt = plusMinutes(actualEnd, 90);

  const legs: CountedLeg[] = spec.leg
    ? [{ fromLabel: spec.leg.from, toLabel: destination, miles: roundMiles(spec.leg.miles), roundTrip: spec.leg.roundTrip, countedMiles: roundMiles(spec.leg.miles * (spec.leg.roundTrip ? 2 : 1)) }]
    : [];
  const miles = roundMiles(legs.reduce((sum, leg) => sum + leg.countedMiles, 0));

  let upload: PositionHours["upload"] = null;
  let onsiteSignoff: OnsiteSignoff | null = null;
  if (onsite.required) {
    const key = `${onsiteKeyPrefix(requestId)}${randomUUID()}.png`;
    upload = { key, bytes: signaturePng(onsite.printedName) };
    onsiteSignoff = { printedName: onsite.printedName, signedAt: plusMinutes(actualEnd, 5).toISOString(), storageKey: key };
  }

  const label = positionLabel(data, spec.position);
  const history: Record<string, unknown>[] = [
    {
      id: shortId(),
      type: "initial_submission",
      title: "Initial hours submitted",
      actor: interpreter.name,
      timestamp: submittedAt.toISOString(),
      version: 1,
      details: { actualStart: actualStart.toISOString(), actualEnd: actualEnd.toISOString(), mileage: miles, breakMinutes: 0, travelStartTime: null, travelEndTime: null, serviceCompleted: null, mileageNote: "", note: spec.note ?? "", positionIndex: spec.position },
    },
  ];

  const record: Record<string, unknown> = {
    timesheetId: null,
    source: "in_app",
    positionIndex: spec.position,
    interpreterName: interpreter.name,
    interpreterId: interpreter.id,
    actualStartTime: actualStart.toISOString(),
    actualEndTime: actualEnd.toISOString(),
    miles,
    legs,
    breakMinutes: 0,
    travelStartTime: null,
    travelEndTime: null,
    serviceCompleted: null,
    mileageNote: "",
    note: spec.note ?? "",
    version: 1,
    signatureDataUrl: signatureDataUrl(interpreter.name),
    onsiteSignoff,
    cancellationReason: null,
    submittedAt: submittedAt.toISOString(),
    reviewMessage: null,
    approvedMileage: null,
    status: "awaiting_review",
    history,
  };

  if (spec.status === "approved") {
    const approvedAt = plusMinutes(submittedAt, 240).toISOString();
    history.push({ id: shortId(), type: "approved", title: `Hours approved and finalized (${label})`, actor: "Agency Staff", timestamp: approvedAt, version: 1, positionIndex: spec.position, details: { approvedMileage: miles } });
    Object.assign(record, { status: "approved", approvedMileage: miles, mileageAdjustmentReason: null, approvedAt });
  }
  return { record, legs, upload };
}
