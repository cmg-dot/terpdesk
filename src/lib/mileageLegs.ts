import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mileageLegs } from "@/db/schema";
import type { CountedLeg } from "@/lib/timesheetSchemas";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Stores the interpreter's mileage legs for a job, replacing whatever set they had before (a resubmission after a
 * correction). Run inside the submitting transaction so the legs and the hours always describe the same submission.
 * `legs` must already be counted (empty and 0-mile legs dropped).
 */
export async function replaceMileageLegs(
  tx: DbTx,
  owner: { requestId: string; interpreterId: string },
  legs: CountedLeg[],
): Promise<void> {
  await tx
    .delete(mileageLegs)
    .where(and(eq(mileageLegs.requestId, owner.requestId), eq(mileageLegs.interpreterId, owner.interpreterId)));
  if (legs.length === 0) return;
  await tx.insert(mileageLegs).values(
    legs.map((leg, i) => ({
      requestId: owner.requestId,
      interpreterId: owner.interpreterId,
      position: i + 1,
      fromLabel: leg.fromLabel,
      toLabel: leg.toLabel,
      miles: leg.miles.toFixed(1),
      roundTrip: leg.roundTrip,
      countedMiles: leg.countedMiles.toFixed(1),
    })),
  );
}
