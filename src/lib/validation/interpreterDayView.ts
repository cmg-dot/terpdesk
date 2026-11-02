import { z } from "zod";
import { isDateKey } from "@/lib/resourceTimeline";

/** The Interpreter View asks for one calendar day, written yyyy-MM-dd. Nothing else is accepted from the browser. */
export const interpreterDayViewInputSchema = z.object({
  date: z.string().refine(isDateKey, "Choose a valid date."),
});

export type InterpreterDayViewInput = z.infer<typeof interpreterDayViewInputSchema>;
