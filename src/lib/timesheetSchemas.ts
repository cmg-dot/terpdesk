import { z } from "zod";

/** One itemised mileage leg. Shared by the Magic Link and logged-in submission actions. */
export const travelLegSchema = z.object({
  fromLabel: z.string().trim().max(200),
  toLabel: z.string().trim().max(200),
  miles: z.coerce.number().min(0, "Distance cannot be negative.").max(2000),
  roundTrip: z.boolean(),
});

export const travelLegsSchema = z.array(travelLegSchema).max(20, "Too many mileage legs.");

export type TravelLeg = z.infer<typeof travelLegSchema>;

/** A leg as stored: miles rounded to the database's one decimal, plus what it counts for (doubled on a round trip). */
export interface CountedLeg extends TravelLeg {
  countedMiles: number;
}

export const MAX_TOTAL_MILES = 2000;

/** Mileage is stored to one decimal (numeric(7,1)); rounding here keeps the sums equal to what the database holds. */
export const roundMiles = (n: number): number => Math.round(n * 10) / 10;

/** Total miles for a set of legs; round trips count double. Never trust a client-supplied total. */
export const sumLegMiles = (legs: TravelLeg[]): number =>
  legs.reduce((sum, leg) => sum + leg.miles * (leg.roundTrip ? 2 : 1), 0);

/**
 * Drops empty and 0-mile legs, rounds each leg to one decimal and works out what it counts for. The server does this
 * on every submission so a total can never come from the browser.
 */
export function countLegs(legs: TravelLeg[]): CountedLeg[] {
  return legs
    .map((leg) => ({ ...leg, miles: roundMiles(leg.miles) }))
    .filter((leg) => leg.miles > 0)
    .map((leg) => ({ ...leg, countedMiles: roundMiles(leg.miles * (leg.roundTrip ? 2 : 1)) }));
}

/** The sum of the legs' counted miles. */
export const sumCountedMiles = (legs: CountedLeg[]): number =>
  roundMiles(legs.reduce((sum, leg) => sum + leg.countedMiles, 0));

/** True when the approved mileage is not the reported mileage (both compared at the stored one decimal). */
export const mileageDiffers = (approved: number, reported: number): boolean => roundMiles(approved) !== roundMiles(reported);

export const MILEAGE_REASON_REQUIRED = "Explain why the approved mileage differs from the reported mileage.";

/** The agency's reason for changing the mileage; optional here, required by the approval actions when it applies. */
export const mileageAdjustmentReasonSchema = z.string().trim().max(1000, "The reason is too long.");
