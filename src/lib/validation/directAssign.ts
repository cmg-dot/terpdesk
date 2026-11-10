import { z } from "zod";
import type { PositionId } from "@/lib/positions";
import { positionIdSchema } from "@/lib/validation/position";

/** Shared by the Job Details panel and the server action (the real check). */
export const assignInterpreterDirectlySchema = z.object({
  jobId: z.string().uuid(),
  interpreterId: z.string().uuid(),
  // A job has one or more independent positions; the server checks this one really exists on the job.
  positionIndex: positionIdSchema.default(1),
});

export type AssignInterpreterDirectlyInput = z.input<typeof assignInterpreterDirectlySchema>;
export type JobPosition = PositionId;
