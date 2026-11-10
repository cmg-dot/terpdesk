import { applyBillingMinimum, billingTierOf, formatHours } from "@/lib/billingMinimums";
import { serviceMinutesOf } from "@/lib/hoursReviewSummary";
import { realSetting } from "@/lib/settingLabel";
import { formatDateInZone, resolveJobZone, resolveRequestTimes } from "@/utils/timezone";
import type { VerificationPdfData } from "@/lib/verificationPdf/types";

/**
 * Turns a stored job and one position's hours into the values printed on the invoice. Pure: the loader fetches the facts
 * (names, signature bytes), this only formats them, so it can be tested without a database.
 */

type Loose = Record<string, unknown>;

export interface VerificationFacts {
  createdAt: Date | string | null;
  /** `requests.data`. */
  data: Loose;
  /** `requests.data.hoursSubmissions[position]`. */
  hours: Loose;
  interpreterName: string;
  /** The other interpreters booked on the job. */
  teamNames: string[];
  interpreterSignature: Uint8Array | null;
  onsite: { printedName: string; signedAt: string; signature: Uint8Array } | null;
}

const obj = (v: unknown): Loose => (v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : {});
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
/** formatDateInZone answers an em dash for what it cannot read; the invoice leaves that blank instead. */
const known = (formatted: string): string => (formatted === "—" ? "" : formatted);

export function buildVerificationPdfData(facts: VerificationFacts): VerificationPdfData {
  const { data, hours } = facts;
  const details = obj(data.details);
  const onsite = obj(data.onsite);
  const requester = obj(data.requester);
  const intake = obj(data.intake);
  const zone = resolveJobZone(data);
  const { startsAt, endsAt } = resolveRequestTimes({ createdAt: facts.createdAt, data });

  // Billed time: exactly what the hours-review screen shows (worked time raised to the tier's minimum). Billing is not changed here.
  const worked = serviceMinutesOf({ actualStart: text(hours.actualStartTime), actualEnd: text(hours.actualEndTime), breakMinutes: Number(hours.breakMinutes) || 0, timeZone: zone });
  const billed = Number.isFinite(worked) ? applyBillingMinimum(worked, billingTierOf({ program: text(intake.program), isStateJob: false })) : null;

  const miles = Number(hours.miles);
  const mileageNote = text(hours.mileageNote);
  const notes = [text(hours.note), mileageNote ? `Mileage: ${mileageNote}` : ""].filter(Boolean).join("\n");

  const format = text(details.format) || text(data.format);
  const platform = text(details.platform) || text(data.platform);
  const virtualOnly = /virtual/i.test(format) && !/hybrid/i.test(format);
  // Never the meeting link, id or passcode: this page is a billing record.
  const place = text(data.location) || [text(onsite.venue), text(onsite.address)].filter(Boolean).join(" · ");
  const location = virtualOnly ? (platform ? `Virtual (${platform})` : "Virtual") : place;

  const setting = realSetting(details.setting) || realSetting(data.setting);
  const purpose = text(details.purpose);
  const kind = [setting, format].filter(Boolean).join(" · ");
  const situation = [kind, purpose].filter(Boolean).join(" — ");

  const signoff = facts.onsite;
  return {
    dateOfService: known(formatDateInZone(startsAt, zone, "MM/dd/yyyy")),
    contact: text(onsite.contact) || text(requester.name),
    phone: text(onsite.contactMethod) || text(requester.phone),
    interpreter: facts.interpreterName,
    team: facts.teamNames.join(", "),
    client: text(details.deafParticipant),
    location,
    situation,
    scheduledBegin: known(formatDateInZone(startsAt, zone, "h:mm a")),
    scheduledEnd: known(formatDateInZone(endsAt, zone, "h:mm a")),
    billedHours: billed ? formatHours(billed.billableHours) : "",
    mileage: Number.isFinite(miles) ? String(Math.round(miles * 10) / 10) : "",
    notes,
    interpreterSignature: facts.interpreterSignature,
    interpreterSignedDate: known(formatDateInZone(text(hours.submittedAt) || null, zone, "MM/dd/yyyy")),
    authorizedName: signoff?.printedName ?? "",
    authorizedSignature: signoff?.signature ?? null,
    authorizedDate: signoff ? known(formatDateInZone(signoff.signedAt, zone, "MM/dd/yyyy")) : "",
  };
}
