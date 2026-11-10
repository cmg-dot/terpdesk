import { z } from "zod";
import { MAX_OFFER_EXPIRY_MINUTES } from "@/lib/offerExpiry";
import { positionIdSchema } from "@/lib/validation/position";

/**
 * What the browser sends to create an offer. The response window is a length of time, not a clock time: the server
 * turns it into the absolute deadline itself, so a wrong browser clock or time zone can never shift it.
 */
export const createOfferSchema = z.object({
  requestId: z.string().uuid(),
  interpreterId: z.string().uuid(),
  expiresInMinutes: z.number().int().min(1).max(MAX_OFFER_EXPIRY_MINUTES),
  positionIndex: positionIdSchema.default(1),
});

export type CreateOfferInput = z.input<typeof createOfferSchema>;
