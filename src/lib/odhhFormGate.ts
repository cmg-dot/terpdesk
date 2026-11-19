import { normalizeEmailText } from "@/lib/odhhEmailText";

/**
 * Which mail that reached the Inbox may be read as the state's request form (the Inbox accepts mail from anyone, so this is the
 * gate before a job is created or filled in). Pure: the caller works out whether the sender is trusted.
 *
 *  - the state's own form: an SRN and the state's portal link for that same SRN (every ODHH form has one);
 *  - an Apple Health (HCA) form, which may come without that link: its own markers ("HCA Reference Number:" or the PATIENT
 *    INFORMATION section) and the form's numbered sections, from a Washington government address or a trusted sender;
 *  - a forward of the form whose link was lost on the way: the SRN and the form's numbered sections, from a trusted sender (the
 *    state, a registered agency user, or an address in STATE_VOID_TRUSTED_SENDERS).
 */

export type FormGate = "portal_link" | "hca_form" | "trusted_forward";

/** The state's portal link for this very SRN: every form it sends has one ("...servicerequest.aspx?id=202781026"). */
export const carriesStatePortalLink = (rawContent: string, srn: string): boolean =>
  new RegExp(`fortress\\.wa\\.gov/dshs/odhhapps/\\S*servicerequest\\.aspx\\?id=${srn}\\b`, "i").test(normalizeEmailText(rawContent));

const STANDARD_SECTIONS: readonly RegExp[] = [
  /^[ \t]*1[.)][ \t]*INTERPRETER[ \t]+AGENCY\b/m,
  /^[ \t]*2[.)][ \t]*ACCOUNT[ \t]+INFORMATION\b/m,
  /^[ \t]*3[.)][ \t]*APPOINTMENT[ \t]+INFORMATION\b/m,
  /^[ \t]*4[.)][ \t]*APPOINTMENT[ \t]+LOCATION\b/m,
];

/** At least three of the form's first four numbered section headings, each at the start of a line. */
export const hasStandardSections = (text: string): boolean => STANDARD_SECTIONS.filter((heading) => heading.test(text)).length >= 3;

/** The Apple Health (HCA) form's own markers. */
export const isHcaForm = (text: string): boolean =>
  /^[ \t]*HCA[ \t]+Reference[ \t]+Number[ \t]*:/im.test(text) || /^[ \t]*\d[.)][ \t]*PATIENT[ \t]+INFORMATION\b/m.test(text);

/** An address at a Washington State government domain ("@hca.wa.gov", "@dshs.wa.gov"). */
export const isWaGovSender = (senderEmail: string): boolean => {
  const domain = senderEmail.trim().toLowerCase().split("@")[1] ?? "";
  return domain === "wa.gov" || domain.endsWith(".wa.gov");
};

export interface FormGateInput {
  rawContent: string;
  srn: string | null;
  senderEmail: string;
  /** Asked only when the portal link is missing (it is a database look-up). */
  senderTrusted: () => Promise<boolean>;
}

/** Why the email may be read as the form, or null when it must be left in the Inbox for staff. */
export async function formGate(input: FormGateInput): Promise<FormGate | null> {
  if (!input.srn) return null;
  if (carriesStatePortalLink(input.rawContent, input.srn)) return "portal_link";
  const text = normalizeEmailText(input.rawContent);
  if (!hasStandardSections(text)) return null;
  const trusted = await input.senderTrusted();
  if (isHcaForm(text) && (trusted || isWaGovSender(input.senderEmail))) return "hca_form";
  return trusted ? "trusted_forward" : null;
}
