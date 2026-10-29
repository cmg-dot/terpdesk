import { z } from "zod";

/** Shared by the Job Details panel and the server action (the real check). */
export const assignInterpreterDirectlySchema = z.object({
  jobId: z.string().uuid(),
  interpreterId: z.string().uuid(),
  // Team jobs have two independent positions; a single-interpreter job only has position 1.
  positionIndex: z.union([z.literal(1), z.literal(2)]).default(1),
});

export type AssignInterpreterDirectlyInput = z.input<typeof assignInterpreterDirectlySchema>;
export type JobPosition = 1 | 2;
