import { z } from "zod";
import { isStateJobRequest, isStateProgram } from "@/lib/stateJob";

/**
 * The on-site sign-off: for a non-state job the facility contact who was there authorizes the hours on the interpreter's
 * phone (printed name + a signature drawn on the screen), next to the interpreter's own signature.
 *
 * `requests.data.onsiteSignatureRequired` switches it on for a job. State jobs (ODHH and Apple Health / HCA) never use it:
 * their hours are reported in the state portal. A job with NO flag on file (everything created before this feature) is
 * treated as off, so a job already in progress is never blocked; the default of "on" is written when a job is created.
 *
 * Pure: no database or storage access, so the client forms and the server share one definition.
 */

interface FlagSource {
  isStateJob?: boolean | null;
  data?: unknown;
}

const flagOf = (data: unknown): unknown => (data && typeof data === "object" ? (data as { onsiteSignatureRequired?: unknown }).onsiteSignatureRequired : undefined);

/** Whether hours on this job need the on-site contact's sign-off. Always false for a state job. */
export const isOnsiteSignatureRequired = (job: FlagSource): boolean => !isStateJobRequest(job) && flagOf(job.data) === true;

/** The value a NEW job is created with: on for a non-state job, off for a state job. */
export const defaultOnsiteSignatureRequired = (program: string | null | undefined): boolean => !isStateProgram(program);

/** True once any interpreter's hours are on the job: from then on the setting no longer changes (it would not match what was signed). */
export const hasSubmittedHours = (data: unknown): boolean => {
  if (!data || typeof data !== "object") return false;
  const { hoursSubmissions, hoursSubmission } = data as { hoursSubmissions?: unknown; hoursSubmission?: unknown };
  const perPosition = hoursSubmissions && typeof hoursSubmissions === "object" ? Object.keys(hoursSubmissions).length > 0 : false;
  return perPosition || Boolean(hoursSubmission);
};

/**
 * The flag to store when an agency form is saved. A state job is always off. Otherwise a boolean the form sent wins, but only
 * while no hours are on the job; a job that has no flag yet and was just moved from a state program to a general one gets the
 * default. Anything else keeps what is on file.
 */
export function resolveOnsiteFlag(params: { sent: unknown; existing: unknown; isStateJob: boolean; wasStateJob: boolean; hoursSubmitted: boolean }): boolean | undefined {
  const { sent, existing, isStateJob, wasStateJob, hoursSubmitted } = params;
  if (isStateJob) return false;
  if (hoursSubmitted) return typeof existing === "boolean" ? existing : undefined;
  if (typeof sent === "boolean") return sent;
  if (typeof existing === "boolean") return existing;
  return wasStateJob ? true : undefined;
}

export const MAX_SIGNATURE_LENGTH = 400_000;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

/** What the browser sends for the on-site sign-off. Parsed again on the server, which never trusts the browser's "required". */
export const onsiteSignoffInputSchema = z.object({
  printedName: z.string().trim().min(2, "Enter the on-site contact's printed name.").max(100, "That name is too long."),
  signatureDataUrl: z.string().max(MAX_SIGNATURE_LENGTH, "The on-site signature is too large.").regex(PNG_DATA_URL, "The on-site contact's signature is required."),
});

export type OnsiteSignoffInput = z.infer<typeof onsiteSignoffInputSchema>;

/** The sign-off as stored on the hours record. The picture itself is in the private bucket; only its key is kept here. */
export interface OnsiteSignoff {
  printedName: string;
  signedAt: string;
  storageKey: string;
}

export const ONSITE_REQUIRED_MESSAGE = "This job needs the on-site contact's printed name and signature before hours can be submitted.";

/** What an interpreter's browser may see of a stored sign-off: the name and time, never the storage key. */
export type PublicOnsiteSignoff = Omit<OnsiteSignoff, "storageKey">;

export const asOnsiteSignoff = (value: unknown): OnsiteSignoff | null => {
  if (!value || typeof value !== "object") return null;
  const { printedName, signedAt, storageKey } = value as Record<string, unknown>;
  return typeof printedName === "string" && typeof signedAt === "string" && typeof storageKey === "string" ? { printedName, signedAt, storageKey } : null;
};

/** A copy of an hours record that is safe to send to the interpreter: the sign-off keeps its name and time but loses the storage key. */
export function withoutOnsiteKey<T extends Record<string, unknown> | null>(hours: T): T {
  if (!hours || !("onsiteSignoff" in hours)) return hours;
  const signoff = asOnsiteSignoff(hours.onsiteSignoff);
  const { onsiteSignoff: _drop, ...rest } = hours;
  return (signoff ? { ...rest, onsiteSignoff: { printedName: signoff.printedName, signedAt: signoff.signedAt } satisfies PublicOnsiteSignoff } : rest) as T;
}
