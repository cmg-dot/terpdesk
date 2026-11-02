import { z } from "zod";
import { workbookImportInputSchema } from "@/lib/validation/workbookImport";

/**
 * The historical-jobs upload: the same checks as the roster import (an .xlsx up to 5 MB, a mode) plus whether a name
 * that is only the START of one roster person's name ("Karen") may be linked to that person. FormData carries it as text.
 */
export const jobsImportInputSchema = workbookImportInputSchema.extend({
  allowPartial: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type JobsImportInput = z.infer<typeof jobsImportInputSchema>;
