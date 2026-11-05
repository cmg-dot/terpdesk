import type { HearingIdentity } from "@/db/schema";
import { identityFromText, identityLabel, identityValue } from "@/lib/hearingIdentity";
import { joinSection5, otherBlockText, splitSection5, updateBlock, knownRow } from "@/lib/section5Notes";
import type { KnownRowLabel } from "@/lib/section5Notes";

/**
 * The request forms' newer fields, shared by "New request" and "Edit request": the room and floor, the state's Public and
 * Mixed Group answers, the requested interpreter, and the staff-only patient details (Section 5). This file turns a saved
 * job into form values and form values into the pieces of the save, so both forms behave the same and the pages stay small.
 * Pure.
 */

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === "object" && v !== null && !Array.isArray(v);
const asObject = (v: unknown): Loose => (isObject(v) ? v : {});
const text = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

export interface FormExtras {
  room: string;
  floor: string;
  isPublic: boolean;
  isMixedGroup: boolean;
  requestedInterpreter: string;
  providerOneNumber: string;
  clientGender: string;
  hearingIdentity: HearingIdentity | "";
  /** The lines of the saved Section 5 block that no field covers ("Interpreter Gender", "Comment", ...). */
  otherPatientInfo: string;
}

export const EMPTY_EXTRAS: FormExtras = {
  room: "",
  floor: "",
  isPublic: false,
  isMixedGroup: false,
  requestedInterpreter: "",
  providerOneNumber: "",
  clientGender: "",
  hearingIdentity: "",
  otherPatientInfo: "",
};

/**
 * The form's starting values for a saved job: the saved fields first, then what the state-form intake saved in the Section 5
 * block of the private notes. `generalNotes` is the notes box text without that block.
 */
export function extrasFromRequest(data: unknown, privateNotes: unknown): { extras: FormExtras; generalNotes: string } {
  const d = asObject(data);
  const intake = asObject(d.intake);
  const onsite = asObject(d.onsite);
  const brief = asObject(d.brief);
  const { general, block } = splitSection5(text(privateNotes));
  const fromBlock: Partial<Record<KnownRowLabel, string>> = {};
  for (const line of block?.lines ?? []) {
    const row = knownRow(line);
    if (row && row.value && !/^(n\/?a|none)$/i.test(row.value)) fromBlock[row.label] = row.value;
  }
  return {
    generalNotes: general,
    extras: {
      room: text(onsite.room),
      floor: text(onsite.floor),
      isPublic: intake.isPublic === true,
      isMixedGroup: intake.isMixedGroup === true,
      requestedInterpreter: text(intake.requestedInterpreter) || fromBlock["Specific Interpreter Requested"] || "",
      providerOneNumber: text(intake.providerOneNumber) || fromBlock["Provider One #"] || "",
      clientGender: text(intake.clientGender) || fromBlock.Gender || "",
      hearingIdentity: identityValue(brief.hearingIdentity) || identityFromText(fromBlock["Hearing Identity"] ?? ""),
      otherPatientInfo: otherBlockText(block),
    },
  };
}

export interface ExtrasPayload {
  onsite: { room: string; floor: string };
  intake: { isPublic: boolean; isMixedGroup: boolean; requestedInterpreter?: string; providerOneNumber?: string; clientGender?: string };
  /** Only the hearing identity: on create when one is chosen, on edit always (empty clears it). */
  brief: { hearingIdentity?: HearingIdentity | "" };
  /** The notes box text, with the saved Section 5 block put back (kept in step with the fields). */
  privateNotes: string;
}

/**
 * The pieces of a save. On "create" an empty field is simply left out. On "edit" an empty field is sent empty, so staff can
 * clear it. `existingPrivateNotes` is what is saved now: its Section 5 block is kept (its known rows updated to match the
 * fields, its other lines untouched) instead of being lost when the notes box no longer shows it.
 */
export function buildExtrasPayload(
  extras: FormExtras,
  generalNotes: string,
  existingPrivateNotes: string,
  mode: "create" | "edit",
): ExtrasPayload {
  const keep = (value: string): string | undefined => (mode === "edit" || value.trim() !== "" ? value.trim() : undefined);
  const { block } = splitSection5(existingPrivateNotes);
  const values: Partial<Record<KnownRowLabel, string>> = {
    "Provider One #": extras.providerOneNumber,
    Gender: extras.clientGender,
    "Hearing Identity": identityLabel(extras.hearingIdentity),
    "Specific Interpreter Requested": extras.requestedInterpreter,
  };
  const synced = block
    ? updateBlock(block, values, (label, saved, entered) => (label === "Hearing Identity" ? identityFromText(saved) === identityFromText(entered) : saved === entered), extras.otherPatientInfo)
    : null;
  return {
    onsite: { room: extras.room.trim(), floor: extras.floor.trim() },
    intake: {
      isPublic: extras.isPublic,
      isMixedGroup: extras.isMixedGroup,
      ...(keep(extras.requestedInterpreter) !== undefined ? { requestedInterpreter: keep(extras.requestedInterpreter) } : {}),
      ...(keep(extras.providerOneNumber) !== undefined ? { providerOneNumber: keep(extras.providerOneNumber) } : {}),
      ...(keep(extras.clientGender) !== undefined ? { clientGender: keep(extras.clientGender) } : {}),
    },
    brief: extras.hearingIdentity || mode === "edit" ? { hearingIdentity: extras.hearingIdentity } : {},
    privateNotes: joinSection5(generalNotes, synced),
  };
}
