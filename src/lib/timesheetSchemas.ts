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

export const MAX_TOTAL_MILES = 2000;

/** Total miles for a set of legs; round trips count double. Never trust a client-supplied total. */
export const sumLegMiles = (legs: TravelLeg[]): number =>
  legs.reduce((sum, leg) => sum + leg.miles * (leg.roundTrip ? 2 : 1), 0);
