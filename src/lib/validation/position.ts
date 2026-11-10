import { z } from "zod";
import { MAX_POSITION_ID } from "@/lib/positions";

/**
 * A position on a job: a whole number from 1 up. This only checks the SHAPE; whether the job actually has that position (it may
 * have been removed) is checked on the server against the job itself.
 */
export const positionIdSchema = z.number().int().min(1).max(MAX_POSITION_ID);
