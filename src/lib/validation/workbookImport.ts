import { z } from "zod";
import { MAX_WORKBOOK_BYTES } from "@/lib/workbookImport/types";

/** What a browser file upload looks like to the server (a File, without relying on the global `File` class). */
interface UploadedFile {
  name: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

const isUploadedFile = (value: unknown): value is UploadedFile => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<UploadedFile>;
  return typeof candidate.name === "string" && typeof candidate.size === "number" && typeof candidate.arrayBuffer === "function";
};

/** Checks the upload before a single byte is parsed. The same checks run in the browser for instant feedback. */
export const workbookImportInputSchema = z.object({
  file: z
    .custom<UploadedFile>(isUploadedFile, "Choose an .xlsx file to import.")
    .refine((file) => /\.xlsx$/i.test(file.name), "That isn't an .xlsx file. Save the workbook as .xlsx and try again.")
    .refine((file) => file.size > 0, "That file is empty.")
    .refine((file) => file.size <= MAX_WORKBOOK_BYTES, `That file is too large (over ${Math.round(MAX_WORKBOOK_BYTES / 1000)} KB). Remove unused sheets or rows and try again.`),
  mode: z.enum(["preview", "import"]),
});

export type WorkbookImportInput = z.infer<typeof workbookImportInputSchema>;
