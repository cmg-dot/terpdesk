import { z } from "zod";

/**
 * CSV bulk import of shadow interpreter profiles: the column mapping and row validation shared by the browser (to
 * report problems before anything is sent) and the server (which never trusts what the browser validated).
 *
 * Pure functions, no I/O: safe to import from client components.
 */

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 1_000_000;

export interface ImportRow {
  name: string;
  email: string;
  phone: string | null;
}

export interface RowProblem {
  /** Spreadsheet line number (the header is line 1, so the first person is line 2). */
  line: number;
  reason: string;
}

/** Accepted header spellings per field, compared lowercase with spaces/underscores/dashes removed. */
const HEADER_ALIASES: Record<keyof ImportRow, readonly string[]> = {
  name: ["name", "fullname", "interpretername", "interpreter"],
  email: ["email", "emailaddress", "mail"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "telephone", "cell", "cellphone"],
};

const normalizeHeader = (header: string): string => header.replace(/^﻿/, "").toLowerCase().replace(/[\s_\-.]+/g, "");

/** Strips control characters (they can break emails and logs) and trims. */
const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").trim() : "");

/** One person as the server accepts them. The email is lowercased: it is the unique key. */
export const importRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200, "Name is too long."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required.")
    .max(254, "Email is too long.")
    .email("Email is not valid."),
  phone: z
    .string()
    .trim()
    .max(40, "Phone is too long.")
    .nullish()
    .transform((v) => (v ? v : null)),
});

/** Finds which CSV column holds each field. Null when a required column is missing. */
export function mapColumns(headers: readonly string[]): { name: string; email: string; phone: string | null } | null {
  const find = (field: keyof ImportRow): string | null =>
    headers.find((h) => HEADER_ALIASES[field].includes(normalizeHeader(h))) ?? null;
  const name = find("name");
  const email = find("email");
  return name && email ? { name, email, phone: find("phone") } : null;
}

export interface ValidatedImport {
  rows: ImportRow[];
  problems: RowProblem[];
  /** Rows dropped because the same email appeared earlier in the file. */
  duplicatesInFile: number;
}

/**
 * Validates parsed CSV records: Name and Email must be present and valid on every row. Rows that are blank are
 * ignored, bad rows are reported with their line number, and a repeated email keeps only its first row.
 */
export function validateImportRecords(
  records: readonly Record<string, unknown>[],
  columns: { name: string; email: string; phone: string | null },
): ValidatedImport {
  const rows: ImportRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;

  records.forEach((record, index) => {
    const line = index + 2;
    const raw = { name: clean(record[columns.name]), email: clean(record[columns.email]), phone: columns.phone ? clean(record[columns.phone]) : "" };
    if (!raw.name && !raw.email && !raw.phone) return; // blank line
    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push({ line, reason: parsed.error.issues[0]?.message ?? "Row is not valid." });
      return;
    }
    if (seen.has(parsed.data.email)) {
      duplicatesInFile += 1;
      return;
    }
    seen.add(parsed.data.email);
    rows.push(parsed.data);
  });

  return { rows, problems, duplicatesInFile };
}

/** The server's answer. Counts only: no names or emails are echoed back. */
export type BulkImportResponse =
  | {
      success: true;
      created: number;
      /** Emails that already belong to an interpreter; left exactly as they were. */
      skippedExisting: number;
      duplicatesInFile: number;
      invalid: RowProblem[];
    }
  | { success: false; error: string };
