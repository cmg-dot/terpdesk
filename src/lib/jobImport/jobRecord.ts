import { randomUUID } from "crypto";
import type { RequestData } from "@/db/schema";
import { JOBS_TIME_ZONE_LABEL } from "@/lib/jobImport/types";
import type { PlannedJob } from "@/lib/jobImport/types";
import { normalizeRequestData } from "@/lib/requestData";

/**
 * Builds the request row (and the offers that book its interpreters) for one imported job, in exactly the shape the
 * "Directly assign interpreter" action leaves behind, so every screen reads an imported job like any other booked one:
 * an accepted offer per interpreter, the position's slot pointing at it, and the interpreter's name on the request.
 * Pure apart from generating ids; no database access.
 *
 * Nothing here contacts anyone: no notification, no email. The title is the app's default (no names in titles), and no
 * funding program is set, so the ODHH reminder cron never picks these jobs up.
 */

export const IMPORTED_JOB_TITLE = "Interpreting request";

export interface JobRecord {
  requestId: string;
  status: string;
  createdAt: Date;
  data: RequestData;
  offers: { id: string; interpreterId: string; positionIndex: 1 | 2 }[];
}

type Slot = {
  id: string;
  positionIndex: 1 | 2;
  active: true;
  reservedBy: string | null;
  needsReplacement: false;
  followUp: false;
  interpreterName?: string;
};

export const buildJobRecord = (job: PlannedJob): JobRecord => {
  const requestId = randomUUID();
  const positionCount = job.assignments.length >= 2 ? 2 : 1;
  const offers: JobRecord["offers"] = [];
  const slots: Slot[] = [];
  const names: Record<number, { id: string; name: string }> = {};

  for (let position = 1 as 1 | 2; position <= positionCount; position = (position + 1) as 1 | 2) {
    const assignment = job.assignments[position - 1];
    const match = assignment && (assignment.match.kind === "exact" || assignment.match.kind === "partial") ? assignment.match : null;
    if (match) {
      const offerId = randomUUID();
      offers.push({ id: offerId, interpreterId: match.interpreterId, positionIndex: position });
      names[position] = { id: match.interpreterId, name: match.label };
      slots.push({ id: offerId, positionIndex: position, active: true, reservedBy: match.interpreterId, interpreterName: match.label, needsReplacement: false, followUp: false });
    } else {
      slots.push({ id: `slot-${position}`, positionIndex: position, active: true, reservedBy: null, needsReplacement: false, followUp: false });
    }
  }

  const filled = offers.length;
  const status = filled === 0 ? "draft" : filled === positionCount ? "booked" : "Partially staffed";

  const raw = {
    brief: {},
    intake: {},
    details: { startDate: job.date, startTime: job.startTime, endDate: job.date, endTime: job.endTime, timeZone: JOBS_TIME_ZONE_LABEL },
    slotCount: positionCount,
    slots,
    slotReplacements: {},
    offerPositions: Object.fromEntries(offers.map((o) => [o.id, o.positionIndex])),
    ...(names[1] ? { assignedInterpreterName: names[1].name, assignedInterpreterId: names[1].id } : {}),
    ...(names[2] ? { position2InterpreterName: names[2].name, position2InterpreterId: names[2].id } : {}),
    // Provenance and the fingerprint that makes re-importing the same workbook a no-op.
    importKey: job.contentHash,
    importSource: { kind: "excel-jobs", row: job.line },
  } as unknown as RequestData;

  return { requestId, status, createdAt: new Date(job.startsAt), data: normalizeRequestData(raw, job.startsAt, job.endsAt), offers };
};
