export type DateFieldKey = "actualStart" | "actualEnd" | "travelStart" | "travelEnd";
export type DateFieldErrors = Partial<Record<DateFieldKey, string>>;

/** Phrases the submission actions use for date/time problems, in match order. */
const RULES: { test: string; field: DateFieldKey }[] = [
  { test: "valid travel start", field: "travelStart" },
  { test: "valid travel end", field: "travelEnd" },
  { test: "travel end must be after", field: "travelEnd" },
  { test: "both travel start and travel end", field: "travelEnd" },
  { test: "travel start cannot be after", field: "travelStart" },
  { test: "valid start time", field: "actualStart" },
  { test: "valid end time", field: "actualEnd" },
  { test: "end time must be after", field: "actualEnd" },
];

/**
 * Pure placement helper: decides which date input a validation message belongs under.
 * It never changes or creates rules; unrecognised messages stay as a form-level error.
 */
export const splitTimesheetError = (
  message: string,
): { fieldErrors: DateFieldErrors; formError: string | null } => {
  const lower = message.toLowerCase();
  const rule = RULES.find((r) => lower.includes(r.test));
  if (!rule) return { fieldErrors: {}, formError: message };
  return { fieldErrors: { [rule.field]: message }, formError: null };
};
