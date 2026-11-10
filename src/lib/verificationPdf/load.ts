import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, offers, requests, timesheets } from "@/db/schema";
import { ensureDisplayNameColumns, interpreterDisplayName } from "@/lib/displayName";
import { asOnsiteSignoff } from "@/lib/onsiteSignature";
import { onsiteKeyPrefix } from "@/lib/onsiteSignoff";
import { positionOfOffer } from "@/lib/positions";
import type { PositionId } from "@/lib/positions";
import { readObject } from "@/lib/s3";
import { isStateJobRequest } from "@/lib/stateJob";
import { legacyPosition1Hours } from "@/utils/hoursState";
import type { VerificationFacts } from "@/lib/verificationPdf/build";

/**
 * Gathers what the invoice needs for ONE position of ONE job: the job, that position's hours, the interpreter's and the on-site
 * contact's signatures (the second one read from the private bucket) and the names of the rest of the team.
 *
 * "not_found" covers every case where there is nothing to print (unknown job, a state job, a position without hours), so the
 * caller answers all of them the same way. A sign-off that exists but whose picture cannot be read is "signature_unavailable":
 * a verification record is never produced with the authorization silently missing.
 *
 * SERVER ONLY.
 */

export type FactsOutcome = { ok: true; facts: VerificationFacts } | { ok: false; reason: "not_found" | "signature_unavailable" };

type Loose = Record<string, unknown>;

const MAX_SIGNATURE_BYTES = 400_000;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47] as const;
const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

const obj = (v: unknown): Loose => (v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : {});
const isPng = (bytes: Uint8Array): boolean => PNG_MAGIC.every((b, i) => bytes[i] === b);

/** The PNG inside a `data:image/png;base64,...` string, or null when it is anything else. */
function decodePngDataUrl(value: unknown): Uint8Array | null {
  const match = typeof value === "string" && value.length <= MAX_SIGNATURE_BYTES * 2 ? PNG_DATA_URL.exec(value) : null;
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  return isPng(bytes) ? bytes : null;
}

async function namesOf(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  await ensureDisplayNameColumns();
  const rows = await db.select({ id: interpreters.id, name: interpreterDisplayName }).from(interpreters).where(inArray(interpreters.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function loadVerificationFacts(requestId: string, position: PositionId): Promise<FactsOutcome> {
  const [job] = await db.select({ createdAt: requests.createdAt, isStateJob: requests.isStateJob, data: requests.data }).from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!job || isStateJobRequest(job)) return { ok: false, reason: "not_found" };

  const data = obj(job.data);
  const hours = obj(obj(data.hoursSubmissions)[position] ?? (position === 1 ? legacyPosition1Hours(data) : null));
  if (Object.keys(hours).length === 0) return { ok: false, reason: "not_found" };

  const interpreterId = typeof hours.interpreterId === "string" ? hours.interpreterId : null;

  // The other booked interpreters are the team, in position order.
  const booked = await db
    .select({ id: offers.id, interpreterId: offers.interpreterId })
    .from(offers)
    .where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted")))
    .orderBy(asc(offers.createdAt));
  const teamIds = booked
    .filter((o) => positionOfOffer(data.offerPositions, o.id) !== position && o.interpreterId !== interpreterId)
    .sort((a, b) => positionOfOffer(data.offerPositions, a.id) - positionOfOffer(data.offerPositions, b.id))
    .map((o) => o.interpreterId);
  const names = await namesOf(Array.from(new Set(interpreterId ? [...teamIds, interpreterId] : teamIds)));

  // The interpreter's own signature: kept on the hours record (in-app) or on the timesheet row (secure link).
  let interpreterSignature = decodePngDataUrl(hours.signatureDataUrl);
  if (!interpreterSignature && typeof hours.timesheetId === "string") {
    const [sheet] = await db
      .select({ signatureDataUrl: timesheets.signatureDataUrl })
      .from(timesheets)
      .where(and(eq(timesheets.id, hours.timesheetId), eq(timesheets.requestId, requestId)))
      .limit(1);
    interpreterSignature = decodePngDataUrl(sheet?.signatureDataUrl);
  }

  // The on-site contact's sign-off: the picture comes from the private bucket, and only from this job's own folder.
  let onsite: VerificationFacts["onsite"] = null;
  const signoff = asOnsiteSignoff(hours.onsiteSignoff);
  if (signoff) {
    if (!signoff.storageKey.startsWith(onsiteKeyPrefix(requestId))) return { ok: false, reason: "signature_unavailable" };
    try {
      const png = await readObject(signoff.storageKey, MAX_SIGNATURE_BYTES);
      if (!isPng(png)) return { ok: false, reason: "signature_unavailable" };
      onsite = { printedName: signoff.printedName, signedAt: signoff.signedAt, signature: png };
    } catch {
      return { ok: false, reason: "signature_unavailable" };
    }
  }

  return {
    ok: true,
    facts: {
      createdAt: job.createdAt,
      data,
      hours,
      interpreterName: (interpreterId ? names.get(interpreterId) : undefined) ?? (typeof hours.interpreterName === "string" ? hours.interpreterName : ""),
      teamNames: teamIds.map((id) => names.get(id)).filter((n): n is string => Boolean(n)),
      interpreterSignature,
      onsite,
    },
  };
}
